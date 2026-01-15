import type { FastifyInstance } from 'fastify';
import type { SchedulerService } from '../services/scheduler.service.js';

export function registerSpeedtestRoutes(fastify: FastifyInstance, scheduler: SchedulerService) {
  // POST /api/speedtest/run - Trigger manual speedtest
  fastify.post('/api/speedtest/run', async (request, reply) => {
    const result = await scheduler.triggerManual();

    if (!result.success && result.error === 'A speedtest is already running') {
      reply.status(409);
      return { error: result.error };
    }

    if (!result.success) {
      reply.status(500);
      return { error: result.error, resultId: result.resultId };
    }

    return {
      success: true,
      resultId: result.resultId,
      message: 'Speedtest completed successfully'
    };
  });

  // GET /api/speedtest/status - Get scheduler status
  fastify.get('/api/speedtest/status', async () => {
    return {
      schedulerActive: scheduler.isActive(),
      timestamp: new Date().toISOString()
    };
  });
}
