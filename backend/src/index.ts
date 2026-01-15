import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { config } from './config.js';
import { SpeedtestService } from './services/speedtest.service.js';
import { SchedulerService } from './services/scheduler.service.js';
import { registerRoutes } from './routes/index.js';
import { Logger } from './utils/logger.js';

const log = new Logger('Server');

const prisma = new PrismaClient();
const speedtestService = new SpeedtestService(prisma);
const schedulerService = new SchedulerService(speedtestService);

const fastify = Fastify({
  logger: true
});

async function main() {
  try {
    log.info('Starting Speedtest Logger API', {
      port: config.port,
      host: config.host,
      cronSchedule: config.speedtestCron
    });

    // Register CORS - allow all origins for network access
    await fastify.register(cors, {
      origin: true,  // Allow all origins (required for LAN access)
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    });
    log.debug('CORS middleware registered');

    // Connect to database
    await prisma.$connect();
    log.info('Database connection established');

    // Register API routes
    registerRoutes(fastify, prisma, schedulerService);
    log.debug('API routes registered');

    // Start the scheduler
    schedulerService.start(config.speedtestCron);

    // Optionally run speedtest on startup
    if (config.runOnStartup) {
      log.info('Triggering initial speedtest on startup');
      // Run in background, don't block startup
      schedulerService.triggerManual().catch(err => {
        log.error('Initial speedtest failed', err);
      });
    }

    // Start server
    await fastify.listen({ port: config.port, host: config.host });
    log.info(`Server started successfully`, {
      url: `http://${config.host}:${config.port}`,
      environment: process.env.NODE_ENV || 'development'
    });

  } catch (err) {
    log.error('Failed to start server', err);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async () => {
  log.info('Shutdown signal received, stopping services...');
  schedulerService.stop();
  await prisma.$disconnect();
  log.info('Database connection closed');
  await fastify.close();
  log.info('Server shutdown complete');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();
