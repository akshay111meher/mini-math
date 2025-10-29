import { z } from 'zod'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
extendZodWithOpenApi(z)

const JsonPrimitive = z.union([z.string(), z.number(), z.boolean()]).openapi('JsonPrimitive', {
  description: 'A JSON primitive: string, number or boolean',
})

const JsonArray = z.array(z.unknown()).openapi('JsonArray', {
  type: 'array',
  items: { type: ['string', 'number', 'boolean', 'object', 'array'] },
  description: 'An array of JSON values',
})

const JsonObject = z.record(z.string(), z.unknown()).openapi('JsonObject', {
  type: 'object',
  additionalProperties: true,
  description: 'An object with arbitrary JSON-compatible values',
})

// Now the union
export const GenericJsonValue = z
  .union([JsonPrimitive, JsonArray, JsonObject])
  .openapi('GenericJsonValue', {
    description: 'Any JSON value (primitive, array or object)',
  })

const _InputString = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    type: z.literal('string'),
    value: z.string(),
    required: z.boolean().optional(),
  })
  .openapi('InputString')

const _InputNumber = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    type: z.literal('number'),
    value: z.number(),
    required: z.boolean().optional(),
  })
  .openapi('InputNumber')

const _InputBoolean = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    type: z.literal('boolean'),
    value: z.boolean(),
    required: z.boolean().optional(),
  })
  .openapi('InputBoolean')

const _InputJson = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    type: z.literal('json'),
    value: GenericJsonValue.openapi({
      type: 'object',
      description: 'Any arbitrary JSON value',
      additionalProperties: true,
    }),
    required: z.boolean().optional(),
  })
  .openapi('InputJson')

export const Input = z
  .discriminatedUnion('type', [_InputString, _InputNumber, _InputBoolean, _InputJson])
  .openapi('Input', {
    description: 'Input of variable type',
    discriminator: { propertyName: 'type' }, // if supported by library
  })

// export const Input = z
//   .object({
//     id: z.string().optional(),
//     name: z.string(),
//     type: z.union([
//       z.literal('string'),
//       z.literal('number'),
//       z.literal('boolean'),
//       z.literal('json'),
//     ]),
//     value: z.any().openapi({
//       description: 'Value of the input — may be string, number, boolean, or arbitrary JSON',
//     }),
//     required: z.boolean().optional(),
//   })
//   .openapi('InputGeneric')

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
