import { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { BatchSchemas, CommonSchemas } from '../../schemas/index.js'
import { ListOptionsSchema, makeListResultSchema } from '@mini-math/utils'
import { WorkflowRef } from '@mini-math/workflow'

export const BATCH_JOBS = 'Batch Jobs'
export const basePath = '/batchJobs'

export const createBatch: RouteConfig = {
  method: 'post',
  path: `${basePath}/createBatch`,
  tags: [BATCH_JOBS],
  summary: 'Create a new batch of scheduled jobs',
  description: `
Creates multiple jobs and groups them under a single batch.

On success, a unique \`batchId\` is returned. This \`batchId\` can later be used to:
- Check whether the batch exists
- Retrieve the workflow IDs created under the batch
- Query the execution state of individual workflows
  `.trim(),
  request: {
    body: {
      content: {
        'application/json': {
          schema: BatchSchemas.ScheduleBatchRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Batch created successfully',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({
            data: BatchSchemas.BatchCreateResponseDataSchema,
          }),
        },
      },
    },
    400: {
      description: 'Request validation failed',
      content: {
        'application/json': {
          schema: CommonSchemas.ValidationError,
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const existsBatch: RouteConfig = {
  method: 'post',
  path: `${basePath}/existsBatch`,
  tags: [BATCH_JOBS],
  summary: 'Check whether a batch exists',
  description: `
Checks if a batch with the given \`batchId\` exists.

This endpoint is useful for validating batch references before querying
batch workflows or execution state.
  `.trim(),
  request: {
    body: {
      content: {
        'application/json': {
          schema: BatchSchemas.ExistBatchRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Batch exists',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse,
        },
      },
    },
    404: {
      description: 'Batch does not exist',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse,
        },
      },
    },
    400: {
      description: 'Request validation failed',
      content: {
        'application/json': {
          schema: CommonSchemas.ValidationError,
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const getBatch: RouteConfig = {
  method: 'post',
  path: `${basePath}/getBatch`,
  tags: [BATCH_JOBS],
  summary: 'Retrieve workflows for a batch',
  description: `
Returns the list of workflows associated with the given \`batchId\`.

Each workflow ID can be used to fetch execution state, logs, or results
from the workflow APIs.
  `.trim(),
  request: {
    body: {
      content: {
        'application/json': {
          schema: BatchSchemas.ExistBatchRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Batch found and workflows returned',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse,
        },
      },
    },
    404: {
      description: 'Batch does not exist',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse,
        },
      },
    },
    400: {
      description: 'Request validation failed',
      content: {
        'application/json': {
          schema: CommonSchemas.ValidationError,
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const deleteBatch: RouteConfig = {
  method: 'post',
  path: `${basePath}/deleteBatch`,
  tags: [BATCH_JOBS],
  summary: 'Delete a batch and its associated jobs',
  description: `
Deletes the batch identified by \`batchId\`.

This removes the batch record and disassociates (or deletes) the jobs/workflows
that were created under the batch, depending on server-side behavior.
  `.trim(),
  request: {
    body: {
      content: {
        'application/json': { schema: BatchSchemas.ExistBatchRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Batch deleted successfully',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
    400: {
      description: 'Request validation failed',
      content: { 'application/json': { schema: CommonSchemas.ValidationError } },
    },
    404: {
      description: 'Batch does not exist',
      content: { 'application/json': { schema: CommonSchemas.StandardResponse } },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const listBatches: RouteConfig = {
  method: 'post',
  path: `${basePath}/listBatches`,
  tags: [BATCH_JOBS],
  summary: 'List workflows',
  description:
    'Lists workflows visible to the authenticated user. Supports cursor-based pagination via the provided list options.',
  request: {
    body: {
      content: {
        'application/json': { schema: ListOptionsSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Status of the image',
      content: {
        'application/json': {
          schema: CommonSchemas.StandardResponse.extend({
            data: makeListResultSchema(WorkflowRef),
          }),
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
}

export const doc: RouteConfig[] = [createBatch, existsBatch, getBatch, deleteBatch, listBatches]
