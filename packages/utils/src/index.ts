export const add = (a: number, b: number) => a + b
export const mul = (a: number, b: number) => a * b

export const WORKFLOW_CONSTANTS = {
  DEFAULT_TIMEOUT_MS: 60000,
  MAX_PARALLEL: 16,
}

// export const deepClone = <T>(x: T): T => {
//   // Use native deep clone when available
//   try {
//     // @ts-ignore - Node/TS may not have the type yet
//     if (typeof structuredClone === 'function') return structuredClone(x)
//   } catch {}
//   // Fallback for plain data (works for your JSON-shaped defs)
//   return JSON.parse(JSON.stringify(x))
// }

export const deepClone = <T>(x: T): T => {
  return JSON.parse(JSON.stringify(x))
}
