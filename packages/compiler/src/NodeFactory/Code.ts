import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { makeLogger, Logger } from '@mini-math/logger'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { createContext, Script } from 'vm'
import {
  mergeInputs,
  normalizeOutput,
  getGlobalValue,
  setGlobalValue,
  mergeGlobalPatch,
} from './utils/globalState.js'

const CodeNodeConfigSchema = z.object({
  jsCode: z.string().min(1, 'Code node requires JavaScript code'),
  resultVariableName: z.string().optional().default('codeResult'),
})

type CodeNodeConfig = z.infer<typeof CodeNodeConfigSchema>

export class CodeNode extends BaseNode {
  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState, factory: string) {
    super(nodeDef, workflowGlobalStateRef, factory, 'CodeNode')
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const nodeConfig: CodeNodeConfig = CodeNodeConfigSchema.parse(raw)

    const { jsCode, resultVariableName } = nodeConfig

    this.logger.debug(`Executing code node ${this.nodeDef.id}`)

    const inputContext = mergeInputs(this.readInputs() ?? [])
    const items = [inputContext]

    const globalState = this.workflowGlobalState.getGlobalState<Record<string, unknown>>() ?? {}
    const workingGlobalState = JSON.parse(JSON.stringify(globalState ?? {})) as Record<
      string,
      unknown
    >
    const globalPatch: Record<string, unknown> = {}
    let globalStateMutated = false

    const globalHelper = {
      get: (path: string) => getGlobalValue(workingGlobalState, path),
      set: (path: string, value: unknown) => {
        globalStateMutated = true
        const patch = setGlobalValue(workingGlobalState, path, value)
        mergeGlobalPatch(globalPatch, patch)
      },
      raw: workingGlobalState,
    }

    const builtins = {
      $node: {
        id: this.nodeDef.id,
        type: this.nodeDef.type,
        data: this.nodeDef.data ?? this.nodeDef.config ?? {},
      },
      $workflow: {
        id: 'workflow_1',
        name: 'Current Workflow',
      },
      $now: new Date(),
      $today: new Date().toISOString().split('T')[0],
      $json: {
        stringify: JSON.stringify,
        parse: JSON.parse,
      },
      console: {
        log: (...args: unknown[]) => {
          this.logger.info(`[Code Node ${this.nodeDef.id}]: ${args.map(String).join(' ')}`, {
            args,
          })
        },
        error: (...args: unknown[]) => {
          this.logger.error(`[Code Node ${this.nodeDef.id}]: ${args.map(String).join(' ')}`, {
            args,
          })
        },
        warn: (...args: unknown[]) => {
          this.logger.warn(`[Code Node ${this.nodeDef.id}]: ${args.map(String).join(' ')}`, {
            args,
          })
        },
        info: (...args: unknown[]) => {
          this.logger.info(`[Code Node ${this.nodeDef.id}]: ${args.map(String).join(' ')}`, {
            args,
          })
        },
      },
      Math,
      Date,
      String,
      Number,
      Array,
      Object,
      JSON,
    }

    const executionContext = {
      ...builtins,
      $items: items,
      $item: items[0] ?? {},
      $global: globalHelper,
    }

    const vmContext = createContext(executionContext)

    let codeResult: unknown
    try {
      const wrappedCode = `"use strict";\n(function() {\n${jsCode}\n})()`
      const script = new Script(wrappedCode)
      codeResult = script.runInContext(vmContext, {
        timeout: 5000,
        displayErrors: true,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Code execution failed: ${errorMessage}`)
      throw new Error(`Code execution failed: ${errorMessage}`)
    }

    const mergedOutput = normalizeOutput(items[0] ?? {}, codeResult)
    const timestamp = new Date().toISOString()

    const statePayload: Record<string, unknown> = {
      ...mergedOutput,
      nodeId: this.nodeDef.id,
      executedAt: timestamp,
    }

    if (globalStateMutated) {
      this.workflowGlobalState.updatePartialState(globalPatch, { deep: true })
    }

    this.workflowGlobalState.updatePartialState({
      [resultVariableName]: statePayload,
    })

    this.logger.info(`Code node ${this.nodeDef.id} result stored in ${resultVariableName}`)

    const out: Extract<OutputType, { type: 'json' }> = {
      id: uuidv4(),
      name: 'main',
      type: 'json',
      value: mergedOutput,
    }

    return [out]
  }

  protected async _cost(): Promise<bigint> {
    return BigInt(4)
  }
}
