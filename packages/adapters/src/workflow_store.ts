import {
  BatchCreateRequest,
  NextLinkedWorkflowType,
  WorkflowCoreType,
  WorkflowDef,
  WorkflowRefType,
  WorkflowStore,
} from '@mini-math/workflow'

import { ListOptions, ListResult } from '@mini-math/utils'

import { sql, eq } from 'drizzle-orm'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './db/schema/4_workflow.js'
import { workflows } from './db/schema/4_workflow.js'
import { makeLogger, Logger } from '@mini-math/logger'

type Db = NodePgDatabase<typeof schema>
type WorkflowInsert = typeof workflows.$inferInsert
type WorkflowRow = typeof workflows.$inferSelect

export class PostgresWorkflowstore extends WorkflowStore {
  private db!: Db
  private pool!: Pool
  private logger: Logger

  private readonly postgresUrl: string

  constructor(postgresUrl: string, loggerName: string = 'PostgresWorkflowStore') {
    super()
    this.postgresUrl = postgresUrl
    this.logger = makeLogger(loggerName)
  }

  private handleError(method: string, err: unknown, context?: Record<string, unknown>): never {
    this.logger.error(
      JSON.stringify({
        err,
        method,
        ...context,
      }) + ' PostgresWorkflowStore operation failed',
    )
    throw err
  }

  protected async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing')
      // 1. Create PG pool
      this.pool = new Pool({
        connectionString: this.postgresUrl,
      })

      // 2. Wrap pool in Drizzle
      this.db = drizzle(this.pool, {
        schema,
      })

      // 3. Optional sanity check – ensure DB is reachable
      await this.db.execute(sql`select 1`)
      this.logger.info('initialized successfully')
    } catch (err) {
      this.handleError('initialize', err, { postgresUrl: this.postgresUrl })
    }
  }

  protected async _create(
    workflowId: string,
    core: WorkflowCoreType,
    owner: string,
    options: {
      previousLinkedWorkflow?: WorkflowRefType
      nextLinkedWorkflow?: NextLinkedWorkflowType
    } = {},
  ): Promise<WorkflowDef> {
    const insert = coreToInsert(workflowId, core, owner, options)

    this.logger.trace(`trying to create workflow with id ${workflowId}`)

    try {
      const [row] = await this.db.insert(workflows).values(insert).returning()

      this.logger.trace(`inserted workflow with id ${workflowId} into database`)

      return rowToDef(row)
    } catch (err) {
      this.handleError('_create', err, { workflowId, insert })
    }
  }

  protected async _get(workflowId: string): Promise<WorkflowDef> {
    try {
      const row = await this.db.query.workflows.findFirst({
        where: eq(workflows.id, workflowId),
      })

      if (!row) {
        throw new Error(`Workflow ${workflowId} not found`)
      }

      return rowToDef(row)
    } catch (err) {
      this.handleError('_get', err, { workflowId })
    }
  }

  protected async _update(workflowId: string, patch: Partial<WorkflowDef>): Promise<WorkflowDef> {
    try {
      const update: Partial<WorkflowInsert> = {}

      if ('owner' in patch && patch.owner !== undefined) {
        update.owner = patch.owner
      }
      if ('name' in patch) {
        update.name = patch.name === undefined ? undefined : (patch.name ?? null)
      }

      if ('version' in patch && patch.version !== undefined) {
        update.version = patch.version
      }
      if ('nodes' in patch && patch.nodes !== undefined) {
        update.nodes = patch.nodes
      }
      if ('edges' in patch && patch.edges !== undefined) {
        update.edges = patch.edges
      }
      if ('entry' in patch && patch.entry !== undefined) {
        update.entry = patch.entry
      }
      if ('globalState' in patch) {
        update.globalState = patch.globalState === undefined ? null : (patch.globalState as unknown)
      }

      if ('lock' in patch) {
        update.lock = patch.lock === undefined ? null : patch.lock
      }

      if ('inProgress' in patch && patch.inProgress !== undefined) {
        update.inProgress = patch.inProgress
      }

      if ('isInitiated' in patch && patch.isInitiated !== undefined) {
        update.isInitiated = patch.isInitiated
      }

      if ('expectingInputFor' in patch) {
        update.expectingInputFor =
          patch.expectingInputFor === undefined ? null : patch.expectingInputFor
      }

      if ('externalInputStorage' in patch) {
        update.externalInputStorage =
          patch.externalInputStorage === undefined ? null : patch.externalInputStorage
      }

      if ('previousLinkedWorkflow' in patch) {
        update.previousLinkedWorkflow =
          patch.previousLinkedWorkflow === undefined ? null : patch.previousLinkedWorkflow
      }

      if ('nextLinkedWorkflow' in patch) {
        update.nextLinkedWorkflow =
          patch.nextLinkedWorkflow === undefined ? null : patch.nextLinkedWorkflow
      }

      if ('webhookUrl' in patch) {
        update.webhookUrl = patch.webhookUrl === undefined ? undefined : (patch.webhookUrl ?? null)
      }

      if (Object.keys(update).length === 0) {
        // nothing to update, just return the current value
        return this._get(workflowId)
      }

      const [row] = await this.db
        .update(workflows)
        .set({
          ...update,
          // DB-level timestamp
          updatedAt: sql`now()`,
        })
        .where(eq(workflows.id, workflowId))
        .returning()

      if (!row) {
        throw new Error(`Workflow ${workflowId} not found`)
      }

      return rowToDef(row)
    } catch (err) {
      this.handleError('_update', err, { workflowId, patch })
    }
  }

  protected async _exists(workflowId: string): Promise<boolean> {
    try {
      const row = await this.db
        .select({ id: workflows.id })
        .from(workflows)
        .where(eq(workflows.id, workflowId))
        .limit(1)

      return row.length > 0
    } catch (err) {
      this.handleError('_exists', err, { workflowId })
    }
  }

  protected async _delete(workflowId: string): Promise<void> {
    try {
      await this.db.delete(workflows).where(eq(workflows.id, workflowId))
    } catch (err) {
      this.handleError('_delete', err, { workflowId })
    }
  }

  protected async _list(owner: string, options?: ListOptions): Promise<ListResult<WorkflowDef>> {
    try {
      const limit = options?.limit ?? 50

      // simple cursor = numeric offset, encoded as string
      const offset = options?.cursor ? Number(options.cursor) : 0

      // main page query
      const itemsQuery = this.db
        .select()
        .from(workflows)
        .where(eq(workflows.owner, owner))
        .limit(limit)
        .offset(offset)
        .orderBy(workflows.updatedAt)

      // total count (for pagination / nextCursor decision)
      const countQuery = this.db.select({ count: sql<number>`count(*)` }).from(workflows)

      const [rows, [countRow]] = await Promise.all([itemsQuery, countQuery])

      const items = rows.map(rowToDef)
      const total = Number(countRow.count)

      const nextOffset = offset + limit
      const nextCursor = nextOffset < total ? String(nextOffset) : undefined

      const result: ListResult<WorkflowDef> = {
        items,
        nextCursor,
      }

      return result
    } catch (err) {
      this.handleError('_list', err, { options })
    }
  }

  protected async _createBatchOrNone(request: BatchCreateRequest): Promise<WorkflowDef[]> {
    class BatchCreateOrNoneConflict extends Error {
      constructor(message: string) {
        super(message)
        this.name = 'BatchCreateOrNoneConflict'
      }
    }

    try {
      const inserts = request.map((r) =>
        coreToInsert(r.workflowId, r.core, r.owner, r.options ?? {}),
      )

      // Transaction guarantees: either all rows appear, or none do.
      const rows = await this.db.transaction(async (tx) => {
        const insertedRows = await tx
          .insert(workflows)
          .values(inserts)
          .onConflictDoNothing({ target: workflows.id })
          .returning()

        // If any conflicted, Postgres returns fewer rows -> rollback by throwing.
        if (insertedRows.length !== inserts.length) {
          throw new BatchCreateOrNoneConflict(
            `Batch create aborted: expected ${inserts.length} inserts, got ${insertedRows.length}`,
          )
        }

        return insertedRows
      })

      // Preserve request order explicitly (don’t trust DB returning order forever)
      const byId = new Map(rows.map((r) => [r.id, r]))
      return request.map((r) => {
        const row = byId.get(r.workflowId)
        if (!row) {
          // Should be impossible given the length check, but keep it airtight.
          throw new Error(`Batch create invariant violated: missing row for ${r.workflowId}`)
        }
        return rowToDef(row)
      })
    } catch (err) {
      // "Or none": conflict/duplicate => return empty list (no partial success)
      if (err instanceof Error && err.name === 'BatchCreateOrNoneConflict') {
        this.logger.debug(
          JSON.stringify({ method: '_createBatchOrNone', reason: err.message }) +
            ' batch create returned none',
        )
        return []
      }

      this.handleError('_createBatchOrNone', err, {
        batchSize: request.length,
        workflowIds: request.map((r) => r.workflowId),
      })
    }
  }

  protected async _replace(workflowId: string, def: WorkflowDef): Promise<WorkflowDef> {
    try {
      const insert: WorkflowInsert = {
        id: workflowId,
        owner: def.owner,
        name: def.name ?? null,
        version: def.version,
        nodes: def.nodes,
        edges: def.edges,
        entry: def.entry,
        globalState: def.globalState === undefined ? null : (def.globalState as unknown),

        lock: def.lock === undefined ? null : def.lock,
        inProgress: def.inProgress === undefined ? false : def.inProgress,
        isInitiated: def.isInitiated === undefined ? false : def.isInitiated,
        expectingInputFor: def.expectingInputFor === undefined ? null : def.expectingInputFor,
        externalInputStorage:
          def.externalInputStorage === undefined ? null : def.externalInputStorage,
      }

      const [row] = await this.db
        .insert(workflows)
        .values(insert)
        .onConflictDoUpdate({
          target: workflows.id,
          set: {
            owner: insert.owner,
            name: insert.name,
            version: insert.version,
            nodes: insert.nodes,
            edges: insert.edges,
            entry: insert.entry,
            globalState: insert.globalState,

            lock: insert.lock,
            inProgress: insert.inProgress,
            isInitiated: insert.isInitiated,
            expectingInputFor: insert.expectingInputFor,
            externalInputStorage: insert.externalInputStorage,

            updatedAt: sql`now()`,
          },
        })
        .returning()

      return rowToDef(row)
    } catch (err) {
      this.handleError('_replace', err, { workflowId, def })
    }
  }
}

function coreToInsert(
  workflowId: string,
  core: WorkflowCoreType,
  owner: string,
  options: {
    previousLinkedWorkflow?: WorkflowRefType
    nextLinkedWorkflow?: NextLinkedWorkflowType
  } = {},
): WorkflowInsert {
  return {
    id: workflowId,
    owner,
    name: core.name ?? null,
    version: core.version,
    nodes: core.nodes,
    edges: core.edges,
    entry: core.entry,
    globalState: core.globalState === undefined ? null : (core.globalState as unknown),
    webhookUrl: core.webhookUrl ?? null,
    previousLinkedWorkflow: options?.previousLinkedWorkflow ?? null,
    nextLinkedWorkflow: options?.nextLinkedWorkflow ?? null,
  }
}

function rowToDef(row: WorkflowRow): WorkflowDef {
  // Adjust this mapping if WorkflowDef has different shape
  return {
    id: row.id,
    owner: row.owner,
    name: row.name ?? undefined,
    version: row.version,
    nodes: row.nodes,
    edges: row.edges,
    entry: row.entry,
    globalState:
      row.globalState === null || row.globalState === undefined ? undefined : row.globalState,
    webhookUrl:
      row.webhookUrl === null || row.webhookUrl === undefined ? undefined : row.webhookUrl,

    lock: row.lock === null || row.lock === undefined ? undefined : row.lock,

    inProgress:
      row.inProgress === null || row.inProgress === undefined ? undefined : row.inProgress,

    isInitiated:
      row.isInitiated === null || row.isInitiated === undefined ? undefined : row.isInitiated,

    expectingInputFor:
      row.expectingInputFor === null || row.expectingInputFor === undefined
        ? undefined
        : row.expectingInputFor,

    externalInputStorage:
      row.externalInputStorage === null || row.externalInputStorage === undefined
        ? undefined
        : row.externalInputStorage,

    previousLinkedWorkflow:
      row.previousLinkedWorkflow === null || row.previousLinkedWorkflow === undefined
        ? undefined
        : row.previousLinkedWorkflow,

    nextLinkedWorkflow:
      row.nextLinkedWorkflow === null || row.nextLinkedWorkflow === undefined
        ? undefined
        : row.nextLinkedWorkflow,

    // if WorkflowDef carries timestamps, this matches that shape
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as WorkflowDef
}
