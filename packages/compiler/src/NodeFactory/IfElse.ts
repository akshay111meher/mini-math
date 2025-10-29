import { BaseNode, OutputType } from '@mini-math/nodes'

export class IfElseNode extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const cfg: any = this.nodeDef.data || this.nodeDef.config || {}

    const leftPath: string = cfg.leftPath || ''
    const operator: string = cfg.operator || 'equals'
    const rightValueRaw = cfg.rightValue ?? ''
    const rightValue: string = String(rightValueRaw)
    const resultVariableName: string = cfg.resultVariableName || 'conditionResult'

    // We'll treat the first input entry as "context"
    // This assumes wiring logic already pushed parent's outputs
    // into this.nodeDef.inputs as { name, value, ... } objects.
    const firstInputObj = this.nodeDef.inputs?.[0]

    // best guess at what user data actually is:
    // If parents pushed `value` in, use that for traversal.
    const inputData = firstInputObj && (firstInputObj as any).value

    const parsePath = (obj: any, path: string) => {
      if (!path) return undefined
      try {
        let cur = obj
        const tokens = path
          .replace(/\[(\d+)\]/g, '.$1')
          .split('.')
          .filter(Boolean)
        for (const t of tokens) {
          if (cur == null) return undefined
          cur = cur[t]
        }
        return cur
      } catch {
        return undefined
      }
    }

    const leftVal = parsePath(inputData, leftPath)
    const rightNum = Number(rightValue)
    const leftNum = typeof leftVal === 'number' ? leftVal : Number(leftVal)

    let condition = false
    switch (operator) {
      case 'equals':
        condition = String(leftVal) == rightValue
        break
      case 'notEquals':
        condition = String(leftVal) != rightValue
        break
      case 'greaterThan':
        condition = leftNum > rightNum
        break
      case 'greaterOrEqual':
        condition = leftNum >= rightNum
        break
      case 'lessThan':
        condition = leftNum < rightNum
        break
      case 'lessOrEqual':
        condition = leftNum <= rightNum
        break
      case 'contains':
        condition = String(leftVal ?? '').includes(rightValue)
        break
      default:
        condition = false
    }

    const branch = condition ? 'if' : 'else'

    const output: OutputType = {
      name: resultVariableName,
      type: 'json',
      value: {
        type: 'condition',
        branch,
        [resultVariableName]: condition,
        nodeId: this.nodeDef.id,
        timestamp: new Date().toISOString(),
      },
    }

    return [output]
  }
}
