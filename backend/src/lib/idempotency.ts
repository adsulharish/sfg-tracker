import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from './prisma.js';

declare module 'fastify' {
  interface FastifyRequest {
    idempotencyContext?: {
      key: string;
      requestHash: string;
    };
  }
}

export function computeRequestHash(url: string, body: unknown): string {
  const content = `${url}:${JSON.stringify(body ?? {})}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function idempotencyPreHandler(request: FastifyRequest, reply: FastifyReply) {
  if (request.method !== 'POST') {
    return;
  }

  const rawKey =
    request.headers['idempotency-key'] ?? request.headers['x-idempotency-key'];

  if (!rawKey) {
    return;
  }

  const key = String(rawKey).trim();
  if (!key) {
    return;
  }

  const requestHash = computeRequestHash(request.url, request.body);

  try {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key }
    });

    if (existing) {
      if (existing.requestHash === requestHash) {
        reply.header('x-idempotent-replay', 'true');
        return reply.status(200).send(existing.responseBody);
      } else {
        return reply.status(409).send({
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Idempotency key was previously executed with different request parameters'
        });
      }
    }
  } catch (err) {
    request.log.warn(err, 'Failed to query idempotency key from database');
  }

  request.idempotencyContext = {
    key,
    requestHash
  };
}

export async function idempotencyOnSend(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
) {
  if (
    request.idempotencyContext &&
    reply.statusCode >= 200 &&
    reply.statusCode < 300 &&
    payload
  ) {
    try {
      const parsedBody =
        typeof payload === 'string' ? JSON.parse(payload) : payload;

      await prisma.idempotencyKey.create({
        data: {
          key: request.idempotencyContext.key,
          requestHash: request.idempotencyContext.requestHash,
          responseBody: parsedBody
        }
      });
    } catch (err) {
      request.log.warn(err, 'Failed to save idempotency response');
    }
  }
  return payload;
}
