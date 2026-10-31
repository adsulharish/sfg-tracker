import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { defaultJobOrderProvider } from '../providers/jobOrders.js';

const requiredSFGSchema = z.object({
  sfgCode: z.string(),
  description: z.string(),
  department: z.enum(['HEADERS', 'SHEET_METAL']),
  requiredQty: z.number().optional(),
  qtyRequired: z.number().optional(),
  uom: z.string(),
  producingPlant: z.string().optional(),
  consumingPlant: z.string().optional()
});

const jobOrderResponseSchema = z.object({
  jobOrderNo: z.string(),
  productCode: z.string().optional(),
  productName: z.string().optional(),
  parentItemCode: z.string().optional(),
  parentDescription: z.string().optional(),
  targetPlant: z.string().optional(),
  plannedQty: z.number().optional(),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
  plannedStart: z.string().optional(),
  status: z.string(),
  sfgs: z.array(requiredSFGSchema).optional(),
  requiredSFGs: z.array(requiredSFGSchema).optional()
});

export const jobOrderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/job-orders',
    {
      schema: {
        description: 'List parent build job orders and child SFG parts',
        tags: ['Job Orders'],
        response: {
          200: z.array(jobOrderResponseSchema)
        }
      }
    },
    async (_request, reply) => {
      const orders = await defaultJobOrderProvider.listJobOrders();
      return reply.send(orders);
    }
  );

  fastify.get(
    '/api/v1/job-orders/:no',
    {
      schema: {
        description: 'Get details of a single job order by jobOrderNo',
        tags: ['Job Orders'],
        params: z.object({
          no: z.string()
        }),
        response: {
          200: jobOrderResponseSchema,
          404: z.object({
            code: z.string(),
            message: z.string()
          })
        }
      }
    },
    async (request, reply) => {
      const { no } = request.params as { no: string };
      const order = await defaultJobOrderProvider.getJobOrder(no);
      if (!order) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: `Job order '${no}' not found`
        });
      }
      return reply.send(order);
    }
  );
};
