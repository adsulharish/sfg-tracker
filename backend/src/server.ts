import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  ZodTypeProvider
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { AppError } from './lib/errors.js';
import { identityHook } from './lib/authHook.js';
import { idempotencyPreHandler, idempotencyOnSend } from './lib/idempotency.js';
import { healthRoutes } from './routes/health.js';
import { plantRoutes } from './routes/plants.js';
import { jobOrderRoutes } from './routes/jobOrders.js';
import { transferRoutes } from './routes/transfers.js';
import { statsRoutes } from './routes/stats.js';
import { prisma } from './lib/prisma.js';

export async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info'
    }
  }).withTypeProvider<ZodTypeProvider>();

  // Set Zod compilers
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // Configure CORS
  const corsOriginEnv = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const allowedOrigins = corsOriginEnv
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  await server.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (e.g. curl, test agents, mobile)
      if (!origin) {
        return cb(null, true);
      }
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-plant-code',
      'x-actor-name',
      'x-idempotency-key',
      'idempotency-key'
    ],
    exposedHeaders: ['x-idempotent-replay']
  });

  // Swagger Documentation generated from Zod Schemas
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'SFG Transfer Tracker API',
        description:
          'Inter-plant Semi-Finished Goods Transfer Tracking System API between P1, P2, and P3',
        version: '1.0.0'
      },
      servers: [
        {
          url: '/',
          description: 'Current Environment'
        }
      ],
      tags: [
        { name: 'Health', description: 'System health and DB connectivity' },
        { name: 'Transfers', description: 'SFG Transfer operations' },
        { name: 'Plants', description: 'Plant registry' },
        { name: 'Job Orders', description: 'Upstream Parent Job Orders' },
        { name: 'Stats', description: 'Operational KPI stats' }
      ]
    },
    transform: jsonSchemaTransform
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false
    }
  });

  // Global hooks
  server.addHook('preHandler', identityHook);
  server.addHook('preHandler', idempotencyPreHandler);
  server.addHook('onSend', idempotencyOnSend);

  // Centralized Error Handler
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: error.format()
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details
      });
    }

    // Fastify schema validation error fallback
    if ('validation' in error) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.validation
      });
    }

    server.log.error(error);
    return reply.status(error.statusCode ?? 500).send({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred'
    });
  });

  // Register API routes
  await server.register(healthRoutes);
  await server.register(plantRoutes);
  await server.register(jobOrderRoutes);
  await server.register(transferRoutes);
  await server.register(statsRoutes);

  return server;
}

async function start() {
  const server = await buildServer();
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    const address = await server.listen({ port, host });
    server.log.info(`🚀 SFG Transfer Tracker Backend listening at ${address}`);
    server.log.info(`📖 API documentation available at ${address}/docs`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      server.log.info(`Received ${signal}, closing server...`);
      await server.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  }
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  start();
}
