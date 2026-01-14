import { deepClone } from '@mini-math/utils'
import { WorkflowDef } from './types.js'

type PlainObject = Record<string, unknown>

const PATH_TOKEN_REGEX = /[^.[\]]+|\[(?:([^"'[\]]+)|["']([^"'[\]]+)["'])\]/g

const isRecord = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const tokenizePath = (path: string): string[] => {
  if (!path) return []

  const tokens: string[] = []

  path.replace(PATH_TOKEN_REGEX, (segment, unquoted, quoted) => {
    tokens.push((unquoted ?? quoted ?? segment).replace(/^\[|\]$/g, ''))
    return ''
  })

  return tokens
}

const getGlobalValue = (globalState: PlainObject, path: string): unknown => {
  const tokens = tokenizePath(path)
  if (tokens.length === 0) {
    return globalState
  }

  let current: unknown = globalState

  for (const token of tokens) {
    if (!isRecord(current) || !(token in current)) {
      return undefined
    }
    current = current[token]
  }

  return current
}

const resolveVariablesInString = (raw: string, globalState: PlainObject): string => {
  if (typeof raw !== 'string' || !raw.includes('${')) return raw

  const genericVars: PlainObject = {
    now: new Date().toISOString(),
    today: new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    random: Math.random(),
  }

  return raw.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const trimmedVarName = varName.trim()

    // 1. Generic variables
    if (Object.prototype.hasOwnProperty.call(genericVars, trimmedVarName)) {
      const value = genericVars[trimmedVarName]
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
    }

    // 2. Global state (populated by previous nodes)
    const globalValue = getGlobalValue(globalState, trimmedVarName)
    if (typeof globalValue !== 'undefined') {
      return typeof globalValue === 'object' ? JSON.stringify(globalValue) : String(globalValue)
    }

    // 3. Leave as-is if unresolved
    return match
  })
}

const resolveVariablesInData = (data: unknown, globalState: PlainObject): unknown => {
  if (data === null || data === undefined) return data

  if (typeof data === 'string') {
    return resolveVariablesInString(data, globalState)
  }

  if (Array.isArray(data)) {
    return data.map((item) => resolveVariablesInData(item, globalState))
  }

  if (isRecord(data)) {
    const out: PlainObject = {}
    for (const [key, value] of Object.entries(data)) {
      out[key] = resolveVariablesInData(value, globalState)
    }
    return out
  }

  return data
}

export const resolveWorkflowResult = (wfDef: WorkflowDef): WorkflowDef => {
  const clone = deepClone(wfDef)
  const globalState = ((clone as unknown as { globalState?: PlainObject }).globalState ??
    {}) as PlainObject

  // Resolve placeholders across the entire cloned workflow definition
  const resolved = resolveVariablesInData(clone, globalState) as WorkflowDef
  return resolved
}
