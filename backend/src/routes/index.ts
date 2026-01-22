import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { SchedulerService } from '../services/scheduler.service.js';
import type { ThresholdService } from '../services/threshold.service.js';
import type { BundesnetzagenturService } from '../services/bundesnetzagentur.service.js';
import { registerResultsRoutes } from './results.routes.js';
import { registerStatsRoutes } from './stats.routes.js';
import { registerSpeedtestRoutes } from './speedtest.routes.js';
import { registerThresholdRoutes } from './threshold.routes.js';
import { registerBundesnetzagenturRoutes } from './bundesnetzagentur.routes.js';

export function registerRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  scheduler: SchedulerService,
  thresholdService: ThresholdService,
  bundesnetzagenturService: BundesnetzagenturService
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

  // TKG threshold routes
  registerThresholdRoutes(fastify, thresholdService);

  // Bundesnetzagentur measurement routes
  registerBundesnetzagenturRoutes(fastify, bundesnetzagenturService, thresholdService);
}
