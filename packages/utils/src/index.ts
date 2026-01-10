import { z } from 'zod'
export const add = (a: number, b: number) => a + b
export const mul = (a: number, b: number) => a * b

export const WORKFLOW_CONSTANTS = {
  DEFAULT_TIMEOUT_MS: 60000,
  MAX_PARALLEL: 16,
  MAX_EXECUTION_UNITS_PER_CLOCK: 10000,
}

export const COST = {
  IMAGE_STORAGE_COST_IN_CREDITS: 10,
}

export const deepClone = <T>(x: T): T => {
  // Use native deep clone when available
  try {
    if (typeof structuredClone === 'function') return structuredClone(x)
  } catch {}
  // Fallback for plain data (works for your JSON-shaped defs)
  return JSON.parse(JSON.stringify(x))
}

// export const deepClone = <T>(x: T): T => {
//   return JSON.parse(JSON.stringify(x))
// }

export const ListOptionsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().positive().optional(),
})
export type ListOptions = z.infer<typeof ListOptionsSchema>

export const makeListResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().optional(),
  })

// If you want a reusable generic TS type:
export type ListResult<T> = {
  items: T[]
  nextCursor?: string
}

export type Mapper<T, R> = (item: T, index: number) => Promise<R> | R

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: Mapper<T, R>,
): Promise<R[]> {
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`limit must be > 0, got ${limit}`)
  }

  const results = new Array<R>(items.length)
  let next = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await mapper(items[i], i)
    }
  }

  const workers = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}

export type Task<R> = () => Promise<R> | R

export async function allLimit<R>(tasks: readonly Task<R>[], limit: number): Promise<R[]> {
  return mapLimit(tasks, limit, (task) => task())
}
