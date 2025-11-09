import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { makeLogger, Logger } from '@mini-math/logger'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

const HttpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const
type HttpMethod = (typeof HttpMethods)[number]

const HttpHeadersSchema = z.object({
  key: z.string().min(1, 'Header key cannot be empty'),
  value: z.string().default(''),
  enabled: z.boolean().optional().default(true),
})

const HttpBodySchema = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .optional()
  .default('')

const HttpNodeConfigSchema = z.object({
  method: z.enum(HttpMethods).default('GET'),
  url: z.string().min(1, 'HTTP node requires a URL'),
  headers: z.array(HttpHeadersSchema).optional().default([]),
  body: HttpBodySchema,
  resultVariableName: z.string().optional().default('httpResult'),
})

type HttpHeaders = Record<string, string>

interface HttpExecutionResult {
  type: 'http'
  timestamp: string
  request: {
    method: HttpMethod
    url: string
    headers: HttpHeaders
    body?: string
  }
  response: {
    status: number
    headers: HttpHeaders
    data: unknown
  }
}

type HttpNodeConfig = z.infer<typeof HttpNodeConfigSchema>

export class HttpNode extends BaseNode {
  private readonly logger: Logger

  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState) {
    super(nodeDef, workflowGlobalStateRef)
    this.logger = makeLogger(`HttpNode: ${this.nodeDef.id}`)
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const nodeConfig: HttpNodeConfig = HttpNodeConfigSchema.parse(raw)

    const { method, url, headers, body, resultVariableName } = nodeConfig

    const upperMethod = method.toUpperCase() as HttpMethod

    this.logger.debug(`Executing HTTP node ${this.nodeDef.id}`, {
      method: upperMethod,
      url,
      headersCount: headers?.length || 0,
      hasBody: !!body,
      resultVariableName,
    })

    const requestHeaders: HttpHeaders = {}
    if (headers.length > 0) {
      for (const header of headers) {
        if (header.enabled !== false) {
          requestHeaders[header.key] = header.value
        }
      }
    }

    let serializedBody: string | undefined
    const shouldSendBody = ['POST', 'PUT', 'PATCH'].includes(upperMethod)

    if (body && shouldSendBody) {
      if (typeof body === 'string') {
        serializedBody = body
      } else {
        serializedBody = JSON.stringify(body)
      }

      const hasContentType = Object.keys(requestHeaders).some(
        (key) => key.toLowerCase() === 'content-type',
      )
      if (!hasContentType) {
        requestHeaders['Content-Type'] = 'application/json'
      }
    } else if (body && !shouldSendBody) {
      this.logger.warn(
        `Body provided for HTTP ${upperMethod} request. Body will be ignored for this method.`,
      )
    }

    this.logger.info(`Making ${upperMethod} request to ${url}`)

    let response: Response
    let responseData: unknown
    let status: number
    const responseHeaders: HttpHeaders = {}

    try {
      const fetchOptions: RequestInit = {
        method: upperMethod,
        headers: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
      }

      if (serializedBody) {
        fetchOptions.body = serializedBody
      }

      response = await fetch(url, fetchOptions)
      status = response.status
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        try {
          responseData = await response.json()
        } catch {
          responseData = await response.text()
        }
      } else {
        responseData = await response.text()
      }

      this.logger.info(`HTTP request completed with status ${status}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`HTTP request failed: ${errorMessage}`, {
        method: upperMethod,
        url,
      })
      throw new Error(`HTTP request failed: ${upperMethod} ${url} - ${errorMessage}`)
    }

    const httpResult: HttpExecutionResult = {
      type: 'http',
      timestamp: new Date().toISOString(),
      request: {
        method: upperMethod,
        url,
        headers: requestHeaders,
        body: serializedBody,
      },
      response: {
        status,
        headers: responseHeaders,
        data: responseData,
      },
    }

    const httpState: Record<string, unknown> = {
      type: httpResult.type,
      timestamp: httpResult.timestamp,
      request: {
        method: httpResult.request.method,
        url: httpResult.request.url,
        headers: { ...httpResult.request.headers },
        body: httpResult.request.body,
      },
      response: {
        status: httpResult.response.status,
        headers: { ...httpResult.response.headers },
        data: httpResult.response.data,
      },
    }

    this.workflowGlobalState.updatePartialState({
      [resultVariableName]: httpState,
    })

    this.logger.info(`HTTP node ${this.nodeDef.id} result stored in ${resultVariableName}`)

    const out: Extract<OutputType, { type: 'json' }> = {
      id: uuidv4(),
      name: resultVariableName,
      type: 'json',
      value: httpState,
    }

    return [out]
  }

  protected async _cost(): Promise<bigint> {
    return BigInt(7)
  }
}
