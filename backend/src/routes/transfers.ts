import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { transferService } from '../services/transferService.js';
import { AppError } from '../lib/errors.js';

const plantSubSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string()
});

const transferEventSchema = z.object({
  id: z.string(),
  transferId: z.string(),
  eventType: z.enum(['SENT', 'RECEIVED', 'DISCREPANCY_FLAGGED', 'CANCELLED']),
  actor: z.string(),
  plantId: z.string(),
  plant: plantSubSchema.optional(),
  payload: z.record(z.any()),
  createdAt: z.date().or(z.string())
});

const transferResponseSchema = z.object({
  id: z.string(),
  transferNo: z.string(),
  jobOrderNo: z.string(),
  sfgCode: z.string(),
  sfgDescription: z.string(),
  department: z.enum(['HEADERS', 'SHEET_METAL']),
  qtySent: z.number(),
  uom: z.string(),
  fromPlantId: z.string(),
  toPlantId: z.string(),
  fromPlant: plantSubSchema.optional(),
  toPlant: plantSubSchema.optional(),
  sentBy: z.string(),
  sentAt: z.date().or(z.string()),
  status: z.enum(['IN_TRANSIT', 'RECEIVED', 'PARTIAL', 'DISCREPANCY', 'CANCELLED']),
  qtyReceived: z.number().nullable().optional(),
  receivedBy: z.string().nullable().optional(),
  receivedAt: z.date().or(z.string()).nullable().optional(),
  remarks: z.string().nullable().optional(),
  externalRef: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string())
});

const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional()
});

export const transferRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/transfers
  fastify.post(
    '/api/v1/transfers',
    {
      schema: {
        description: 'Initiate an inter-plant SFG transfer',
        tags: ['Transfers'],
        body: z.object({
          jobOrderNo: z.string().min(1),
          sfgCode: z.string().min(1),
          sfgDescription: z.string().min(1),
          department: z.enum(['HEADERS', 'SHEET_METAL']),
          qtySent: z.number().positive(),
          uom: z.string().min(1),
          fromPlantId: z.string().min(1),
          toPlantId: z.string().min(1),
          remarks: z.string().optional(),
          externalRef: z.string().optional()
        }),
        response: {
          201: transferResponseSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const transfer = await transferService.createTransfer(
          request.body as any,
          request.identity
        );
        return reply.status(201).send(transfer);
      } catch (err: unknown) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            code: err.code,
            message: err.message,
            details: err.details
          });
        }
        throw err;
      }
    }
  );

  // POST /api/v1/transfers/:no/receive
  fastify.post(
    '/api/v1/transfers/:no/receive',
    {
      schema: {
        description: 'Acknowledge receipt of a transfer at the destination plant',
        tags: ['Transfers'],
        params: z.object({
          no: z.string()
        }),
        body: z.object({
          qtyReceived: z.number().min(0),
          remarks: z.string().optional()
        }),
        response: {
          200: transferResponseSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { no } = request.params as { no: string };
        const body = request.body as { qtyReceived: number; remarks?: string };
        const updated = await transferService.confirmReceipt(no, body, request.identity);
        return reply.status(200).send(updated);
      } catch (err: unknown) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            code: err.code,
            message: err.message,
            details: err.details
          });
        }
        throw err;
      }
    }
  );

  // POST /api/v1/transfers/:no/cancel
  fastify.post(
    '/api/v1/transfers/:no/cancel',
    {
      schema: {
        description: 'Cancel an in-transit transfer by the sending plant',
        tags: ['Transfers'],
        params: z.object({
          no: z.string()
        }),
        body: z.object({
          reason: z.string().min(1)
        }),
        response: {
          200: transferResponseSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { no } = request.params as { no: string };
        const body = request.body as { reason: string };
        const updated = await transferService.cancelTransfer(no, body, request.identity);
        return reply.status(200).send(updated);
      } catch (err: unknown) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            code: err.code,
            message: err.message,
            details: err.details
          });
        }
        throw err;
      }
    }
  );

  // GET /api/v1/transfers
  fastify.get(
    '/api/v1/transfers',
    {
      schema: {
        description: 'List and filter transfers',
        tags: ['Transfers'],
        querystring: z.object({
          status: z.enum(['IN_TRANSIT', 'RECEIVED', 'PARTIAL', 'DISCREPANCY', 'CANCELLED']).optional(),
          fromPlant: z.string().optional(),
          toPlant: z.string().optional(),
          jobOrderNo: z.string().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          page: z.coerce.number().int().positive().optional(),
          limit: z.coerce.number().int().positive().optional()
        }),
        response: {
          200: z.object({
            items: z.array(transferResponseSchema),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
            totalPages: z.number()
          })
        }
      }
    },
    async (request, reply) => {
      const query = request.query as any;
      const result = await transferService.listTransfers(query);
      return reply.send(result);
    }
  );

  // GET /api/v1/transfers/:no
  fastify.get(
    '/api/v1/transfers/:no',
    {
      schema: {
        description: 'Get details of a single transfer by transferNo',
        tags: ['Transfers'],
        params: z.object({
          no: z.string()
        }),
        response: {
          200: transferResponseSchema,
          404: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { no } = request.params as { no: string };
        const transfer = await transferService.getTransfer(no);
        return reply.send(transfer);
      } catch (err: unknown) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            code: err.code,
            message: err.message,
            details: err.details
          });
        }
        throw err;
      }
    }
  );

  // GET /api/v1/transfers/:no/timeline
  fastify.get(
    '/api/v1/transfers/:no/timeline',
    {
      schema: {
        description: 'Get chronological audit trail events for a transfer',
        tags: ['Transfers'],
        params: z.object({
          no: z.string()
        }),
        response: {
          200: z.array(transferEventSchema),
          404: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { no } = request.params as { no: string };
        const timeline = await transferService.getTimeline(no);
        return reply.send(timeline);
      } catch (err: unknown) {
        if (err instanceof AppError) {
          return reply.status(err.statusCode).send({
            code: err.code,
            message: err.message,
            details: err.details
          });
        }
        throw err;
      }
    }
  );
};
