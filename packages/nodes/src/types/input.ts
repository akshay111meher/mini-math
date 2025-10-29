import { z } from 'zod'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
extendZodWithOpenApi(z)

const _InputString = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.literal('string'),
  value: z.string(),
  required: z.boolean().optional(),
})

const _InputNumber = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.literal('number'),
  value: z.number(),
  required: z.boolean().optional(),
})

const _InputBoolean = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.literal('boolean'),
  value: z.boolean(),
  required: z.boolean().optional(),
})

const _InputJson = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.literal('json'),
  value: z.unknown().openapi({
    type: 'object',
    description: 'Any arbitrary JSON value',
    additionalProperties: true,
  }),
  required: z.boolean().optional(),
})

export const Input = z.discriminatedUnion('type', [
  _InputString,
  _InputNumber,
  _InputBoolean,
  _InputJson,
])

export type InputType = z.infer<typeof Input>

export class InputDefClass {
  protected inputDef: InputType

  constructor(inputDef: InputType) {
    this.inputDef = inputDef
  }

  getId(): string | undefined {
    return this.inputDef.id
  }

  getName(): string {
    return this.inputDef.name
  }

  getType(): string {
    return this.inputDef.type
  }

  isRequired(): boolean | undefined {
    return this.inputDef.required
  }

  getAll(): InputType {
    return this.inputDef
  }
}
