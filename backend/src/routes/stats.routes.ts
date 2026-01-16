import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { bytesToMbps } from '../types/speedtest.js';

export function registerStatsRoutes(fastify: FastifyInstance, prisma: PrismaClient) {
  // GET /api/stats - Get aggregated statistics
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
    };
  }>('/api/stats', async (request) => {
    const { from, to } = request.query;

    const where: { timestamp?: { gte?: Date; lte?: Date }; error?: null } = {
      error: null, // Only successful tests
    };

    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    // Get aggregated stats using raw query for more control
    const results = await prisma.speedtestResult.findMany({
      where,
      select: {
        downloadBandwidth: true,
        uploadBandwidth: true,
        pingLatency: true,
        packetLoss: true,
      },
    });

    if (results.length === 0) {
      return {
        data: {
          count: 0,
          download: null,
          upload: null,
          ping: null,
          packetLoss: null,
        },
      };
    }

    // Calculate statistics
    const downloads = results
      .map((r) => r.downloadBandwidth)
      .filter((v): v is bigint => v !== null)
      .map((v) => Number(v));

    const uploads = results
      .map((r) => r.uploadBandwidth)
      .filter((v): v is bigint => v !== null)
      .map((v) => Number(v));

    const pings = results
      .map((r) => r.pingLatency)
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .map((v) => Number(v));

    const packetLosses = results
      .map((r) => r.packetLoss)
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .map((v) => Number(v));

    const calcStats = (values: number[]) => {
      if (values.length === 0) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const p95Index = Math.floor(values.length * 0.95);
      const p5Index = Math.floor(values.length * 0.05);

      return {
        avg: Number(avg.toFixed(2)),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p5: sorted[p5Index],
        p95: sorted[p95Index],
        median: sorted[Math.floor(sorted.length / 2)],
      };
    };

    const downloadStats = calcStats(downloads);
    const uploadStats = calcStats(uploads);

    return {
      data: {
        count: results.length,
        download: downloadStats
          ? {
              avg: bytesToMbps(downloadStats.avg),
              min: bytesToMbps(downloadStats.min),
              max: bytesToMbps(downloadStats.max),
              p5: bytesToMbps(downloadStats.p5),
              p95: bytesToMbps(downloadStats.p95),
              median: bytesToMbps(downloadStats.median),
            }
          : null,
        upload: uploadStats
          ? {
              avg: bytesToMbps(uploadStats.avg),
              min: bytesToMbps(uploadStats.min),
              max: bytesToMbps(uploadStats.max),
              p5: bytesToMbps(uploadStats.p5),
              p95: bytesToMbps(uploadStats.p95),
              median: bytesToMbps(uploadStats.median),
            }
          : null,
        ping: calcStats(pings),
        packetLoss: calcStats(packetLosses),
      },
    };
  });

  // GET /api/stats/hourly - Get hourly averages for charts
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      hours?: string;
    };
  }>('/api/stats/hourly', async (request) => {
    const { from, to, hours = '24' } = request.query;

    let startDate: Date;

    if (from) {
      startDate = new Date(from);
    } else {
      startDate = new Date();
      startDate.setHours(startDate.getHours() - parseInt(hours, 10));
    }

    const endDate = to ? new Date(to) : new Date();

    // Raw query for hourly grouping
    const hourlyData = await prisma.$queryRaw<
      Array<{
        hour: Date;
        avg_download: bigint | null;
        avg_upload: bigint | null;
        avg_ping: number | null;
        count: bigint;
      }>
    >`
      SELECT
        date_trunc('hour', timestamp) as hour,
        AVG(download_bandwidth)::bigint as avg_download,
        AVG(upload_bandwidth)::bigint as avg_upload,
        AVG(ping_latency) as avg_ping,
        COUNT(*) as count
      FROM speedtest_results
      WHERE timestamp >= ${startDate}
        AND timestamp <= ${endDate}
        AND error IS NULL
      GROUP BY date_trunc('hour', timestamp)
      ORDER BY hour ASC
    `;

    return {
      data: hourlyData.map((row) => ({
        hour: row.hour,
        download: row.avg_download ? bytesToMbps(Number(row.avg_download)) : null,
        upload: row.avg_upload ? bytesToMbps(Number(row.avg_upload)) : null,
        ping: row.avg_ping ? Number(row.avg_ping.toFixed(2)) : null,
        count: Number(row.count),
      })),
    };
  });

  // GET /api/stats/daily - Get daily averages for charts
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      days?: string;
    };
  }>('/api/stats/daily', async (request) => {
    const { from, to, days = '30' } = request.query;

    let startDate: Date;

    if (from) {
      startDate = new Date(from);
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days, 10));
    }

    const endDate = to ? new Date(to) : new Date();

    // Raw query for daily grouping
    const dailyData = await prisma.$queryRaw<
      Array<{
        day: Date;
        avg_download: bigint | null;
        avg_upload: bigint | null;
        avg_ping: number | null;
        min_download: bigint | null;
        max_download: bigint | null;
        count: bigint;
      }>
    >`
      SELECT
        date_trunc('day', timestamp) as day,
        AVG(download_bandwidth)::bigint as avg_download,
        AVG(upload_bandwidth)::bigint as avg_upload,
        AVG(ping_latency) as avg_ping,
        MIN(download_bandwidth)::bigint as min_download,
        MAX(download_bandwidth)::bigint as max_download,
        COUNT(*) as count
      FROM speedtest_results
      WHERE timestamp >= ${startDate}
        AND timestamp <= ${endDate}
        AND error IS NULL
      GROUP BY date_trunc('day', timestamp)
      ORDER BY day ASC
    `;

    return {
      data: dailyData.map((row) => ({
        day: row.day,
        download: {
          avg: row.avg_download ? bytesToMbps(Number(row.avg_download)) : null,
          min: row.min_download ? bytesToMbps(Number(row.min_download)) : null,
          max: row.max_download ? bytesToMbps(Number(row.max_download)) : null,
        },
        upload: row.avg_upload ? bytesToMbps(Number(row.avg_upload)) : null,
        ping: row.avg_ping ? Number(row.avg_ping.toFixed(2)) : null,
        count: Number(row.count),
      })),
    };
  });
}
