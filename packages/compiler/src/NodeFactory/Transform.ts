import { BaseNode, OutputType } from '@mini-math/nodes'

export class TransformNode extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const cfg = this.nodeDef.data ?? this.nodeDef.config ?? ({} as any)

    const transformType = (cfg['transformType'] ?? 'map') as string
    const mapping = cfg['mapping'] as Record<string, string> | undefined
    const filterCondition = (cfg['filterCondition'] ?? '') as string

    const inputsRaw = this.nodeDef.inputs ?? []
    const values: unknown[] = inputsRaw
      .map((i) =>
        i && typeof i === 'object' && 'value' in i ? (i as { value: unknown }).value : undefined,
      )
      .filter((v): v is unknown => v !== undefined)

    const inputData: unknown = values.length === 1 ? values[0] : values

    let transformedData: unknown
    switch (transformType) {
      case 'map':
        transformedData = applyMapping(inputData, mapping ?? {})
        break
      case 'filter':
        transformedData = applyFilter(inputData, filterCondition)
        break
      default:
        transformedData = inputData
    }

    const payload = {
      type: 'transform',
      inputData,
      transformedData,
      transformType,
      timestamp: new Date().toISOString(),
    }

    const out: OutputType = {
      name: 'transform',
      type: 'json',
      value: payload,
    }

    return [out]
  }
}

const applyMapping = (data: any, mapping: Record<string, string>) => {
  if (!mapping || typeof data !== 'object') return data

  const result: Record<string, any> = {}
  for (const [targetKey, sourceKey] of Object.entries(mapping)) {
    result[targetKey] = data[sourceKey]
  }
  return result
}

const applyFilter = (data: any, filterCondition: string) => {
  if (!Array.isArray(data)) return data

  // Simple filter implementation
  return data.filter((item) => {
    // In a real implementation, use a proper expression evaluator
    return evaluateCondition(filterCondition, item)
  })
}

const evaluateCondition = (condition: string, data: any): boolean => {
  // Very simple condition evaluation - in production, use a proper expression evaluator
  try {
    // WARNING: This is unsafe for production - use a proper expression evaluator
    return eval(
      condition.replace(/\$\{([^}]+)\}/g, (match, key) => {
        return JSON.stringify(data[key])
      }),
    )
  } catch {
    return false
  }
}
