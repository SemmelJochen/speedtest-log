import type { FastifyInstance } from 'fastify';
import type { PrismaClient, SpeedtestResult, SpeedtestServer } from '@prisma/client';
import { bytesToMbps, type SpeedtestResultFormatted } from '../types/speedtest.js';

type ResultWithServer = SpeedtestResult & { server: SpeedtestServer | null };

// Transform database result to API format
function formatResult(result: ResultWithServer): SpeedtestResultFormatted {
  return {
    id: result.id,
    timestamp: result.timestamp,
    ping: {
      jitter: result.pingJitter ? Number(result.pingJitter) : null,
      latency: result.pingLatency ? Number(result.pingLatency) : null,
      low: result.pingLow ? Number(result.pingLow) : null,
      high: result.pingHigh ? Number(result.pingHigh) : null
    },
    download: {
      mbps: bytesToMbps(result.downloadBandwidth),
      bytes: result.downloadBytes ? Number(result.downloadBytes) : null,
      elapsed: result.downloadElapsed
    },
    upload: {
      mbps: bytesToMbps(result.uploadBandwidth),
      bytes: result.uploadBytes ? Number(result.uploadBytes) : null,
      elapsed: result.uploadElapsed
    },
    packetLoss: result.packetLoss ? Number(result.packetLoss) : null,
    isp: result.isp,
    externalIp: result.externalIp,
    server: result.server ? {
      id: result.server.serverId,
      name: result.server.name,
      location: result.server.location,
      country: result.server.country
    } : null,
    resultUrl: result.resultUrl,
    error: result.error
  };
}

export function registerResultsRoutes(fastify: FastifyInstance, prisma: PrismaClient) {
  // GET /api/results - List all results with pagination
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    }
  }>('/api/results', async (request) => {
    const { from, to, limit = '100', offset = '0' } = request.query;

    const where: { timestamp?: { gte?: Date; lte?: Date } } = {};

    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const [results, total] = await Promise.all([
      prisma.speedtestResult.findMany({
        where,
        include: { server: true },
        orderBy: { timestamp: 'desc' },
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10)
      }),
      prisma.speedtestResult.count({ where })
    ]);

    return {
      data: results.map(formatResult),
      pagination: {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      }
    };
  });

  // GET /api/results/latest - Get most recent result
  fastify.get('/api/results/latest', async () => {
    const result = await prisma.speedtestResult.findFirst({
      include: { server: true },
      orderBy: { timestamp: 'desc' }
    });

    if (!result) {
      return { data: null };
    }

    return { data: formatResult(result) };
  });

  // GET /api/results/:id - Get single result
  fastify.get<{
    Params: { id: string }
  }>('/api/results/:id', async (request, reply) => {
    const { id } = request.params;

    const result = await prisma.speedtestResult.findUnique({
      where: { id: parseInt(id, 10) },
      include: { server: true }
    });

    if (!result) {
      reply.status(404);
      return { error: 'Result not found' };
    }

    return { data: formatResult(result) };
  });

  // DELETE /api/results/:id - Delete single result
  fastify.delete<{
    Params: { id: string }
  }>('/api/results/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      await prisma.speedtestResult.delete({
        where: { id: parseInt(id, 10) }
      });
      return { success: true };
    } catch {
      reply.status(404);
      return { error: 'Result not found' };
    }
  });

  // GET /api/servers - List all servers
  fastify.get('/api/servers', async () => {
    const servers = await prisma.speedtestServer.findMany({
      orderBy: { name: 'asc' }
    });

    return { data: servers };
  });
}
