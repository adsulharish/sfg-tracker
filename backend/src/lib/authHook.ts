import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    identity: {
      plantCode: string;
      actorName: string;
    };
  }
}

const VALID_PLANTS = new Set(['P1', 'P2', 'P3']);

export async function identityHook(request: FastifyRequest, reply: FastifyReply) {
  const url = request.url;
  // Skip public/health/docs endpoints
  if (url === '/health' || url.startsWith('/docs') || url.startsWith('/favicon.ico')) {
    return;
  }

  const rawPlantCode = request.headers['x-plant-code'];
  const rawActorName = request.headers['x-actor-name'];

  if (!rawPlantCode || !rawActorName) {
    return reply.status(401).send({
      code: 'MISSING_IDENTITY',
      message: 'Missing required identity headers: x-plant-code and x-actor-name must be supplied'
    });
  }

  const plantCode = String(rawPlantCode).trim().toUpperCase();
  const actorName = String(rawActorName).trim();

  if (!plantCode || !actorName) {
    return reply.status(401).send({
      code: 'MISSING_IDENTITY',
      message: 'Identity headers x-plant-code and x-actor-name cannot be empty'
    });
  }

  if (!VALID_PLANTS.has(plantCode)) {
    return reply.status(400).send({
      code: 'INVALID_PLANT',
      message: `Plant code '${plantCode}' is not a registered plant. Allowed plants: P1, P2, P3`
    });
  }

  request.identity = {
    plantCode,
    actorName
  };
}
