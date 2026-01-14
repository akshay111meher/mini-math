import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { setGlobalValue, getGlobalValue } from './utils/globalState.js'

// types.ts
export interface Value {
  outputData?: Record<string, unknown>
  data?: Record<string, unknown>
  variableName?: string
  variableValue?: string
}

export type GlobalStateType = Record<string, Value>

const VariableNodeConfigSchema = z.object({
  variableName: z.string(),
  variableValue: z.string(),
  valueType: z.string(),
})

type VariableNodeConfig = z.infer<typeof VariableNodeConfigSchema>

export class VariableNode extends BaseNode {
  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState, factory: string) {
    super(nodeDef, workflowGlobalStateRef, factory, 'VariableNode')
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const nodeConfig: VariableNodeConfig = VariableNodeConfigSchema.parse(raw)
    const { variableName, variableValue, valueType } = nodeConfig

    this.logger.debug(`Executing variable node ${this.nodeDef.id}`, {
      variableName,
      variableValue,
      valueType,
    })

    if (!variableName) {
      throw new Error('Variable node requires variable name')
    }

    const inputData = (await this.getNodeInputData()) as GlobalStateType
    const globalState = this.workflowGlobalState.getGlobalState<Record<string, unknown>>() ?? {}

    // Generic variables (like $now, $today in code nodes)
    const genericVars: Record<string, unknown> = {
      now: new Date().toISOString(),
      today: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
      random: Math.random(),
    }

    let resolvedValue = variableValue

    if (typeof variableValue === 'string' && variableValue.includes('${')) {
      resolvedValue = variableValue.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        const trimmedVarName = varName.trim()

        // Check generic variables first (now, today, timestamp, random)
        if (genericVars.hasOwnProperty(trimmedVarName)) {
          const value = genericVars[trimmedVarName]
          const resolved = typeof value === 'object' ? JSON.stringify(value) : String(value)
          this.logger.debug(`Resolved "${trimmedVarName}" from generic vars to: ${resolved}`)
          return resolved
        }

        // Then check global state (like $global.get('variableName'))
        const globalValue = getGlobalValue(globalState, trimmedVarName)
        if (globalValue !== undefined) {
          const resolved =
            typeof globalValue === 'object' ? JSON.stringify(globalValue) : String(globalValue)
          this.logger.debug(`Resolved "${trimmedVarName}" from global state to: ${resolved}`)
          return resolved
        }

        // Then check inputData
        if (inputData.hasOwnProperty(trimmedVarName)) {
          const value = inputData[trimmedVarName]
          const resolved = typeof value === 'object' ? JSON.stringify(value) : String(value)
          this.logger.debug(`Resolved "${trimmedVarName}" from inputData to: ${resolved}`)
          return resolved
        }

        this.logger.warn(
          `Variable "${trimmedVarName}" not found. Available in generic: ${Object.keys(genericVars).join(', ')}, in global: ${Object.keys(globalState).join(', ')}, in inputData: ${Object.keys(inputData).join(', ')}`,
        )
        return match // Keep original if not found
      })
    }

    if (typeof variableValue === 'string' && variableValue.startsWith('input.')) {
      const propertyPath = variableValue.substring(6) // Remove 'input.'
      const value = getNestedProperty(inputData, propertyPath)
      if (value !== undefined) {
        resolvedValue = value as string
      } else {
        this.logger.warn(
          `Property "${propertyPath}" not found in input data. Available: ${Object.keys(
            inputData,
          ).join(', ')}`,
        )
      }
    }

    this.logger.info(
      `Variable node ${this.nodeDef.id} resolved value from "${variableValue}" to: ${resolvedValue}`,
    )

    // Process value based on type
    let processedValue: string | number | boolean = resolvedValue

    switch (valueType) {
      case 'number':
        processedValue = Number(resolvedValue) || 0
        break
      case 'boolean':
        processedValue = String(resolvedValue).toLowerCase() === 'true'
        break
      case 'json':
        try {
          processedValue =
            typeof resolvedValue === 'string' ? JSON.parse(resolvedValue) : resolvedValue
        } catch {
          processedValue = resolvedValue
        }
        break
      default:
        // Keep as resolved value
        processedValue = resolvedValue
        break
    }

    const result = {
      type: 'variable',
      inputData,
      variableName,
      variableValue: processedValue,
      valueType,
      outputData: {
        ...inputData,
        [variableName]: processedValue,
      },
      timestamp: new Date().toISOString(),
    }

    const globalStateSnapshot =
      this.workflowGlobalState.getGlobalState<Record<string, unknown>>() ?? {}
    const workingGlobalState = JSON.parse(JSON.stringify(globalStateSnapshot)) as Record<
      string,
      unknown
    >
    const patch = setGlobalValue(workingGlobalState, variableName, processedValue)

    if (Object.keys(patch).length > 0) {
      this.workflowGlobalState.updatePartialState(patch, { deep: true })
    }

    this.logger.info(`Variable node ${this.nodeDef.id} result: ${JSON.stringify(result)}`)

    const out: Extract<OutputType, { type: 'json' }> = {
      id: uuidv4(),
      name: 'variable',
      type: 'json',
      value: result,
    }
    return [out]
  }

  private async getNodeInputData(): Promise<GlobalStateType | undefined> {
    const previousResults = this.workflowGlobalState.getGlobalState<GlobalStateType>() ?? {}

    this.logger.debug(
      `Getting input data for node ${this.nodeDef.id}. Previous results keys: ${Object.keys(previousResults).join(',')}`,
    )

    for (const [nodeId, result] of Object.entries(previousResults)) {
      this.logger.debug(`Processing result from node ${nodeId}: ${JSON.stringify(result, null, 2)}`)
      if (result) {
        // do stuff
        if (result.outputData) {
          this.logger.debug(`Node ${nodeId} has outputData: ${JSON.stringify(result.outputData)}`)
          this.workflowGlobalState.updatePartialState(result.outputData)
        } else if (result.data) {
          this.logger.debug(`Node ${nodeId} has data: ${JSON.stringify(result.data)}`)
          this.workflowGlobalState.updatePartialState(result.data)
        } else if (result.variableName && result.variableValue != undefined) {
          this.logger.debug(
            `Node ${nodeId} has variable: ${JSON.stringify({ variableName: result.variableName, variableValue: result.variableValue })}`,
          )
          this.workflowGlobalState.updatePartialState({
            variableName: result.variableName,
            variableValue: result.variableValue,
          })
        } else {
          this.logger.debug(`Node ${nodeId} merging result directly: ${JSON.stringify(result)}`)
          this.workflowGlobalState.updatePartialState({ result })
        }
      }
    }

    this.logger.debug(
      `Node ${this.nodeDef.id} final merged data is available as part of globalState`,
    )

    return this.workflowGlobalState.getGlobalState<GlobalStateType>()
  }
  protected async _cost(): Promise<bigint> {
    return BigInt(15)
  }
}

export function getNestedProperty<T extends Record<string, unknown>, R = unknown>(
  obj: T,
  path: string,
  fallback?: R,
): R | unknown {
  if (!path) return obj

  const keys = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

  let cur: unknown = obj
  for (const key of keys) {
    if (cur == null) return fallback as R

    if (Array.isArray(cur)) {
      const idx = Number(key)
      if (Number.isNaN(idx)) return fallback as R
      cur = (cur as unknown[])[idx]
      continue
    }

    if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[key]
      continue
    }

    return fallback as R
  }

  return cur === undefined ? (fallback as R) : cur
}
