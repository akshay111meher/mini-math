import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { makeLogger, Logger } from '@mini-math/logger'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { cdpService } from './utils/cdpService.js'

const CdpSignNodeConfigSchema = z.object({
    domain: z.record(z.string(), z.any()),
    types: z.record(z.string(), z.array(z.object({ name: z.string(), type: z.string() }))),
    primaryType: z.string(),
    message: z.record(z.string(), z.any()),
})

type CdpSignNodeConfig = z.infer<typeof CdpSignNodeConfigSchema>

export class CdpSignNode extends BaseNode {
    private readonly logger: Logger

    constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState) {
        super(nodeDef, workflowGlobalStateRef)
        this.logger = makeLogger(`CdpSignNode: ${this.nodeDef.id}`)
    }

    protected async _nodeExecutionLogic(): Promise<OutputType[]> {
        const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
        // We might need to handle stringified JSON inputs if they come from text fields
        // But assuming they are objects for now or parsed before.
        // If they are strings, we should parse them.

        // Helper to parse if string
        const parseIfString = (val: any) => (typeof val === 'string' ? JSON.parse(val) : val)

        const config = { ...raw as any }
        if (config.domain) config.domain = parseIfString(config.domain)
        if (config.types) config.types = parseIfString(config.types)
        if (config.message) config.message = parseIfString(config.message)

        const nodeConfig: CdpSignNodeConfig = CdpSignNodeConfigSchema.parse(config)

        const globalState = this.workflowGlobalState.getGlobalState<any>()
        const walletInfo = globalState.wallet

        if (!walletInfo) {
            throw new Error('No wallet connection found')
        }

        if (walletInfo.walletType === 'masterwallet-manual') {
            throw new Error('Manual wallet flow not implemented')
        }

        const { domain, types, primaryType, message } = nodeConfig
        const accountName = walletInfo.accountName



        // cdpService.signTypedData expects domain with specific fields.
        // We assume the input domain matches EIP712Domain interface in cdpService.

        const result = await cdpService.signTypedData({
            accountName,
            domain: domain as any,
            types: types as any,
            primaryType,
            message
        })

        const out: Extract<OutputType, { type: 'json' }> = {
            id: uuidv4(),
            name: 'main',
            type: 'json',
            value: result as unknown as Record<string, unknown>,
        }

        return [out]
    }

    protected async _cost(): Promise<bigint> {
        return BigInt(5)
    }
}
