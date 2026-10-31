import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const plantSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string())
});

export const plantRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/plants',
    {
      schema: {
        description: 'Get list of manufacturing plants (P1, P2, P3)',
        tags: ['Plants'],
        response: {
          200: z.array(plantSchema)
        }
      }
    },
    async (_request, reply) => {
      const plants = await prisma.plant.findMany({
        orderBy: { code: 'asc' }
      });
      return reply.send(plants);
    }
  );
};
