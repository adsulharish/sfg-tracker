import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Health check endpoint including database connectivity check',
        tags: ['Health'],
        response: {
          200: z.object({
            status: z.string(),
            db: z.string(),
            timestamp: z.string()
          }),
          503: z.object({
            status: z.string(),
            db: z.string(),
            error: z.string().optional(),
            timestamp: z.string()
          })
        }
      }
    },
    async (_request, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return reply.status(200).send({
          status: 'ok',
          db: 'connected',
          timestamp: new Date().toISOString()
        });
      } catch (err: unknown) {
        fastify.log.error(err, 'Database connectivity health check failed');
        const errorMessage = err instanceof Error ? err.message : 'Database ping failed';
        return reply.status(503).send({
          status: 'error',
          db: 'disconnected',
          error: errorMessage,
          timestamp: new Date().toISOString()
        });
      }
    }
  );
};
