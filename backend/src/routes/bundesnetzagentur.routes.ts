import type { FastifyInstance } from 'fastify';
import type { BundesnetzagenturService } from '../services/bundesnetzagentur.service.js';
import type { ThresholdService } from '../services/threshold.service.js';
import { z } from 'zod';
import { createReadStream } from 'fs';
import path from 'path';

const startMeasurementSchema = z.object({
  triggerReason: z.enum(['manual', 'threshold_warning', 'threshold_critical']).default('manual'),
  triggerResultId: z.number().optional(),
});

export function registerBundesnetzagenturRoutes(
  fastify: FastifyInstance,
  bundesnetzagenturService: BundesnetzagenturService,
  thresholdService: ThresholdService
) {
  // POST /api/bundesnetzagentur/measure - Start official measurement
  fastify.post('/api/bundesnetzagentur/measure', async (request, reply) => {
    if (bundesnetzagenturService.isCurrentlyRunning()) {
      reply.status(409);
      return { error: 'Eine Messung läuft bereits' };
    }

    const parseResult = startMeasurementSchema.safeParse(request.body || {});

    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.errors };
    }

    const { triggerReason, triggerResultId } = parseResult.data;

    const exportRecord = await bundesnetzagenturService.startMeasurement(
      triggerReason,
      triggerResultId
    );

    reply.status(202); // Accepted - measurement started in background
    return {
      data: {
        id: exportRecord.id,
        status: exportRecord.status,
        message: 'Messung wurde gestartet. Bitte warten Sie auf das Ergebnis.',
      },
    };
  });

  // POST /api/bundesnetzagentur/measure-if-breached - Start measurement only if threshold breached
  fastify.post('/api/bundesnetzagentur/measure-if-breached', async (request, reply) => {
    const thresholdCheck = await thresholdService.isThresholdBreached();

    if (!thresholdCheck.breached) {
      return {
        data: {
          triggered: false,
          status: thresholdCheck.status,
          message: 'Keine Schwellenwert-Verletzung - keine Messung erforderlich',
        },
      };
    }

    if (bundesnetzagenturService.isCurrentlyRunning()) {
      reply.status(409);
      return { error: 'Eine Messung läuft bereits' };
    }

    const triggerReason =
      thresholdCheck.status === 'critical' ? 'threshold_critical' : 'threshold_warning';

    const exportRecord = await bundesnetzagenturService.startMeasurement(
      triggerReason,
      thresholdCheck.resultId
    );

    reply.status(202);
    return {
      data: {
        id: exportRecord.id,
        triggered: true,
        status: exportRecord.status,
        thresholdStatus: thresholdCheck.status,
        message: `Messung wegen ${triggerReason} gestartet`,
      },
    };
  });

  // GET /api/bundesnetzagentur/status - Get running measurement status
  fastify.get('/api/bundesnetzagentur/status', async () => {
    return {
      data: {
        isRunning: bundesnetzagenturService.isCurrentlyRunning(),
        currentExportId: bundesnetzagenturService.getCurrentExportId(),
      },
    };
  });

  // POST /api/bundesnetzagentur/cancel - Cancel current measurement
  fastify.post('/api/bundesnetzagentur/cancel', async (request, reply) => {
    const cancelled = await bundesnetzagenturService.cancelCurrentMeasurement();

    if (!cancelled) {
      reply.status(404);
      return { error: 'Keine laufende Messung zum Abbrechen' };
    }

    return {
      data: {
        message: 'Messung wurde abgebrochen',
      },
    };
  });

  // POST /api/bundesnetzagentur/cleanup - Cleanup stuck measurements
  fastify.post('/api/bundesnetzagentur/cleanup', async () => {
    const cleanedUp = await bundesnetzagenturService.cleanupStuckMeasurements();

    return {
      data: {
        cleanedUp,
        message:
          cleanedUp > 0
            ? `${cleanedUp} stuck measurements cleaned up`
            : 'No stuck measurements found',
      },
    };
  });

  // GET /api/bundesnetzagentur/exports - List all exports
  fastify.get('/api/bundesnetzagentur/exports', async (request) => {
    const query = request.query as { limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 20;

    const exports = await bundesnetzagenturService.getAllExports(limit);

    return {
      data: exports.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        triggerReason: e.triggerReason,
        downloadMbps: e.downloadMbps ? Number(e.downloadMbps) : null,
        uploadMbps: e.uploadMbps ? Number(e.uploadMbps) : null,
        latencyMs: e.latencyMs ? Number(e.latencyMs) : null,
        status: e.status,
        error: e.error,
        hasZip: !!e.zipPath,
        createdAt: e.createdAt,
      })),
    };
  });

  // GET /api/bundesnetzagentur/exports/:id - Get specific export
  fastify.get('/api/bundesnetzagentur/exports/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const exportId = parseInt(id, 10);

    if (isNaN(exportId)) {
      reply.status(400);
      return { error: 'Invalid export ID' };
    }

    const exportRecord = await bundesnetzagenturService.getStatus(exportId);

    if (!exportRecord) {
      reply.status(404);
      return { error: 'Export nicht gefunden' };
    }

    return {
      data: {
        id: exportRecord.id,
        timestamp: exportRecord.timestamp,
        triggerReason: exportRecord.triggerReason,
        triggerResultId: exportRecord.triggerResultId,
        downloadMbps: exportRecord.downloadMbps ? Number(exportRecord.downloadMbps) : null,
        uploadMbps: exportRecord.uploadMbps ? Number(exportRecord.uploadMbps) : null,
        latencyMs: exportRecord.latencyMs ? Number(exportRecord.latencyMs) : null,
        status: exportRecord.status,
        error: exportRecord.error,
        hasZip: !!exportRecord.zipPath,
        createdAt: exportRecord.createdAt,
      },
    };
  });

  // GET /api/bundesnetzagentur/exports/:id/download - Download ZIP
  fastify.get('/api/bundesnetzagentur/exports/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const exportId = parseInt(id, 10);

    if (isNaN(exportId)) {
      reply.status(400);
      return { error: 'Invalid export ID' };
    }

    const zipPath = await bundesnetzagenturService.getZipPath(exportId);

    if (!zipPath) {
      reply.status(404);
      return { error: 'ZIP-Datei nicht gefunden' };
    }

    const filename = path.basename(zipPath);

    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    return reply.send(createReadStream(zipPath));
  });
}
