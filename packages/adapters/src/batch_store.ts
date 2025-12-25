// packages/adapters/src/stores/postgresBatchStore.ts
import { eq, and, sql } from 'drizzle-orm'
import type { ListOptions, ListResult } from '@mini-math/utils'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { makeLogger, Logger } from '@mini-math/logger'

import {
  BatchStore,
  type WorkflowBatchType,
  WorkflowStore,
  WorkflowRefType,
} from '@mini-math/workflow'

import { workflowBatches, workflowBatchWorkflows } from './db/schema/7_batch_store.js'
import * as schema from './db/schema/7_batch_store.js'

import { PostgresWorkflowstore } from './workflow_store.js'
import { RuntimeStore } from '@mini-math/runtime'
import { PostgresRuntimeStore } from './runtime_store.js'

type Db = NodePgDatabase<typeof schema>

export class PostgresBatchStore extends BatchStore {
  public workflowStore: WorkflowStore
  public runtimeStore: RuntimeStore

  private db!: Db
  private pool!: Pool
  private logger: Logger

  private readonly postgresUrl: string

  constructor(postgresUrl: string) {
    super()
    this.postgresUrl = postgresUrl
    this.workflowStore = new PostgresWorkflowstore(
      postgresUrl,
      'PostgresWorkflowStoreForBatchStore',
    )
    this.runtimeStore = new PostgresRuntimeStore(postgresUrl, 'PostgresRuntimeStoreForBatchStore')
    this.logger = makeLogger('PostgresBatchStore')
  }

  private handleError(method: string, err: unknown, context?: Record<string, unknown>): never {
    this.logger.error(
      JSON.stringify({
        err,
        method,
        ...context,
      }) + ' PostgresBatchStore operation failed',
    )
    throw err
  }

  protected async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing')
      this.pool = new Pool({ connectionString: this.postgresUrl })

      this.db = drizzle(this.pool, { schema })

      await this.db.execute(sql`select 1`)
      this.logger.info('initialized successfully')
    } catch (err) {
      this.handleError('initialize', err, { postgresUrl: this.postgresUrl })
    }
  }

  /**
   * NOTE: Your abstract signature passes cores, not workflowIds.
   * This implementation stores membership as indices ["0","1",...].
   *
   * When you later pass real workflowIds, just switch this to insert those IDs.
   */
  protected async _create(
    owner: string,
    batchId: string,
    workflowRefs: WorkflowRefType[],
  ): Promise<boolean> {
    try {
      // Use a transaction so batch row + membership rows are consistent.
      return await this.db.transaction(async (tx) => {
        // 1) Create the batch row (idempotent)
        const inserted = await tx
          .insert(workflowBatches)
          .values({ owner, batchId })
          .onConflictDoNothing()
          .returning({ batchId: workflowBatches.batchId })

        if (inserted.length === 0) return false // already existed

        // 2) Insert membership rows (index mapping)
        if (workflowRefs.length > 0) {
          const membership = workflowRefs.map((a) => ({
            owner,
            batchId,
            workflowId: a,
          }))

          await tx.insert(workflowBatchWorkflows).values(membership).onConflictDoNothing() // protect against dupes if retried
        }

        return true
      })
    } catch (err) {
      this.handleError('_create', err, { owner, batchId, n: workflowRefs.length })
    }
  }

  protected async _get(owner: string, batchId: string): Promise<string[] | undefined> {
    try {
      // Ensure batch exists (optional but avoids returning [] for missing)
      const [b] = await this.db
        .select({ batchId: workflowBatches.batchId })
        .from(workflowBatches)
        .where(and(eq(workflowBatches.owner, owner), eq(workflowBatches.batchId, batchId)))
        .limit(1)

      if (!b) return undefined

      const rows = await this.db
        .select({ workflowId: workflowBatchWorkflows.workflowId })
        .from(workflowBatchWorkflows)
        .where(
          and(eq(workflowBatchWorkflows.owner, owner), eq(workflowBatchWorkflows.batchId, batchId)),
        )

      // deterministic ordering (helpful for tests)
      const ids = rows.map((r) => r.workflowId).sort((a, b) => a.localeCompare(b))
      return ids
    } catch (err) {
      this.handleError('_get', err, { owner, batchId })
    }
  }

  protected async _set(owner: string, batchId: string, workflowIds: string[]): Promise<boolean> {
    try {
      return await this.db.transaction(async (tx) => {
        const [b] = await tx
          .select({ batchId: workflowBatches.batchId })
          .from(workflowBatches)
          .where(and(eq(workflowBatches.owner, owner), eq(workflowBatches.batchId, batchId)))
          .limit(1)

        if (!b) return false

        // wipe + reinsert is simplest (and fine at this stage)
        await tx
          .delete(workflowBatchWorkflows)
          .where(
            and(
              eq(workflowBatchWorkflows.owner, owner),
              eq(workflowBatchWorkflows.batchId, batchId),
            ),
          )

        if (workflowIds.length > 0) {
          const membership = workflowIds.map((workflowId) => ({ owner, batchId, workflowId }))
          await tx.insert(workflowBatchWorkflows).values(membership).onConflictDoNothing()
        }

        // touch updated_at
        await tx
          .update(workflowBatches)
          .set({ updatedAt: sql`now()` })
          .where(and(eq(workflowBatches.owner, owner), eq(workflowBatches.batchId, batchId)))

        return true
      })
    } catch (err) {
      this.handleError('_set', err, { owner, batchId, n: workflowIds.length })
    }
  }

  protected async _exists(owner: string, batchId: string): Promise<boolean> {
    try {
      const [row] = await this.db
        .select({ batchId: workflowBatches.batchId })
        .from(workflowBatches)
        .where(and(eq(workflowBatches.owner, owner), eq(workflowBatches.batchId, batchId)))
        .limit(1)

      return !!row
    } catch (err) {
      this.handleError('_exists', err, { owner, batchId })
    }
  }

  protected async _delete(owner: string, batchId: string): Promise<boolean> {
    try {
      return await this.db.transaction(async (tx) => {
        // delete memberships first (no FK anyway, but keeps it tidy)
        await tx
          .delete(workflowBatchWorkflows)
          .where(
            and(
              eq(workflowBatchWorkflows.owner, owner),
              eq(workflowBatchWorkflows.batchId, batchId),
            ),
          )

        const res = await tx
          .delete(workflowBatches)
          .where(and(eq(workflowBatches.owner, owner), eq(workflowBatches.batchId, batchId)))
          .returning({ batchId: workflowBatches.batchId })

        return res.length > 0
      })
    } catch (err) {
      this.handleError('_delete', err, { owner, batchId })
    }
  }

  protected async _list(
    owner: string,
    options?: ListOptions,
  ): Promise<ListResult<WorkflowBatchType>> {
    try {
      const cursor = options?.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0
      const limit = options?.limit ?? 50

      const totalRows = await this.db
        .select({ value: sql<number>`count(*)` })
        .from(workflowBatches)
        .where(eq(workflowBatches.owner, owner))

      const total = totalRows[0]?.value ?? 0

      const batches = await this.db
        .select({
          owner: workflowBatches.owner,
          batchId: workflowBatches.batchId,
        })
        .from(workflowBatches)
        .where(eq(workflowBatches.owner, owner))
        .orderBy(workflowBatches.batchId)
        .offset(cursor)
        .limit(limit)

      if (batches.length === 0) {
        return { items: [], nextCursor: undefined }
      }

      // Fetch memberships for the page in one query.
      // We filter by (owner,batchId) using a tuple IN.
      const tuples = batches.map((b) => sql`(${b.owner}, ${b.batchId})`)
      const membershipRows = await this.db.execute<{
        owner: string
        batch_id: string
        workflow_id: string
      }>(sql`
        select owner, batch_id, workflow_id
        from ${workflowBatchWorkflows}
        where (owner, batch_id) in (${sql.join(tuples, sql`, `)})
      `)

      // group
      const map = new Map<string, string[]>()
      for (const b of batches) map.set(`${b.owner}:${b.batchId}`, [])

      for (const r of membershipRows.rows) {
        const k = `${r.owner}:${r.batch_id}`
        const arr = map.get(k)
        if (arr) arr.push(r.workflow_id)
      }

      const items: WorkflowBatchType[] = batches.map((b) => {
        const ids = map.get(`${b.owner}:${b.batchId}`) ?? []
        ids.sort((a, b) => a.localeCompare(b))
        return { owner: b.owner, batchId: b.batchId, workflowIds: ids }
      })

      const nextCursor = cursor + limit < total ? String(cursor + limit) : undefined
      return { items, nextCursor }
    } catch (err) {
      this.handleError('_list', err, { owner, options })
    }
  }

  protected async _count(owner: string): Promise<number> {
    try {
      const rows = await this.db
        .select({ value: sql<number>`count(*)` })
        .from(workflowBatches)
        .where(eq(workflowBatches.owner, owner))

      return rows[0]?.value ?? 0
    } catch (err) {
      this.handleError('_count', err, { owner })
    }
  }
}
