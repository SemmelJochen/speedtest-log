import type { FastifyInstance } from 'fastify';
import type { ThresholdService } from '../services/threshold.service.js';
import { z } from 'zod';

const updateConfigSchema = z.object({
  contractedDownload: z.number().min(1).max(10000).optional(),
  contractedUpload: z.number().min(1).max(10000).optional(),
  normalThreshold: z.number().min(1).max(100).optional(),
  criticalThreshold: z.number().min(1).max(100).optional(),
});

export function registerThresholdRoutes(
  fastify: FastifyInstance,
  thresholdService: ThresholdService
) {
  // GET /api/threshold/config - Get current threshold configuration
  fastify.get('/api/threshold/config', async () => {
    const config = await thresholdService.getConfig();
    return {
      data: {
        id: config.id,
        contractedDownload: config.contractedDownload,
        contractedUpload: config.contractedUpload,
        normalThreshold: config.normalThreshold,
        criticalThreshold: config.criticalThreshold,
        updatedAt: config.updatedAt,
      },
    };
  });

  // PUT /api/threshold/config - Update threshold configuration
  fastify.put('/api/threshold/config', async (request, reply) => {
    const parseResult = updateConfigSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.errors };
    }

    const updated = await thresholdService.updateConfig(parseResult.data);
    return {
      data: {
        id: updated.id,
        contractedDownload: updated.contractedDownload,
        contractedUpload: updated.contractedUpload,
        normalThreshold: updated.normalThreshold,
        criticalThreshold: updated.criticalThreshold,
        updatedAt: updated.updatedAt,
      },
    };
  });

  // GET /api/threshold/status - Get current TKG status based on latest speedtest
  fastify.get('/api/threshold/status', async (request, reply) => {
    const result = await thresholdService.checkLatest();

    if (!result) {
      reply.status(404);
      return { error: 'Keine Speedtest-Ergebnisse vorhanden' };
    }

    return { data: result };
  });

  // GET /api/threshold/check - Check if thresholds are breached
  fastify.get('/api/threshold/check', async () => {
    const result = await thresholdService.isThresholdBreached();
    return { data: result };
  });
}
