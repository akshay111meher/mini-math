// postgresUpdateStore.ts
import { and, eq, sql } from 'drizzle-orm'
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { WorkflowCoreType } from '@mini-math/workflow'
import { ImageStore, WorkflowImageType } from '@mini-math/images'
import type { ListOptions, ListResult } from '@mini-math/utils'

import { workflowImages } from './db/schema/5_images.js'
import * as schema from './db/schema/5_images.js'
import { Pool } from 'pg'
import { makeLogger, Logger } from '@mini-math/logger'

type Db = NodePgDatabase<typeof schema>

export class PostgresImageStore extends ImageStore {
  private db!: Db
  private pool!: Pool
  private logger: Logger

  private readonly postgresUrl: string

  constructor(postgresUrl: string) {
    super()
    this.postgresUrl = postgresUrl
    this.logger = makeLogger('PostgresImageStore')
  }

  // in-memory counters to satisfy sync _count()
  private ownerCounts = new Map<string, number>()

  private handleError(method: string, err: unknown, context?: Record<string, unknown>): never {
    this.logger.error(
      JSON.stringify({
        err,
        method,
        ...context,
      }) + ' PostgresImageStore operation failed',
    )
    throw err
  }

  protected async initialize(): Promise<void> {
    try {
      this.logger.debug('Initializing')

      // 1) Create PG pool
      this.pool = new Pool({
        connectionString: this.postgresUrl,
      })

      // 2) Wrap pool in Drizzle
      this.db = drizzle(this.pool, { schema })

      // 3) Sanity check
      await this.db.execute(sql`select 1`)

      // 4) Preload counts (so sync _count() works)
      const rows = await this.db
        .select({
          ownerId: workflowImages.ownerId,
          count: sql<number>`count(*)`,
        })
        .from(workflowImages)
        .groupBy(workflowImages.ownerId)

      this.ownerCounts.clear()
      for (const r of rows) this.ownerCounts.set(r.ownerId, Number(r.count) || 0)

      this.logger.info('initialized successfully')
    } catch (err) {
      this.handleError('initialize', err, { postgresUrl: this.postgresUrl })
    }
  }

  protected async _create(
    ownerId: string,
    imageId: string,
    core: WorkflowCoreType,
    workflowName?: string,
  ): Promise<boolean> {
    try {
      const res = await this.db
        .insert(workflowImages)
        .values({
          ownerId,
          imageId,
          workflowName, // optional
          image: core,
        })
        .onConflictDoNothing()
        .returning({ ownerId: workflowImages.ownerId })

      if (res.length > 0) {
        this.ownerCounts.set(ownerId, (this.ownerCounts.get(ownerId) ?? 0) + 1)
        return true
      }

      return false
    } catch (err) {
      this.handleError('_create', err, { ownerId, imageId })
    }
  }

  protected async _get(ownerId: string, imageId: string): Promise<WorkflowCoreType | undefined> {
    try {
      const [row] = await this.db
        .select({
          image: workflowImages.image,
        })
        .from(workflowImages)
        .where(and(eq(workflowImages.ownerId, ownerId), eq(workflowImages.imageId, imageId)))
        .limit(1)

      return row?.image
    } catch (err) {
      this.handleError('_get', err, { ownerId, imageId })
    }
  }

  protected async _update(
    ownerId: string,
    imageId: string,
    patch: Partial<WorkflowCoreType>,
    workflowName?: string,
  ): Promise<boolean> {
    try {
      const [row] = await this.db
        .select({
          image: workflowImages.image,
          workflowName: workflowImages.workflowName,
        })
        .from(workflowImages)
        .where(and(eq(workflowImages.ownerId, ownerId), eq(workflowImages.imageId, imageId)))
        .limit(1)

      if (!row) return false

      const updatedImage: WorkflowCoreType = { ...row.image, ...patch }

      const updateSet =
        workflowName === undefined ? { image: updatedImage } : { image: updatedImage, workflowName }

      const res = await this.db
        .update(workflowImages)
        .set(updateSet)
        .where(and(eq(workflowImages.ownerId, ownerId), eq(workflowImages.imageId, imageId)))
        .returning({ ownerId: workflowImages.ownerId })

      return res.length > 0
    } catch (err) {
      this.handleError('_update', err, { ownerId, imageId })
    }
  }

  protected async _exists(ownerId: string, imageId: string): Promise<boolean> {
    try {
      const [row] = await this.db
        .select({ ownerId: workflowImages.ownerId })
        .from(workflowImages)
        .where(and(eq(workflowImages.ownerId, ownerId), eq(workflowImages.imageId, imageId)))
        .limit(1)

      return !!row
    } catch (err) {
      this.handleError('_exists', err, { ownerId, imageId })
    }
  }

  protected async _delete(ownerId: string, imageId: string): Promise<boolean> {
    try {
      const res = await this.db
        .delete(workflowImages)
        .where(and(eq(workflowImages.ownerId, ownerId), eq(workflowImages.imageId, imageId)))
        .returning({ ownerId: workflowImages.ownerId })

      if (res.length > 0) {
        const current = this.ownerCounts.get(ownerId) ?? 0
        this.ownerCounts.set(ownerId, Math.max(0, current - 1))
        return true
      }

      return false
    } catch (err) {
      this.handleError('_delete', err, { ownerId, imageId })
    }
  }

  protected async _list(options?: ListOptions): Promise<ListResult<WorkflowImageType>> {
    try {
      const cursor = options?.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0
      const limit = options?.limit ?? 50

      const totalRows = await this.db.select({ value: sql<number>`count(*)` }).from(workflowImages)
      const total = Number(totalRows[0]?.value ?? 0)

      const rows = await this.db
        .select({
          imageId: workflowImages.imageId,
          workflowName: workflowImages.workflowName,
          image: workflowImages.image,
        })
        .from(workflowImages)
        .offset(cursor)
        .limit(limit)

      const items: WorkflowImageType[] = rows.map((r) => ({
        imageId: r.imageId,
        workflowName: r.workflowName ?? undefined,
        image: r.image,
      }))

      const nextCursor = cursor + limit < total ? String(cursor + limit) : undefined
      return { items, nextCursor }
    } catch (err) {
      this.handleError('_list', err, {})
    }
  }

  protected _count(ownerId: string): number {
    return this.ownerCounts.get(ownerId) ?? 0
  }
}
