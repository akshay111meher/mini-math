import z from 'zod'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
extendZodWithOpenApi(z)

const _OutputString = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.literal('string'),
  value: z.string(),
})

const _OutputNumber = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.literal('number'),
  value: z.number(),
})

const _OutputBoolean = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.literal('boolean'),
  value: z.boolean(),
})

const _OutputJson = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.literal('json'),
  value: z.unknown().openapi({
    type: 'object',
    description: 'Any arbitrary JSON value',
    additionalProperties: true,
  }),
})

export const Output = z.discriminatedUnion('type', [
  _OutputString,
  _OutputNumber,
  _OutputBoolean,
  _OutputJson,
])

export type OutputType = z.infer<typeof Output>

export class OutputDefClass {
  protected outputDef: OutputType

  constructor(outputDef: OutputType) {
    this.outputDef = outputDef
  }

  getId(): string | undefined {
    return this.outputDef.id
  }

  getName(): string {
    return this.outputDef.name
  }

  getType(): string {
    return this.outputDef.type
  }

  getAll(): OutputType {
    return this.outputDef
  }
}
