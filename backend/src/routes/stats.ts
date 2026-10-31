import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { transferService } from '../services/transferService.js';

const statsResponseSchema = z.object({
  totalTransfers: z.number(),
  inTransitCount: z.number(),
  receivedCount: z.number(),
  partialCount: z.number(),
  discrepancyCount: z.number(),
  cancelledCount: z.number(),
  byDepartment: z.object({
    HEADERS: z.number(),
    SHEET_METAL: z.number()
  })
});

export const statsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/stats',
    {
      schema: {
        description: 'Get operational KPI statistics and counts',
        tags: ['Stats'],
        response: {
          200: statsResponseSchema
        }
      }
    },
    async (_request, reply) => {
      const stats = await transferService.getStats();
      return reply.send(stats);
    }
  );
};
