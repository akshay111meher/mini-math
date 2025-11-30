import {
  BaseNode,
  OutputType,
  NodeDefType,
  WorkflowGlobalState,
  ExecutionResult,
} from '@mini-math/nodes'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { getGlobalValue } from './utils/globalState.js'
import { mergeInputs } from './utils/globalState.js'

const IfElseNodeConfigSchema = z.object({
  leftPath: z.string(),
  operator: z.enum([
    'equals',
    'notEquals',
    'greaterThan',
    'greaterOrEqual',
    'lessThan',
    'lessOrEqual',
    'contains',
  ]),
  rightValue: z.string(),
  resultVariableName: z.string().optional().default('conditionResult'),
})

type IfElseNodeConfig = z.infer<typeof IfElseNodeConfigSchema>

const resolvePath = (
  path: string,
  inputData: Record<string, unknown>,
  globalState: Record<string, unknown>,
): unknown => {
  if (!path || path.trim() === '') {
    return undefined
  }

  const trimmedPath = path.trim()

  if (trimmedPath.startsWith('$global.get(') && trimmedPath.endsWith(')')) {
    const innerPath = trimmedPath.slice(12, -1).replace(/^["']|["']$/g, '')
    return getGlobalValue(globalState, innerPath)
  }

  if (trimmedPath.startsWith('$global.')) {
    const innerPath = trimmedPath.slice(8)
    return getGlobalValue(globalState, innerPath)
  }

  if (trimmedPath.startsWith('$item.') || trimmedPath.startsWith('$items[0].')) {
    const propertyPath = trimmedPath.includes('$item.')
      ? trimmedPath.slice(6)
      : trimmedPath.slice(10)
    return resolveNestedPath(inputData, propertyPath)
  }

  if (getGlobalValue(globalState, trimmedPath) !== undefined) {
    return getGlobalValue(globalState, trimmedPath)
  }

  if (trimmedPath in inputData) {
    return inputData[trimmedPath]
  }

  const nestedValue = resolveNestedPath(inputData, trimmedPath)
  if (nestedValue !== undefined) {
    return nestedValue
  }

  if (!isNaN(Number(trimmedPath)) && trimmedPath !== '') {
    return Number(trimmedPath)
  }

  return trimmedPath
}

const resolveNestedPath = (obj: Record<string, unknown>, path: string): unknown => {
  if (!path) return obj

  const tokens = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)

  let current: unknown = obj
  for (const token of tokens) {
    if (current == null) return undefined
    if (Array.isArray(current)) {
      const idx = Number(token)
      if (Number.isNaN(idx)) return undefined
      current = (current as unknown[])[idx]
      continue
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[token]
      continue
    }
    return undefined
  }

  return current
}

const evaluateCondition = (
  leftValue: unknown,
  operator: IfElseNodeConfig['operator'],
  rightValue: string,
): boolean => {
  const rightNum = Number(rightValue)
  const leftNum = typeof leftValue === 'number' ? leftValue : Number(leftValue)

  switch (operator) {
    case 'equals':
      return String(leftValue) === rightValue
    case 'notEquals':
      return String(leftValue) !== rightValue
    case 'greaterThan':
      return leftNum > rightNum
    case 'greaterOrEqual':
      return leftNum >= rightNum
    case 'lessThan':
      return leftNum < rightNum
    case 'lessOrEqual':
      return leftNum <= rightNum
    case 'contains':
      return String(leftValue ?? '').includes(rightValue)
    default:
      return false
  }
}

export class IfElseNode extends BaseNode {
  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState, factory: string) {
    super(nodeDef, workflowGlobalStateRef, factory, 'IfElseNode')
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const nodeConfig: IfElseNodeConfig = IfElseNodeConfigSchema.parse(raw)

    const { leftPath, operator, rightValue, resultVariableName } = nodeConfig

    this.logger.debug(`Executing ifElse node ${this.nodeDef.id}`, {
      leftPath,
      operator,
      rightValue,
      resultVariableName,
    })

    const inputContext = mergeInputs(this.readInputs() ?? [])
    const globalState = this.workflowGlobalState.getGlobalState<Record<string, unknown>>() ?? {}

    const leftValue = resolvePath(leftPath, inputContext, globalState)

    this.logger.debug(`Resolved leftValue: ${JSON.stringify(leftValue)}`)

    const conditionResult = evaluateCondition(leftValue, operator, rightValue)

    this.logger.info(`Condition evaluation result: ${conditionResult}`)

    // const result = {
    //   type: 'ifElse',
    //   timestamp: new Date().toISOString(),
    //   leftPath,
    //   leftValue,
    //   operator,
    //   rightValue,
    //   conditionResult,
    // }

    this.workflowGlobalState.updatePartialState({
      [resultVariableName]: conditionResult,
    })

    const mergedOutput = {
      ...inputContext,
      [resultVariableName]: conditionResult,
    }

    const out: Extract<OutputType, { type: 'json' }> = {
      id: uuidv4(),
      name: resultVariableName,
      type: 'json',
      value: mergedOutput,
    }

    return [out]
  }

  public async execute(): Promise<ExecutionResult> {
    if (this.nodeDef.executed) {
      return {
        status: 'error',
        payload: {
          nodeId: this.nodeDef.id,
          outputs: this.nodeDef.outputs ?? [],
          errorCode: 'NODE_IS_ALREADY_EXECUTED',
        },
      }
    }

    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const nodeConfig: IfElseNodeConfig = IfElseNodeConfigSchema.parse(raw)

    const inputContext = mergeInputs(this.readInputs() ?? [])
    const globalState = this.workflowGlobalState.getGlobalState<Record<string, unknown>>() ?? {}

    const leftValue = resolvePath(nodeConfig.leftPath, inputContext, globalState)
    const conditionResult = evaluateCondition(leftValue, nodeConfig.operator, nodeConfig.rightValue)

    const outputs = await this._nodeExecutionLogic()

    const workflow = this.workflowGlobalState as unknown as {
      workflowDef?: { edges?: Array<{ from: string; to: string }> }
    }
    const edges = workflow.workflowDef?.edges ?? []

    const childNodeIds = edges.filter((e) => e.from === this.nodeDef.id).map((e) => e.to)

    let nextNodeIds: string[] = []
    if (childNodeIds.length >= 2) {
      if (conditionResult) {
        nextNodeIds = [childNodeIds[0]]
      } else {
        nextNodeIds = [childNodeIds[1]]
      }
    } else if (childNodeIds.length === 1) {
      if (conditionResult) {
        nextNodeIds = [childNodeIds[0]]
      }
    }

    this.logger.debug(
      `Branching to nodes: ${nextNodeIds.join(', ')} (condition: ${conditionResult})`,
    )

    return {
      status: 'ok',
      next: nextNodeIds.length > 0 ? nextNodeIds : undefined,
      payload: {
        nodeId: this.nodeDef.id,
        outputs,
      },
    }
  }

  protected async _cost(): Promise<bigint> {
    return BigInt(8)
  }
}
