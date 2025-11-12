import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { makeLogger, Logger } from '@mini-math/logger'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

export class CoinGekkoNode extends BaseNode {
  private readonly logger: Logger

  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState) {
    super(nodeDef, workflowGlobalStateRef)
    this.logger = makeLogger(`CoinGekkoNode: ${this.nodeDef.id}`)
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const ConfigSchema = z.object({
      apiPlan: z.enum(['free', 'pro']).default('free'),
      apiKey: z.string().min(1),
      tokenId: z.string().min(1),
      vsCurrency: z.string().min(1),
      resultVariableName: z.string().optional().default('coingeckoResult'),
      validated: z.boolean().optional().default(false),
    })

    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const cfg = ConfigSchema.parse(raw)

    const baseUrl =
      cfg.apiPlan === 'pro'
        ? 'https://pro-api.coingecko.com/api/v3'
        : 'https://api.coingecko.com/api/v3'
    const url = `${baseUrl}/simple/price?vs_currencies=${encodeURIComponent(cfg.vsCurrency)}&ids=${encodeURIComponent(cfg.tokenId)}`

    const headers: Record<string, string> = {}
    headers[cfg.apiPlan === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'] = cfg.apiKey

    this.logger.info(`Fetching price from CoinGecko`)

    let status: number
    let data: unknown
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      })
      status = res.status
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text}`)
      }
      data = await res.json()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.error(`CoinGecko request failed: ${msg}`)
      throw new Error(`CoinGecko request failed: ${msg}`)
    }

    const result = {
      type: 'coingecko',
      timestamp: new Date().toISOString(),
      request: {
        url,
        headers,
      },
      response: {
        status,
        data,
      },
      meta: {
        tokenId: cfg.tokenId,
        vsCurrency: cfg.vsCurrency,
        apiPlan: cfg.apiPlan,
        headersUsed: true,
      },
    }

    this.workflowGlobalState.updatePartialState({
      [cfg.resultVariableName]: result,
    })

    const out: Extract<OutputType, { type: 'json' }> = {
      id: uuidv4(),
      name: cfg.resultVariableName,
      type: 'json',
      value: result,
    }

    return [out]
  }
  protected async _cost(): Promise<bigint> {
    return BigInt(2)
  }
}
