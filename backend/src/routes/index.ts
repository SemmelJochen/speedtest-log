import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { SchedulerService } from '../services/scheduler.service.js';
import { registerResultsRoutes } from './results.routes.js';
import { registerStatsRoutes } from './stats.routes.js';
import { registerSpeedtestRoutes } from './speedtest.routes.js';

export function registerRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  scheduler: SchedulerService
) {
  // Health check
  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Results CRUD routes
  registerResultsRoutes(fastify, prisma);

  // Statistics routes
  registerStatsRoutes(fastify, prisma);

  // Speedtest control routes
  registerSpeedtestRoutes(fastify, scheduler);
}
