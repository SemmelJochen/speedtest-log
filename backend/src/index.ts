import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { config } from './config.js';
import { SpeedtestService } from './services/speedtest.service.js';
import { SchedulerService } from './services/scheduler.service.js';
import { registerRoutes } from './routes/index.js';

const prisma = new PrismaClient();
const speedtestService = new SpeedtestService(prisma);
const schedulerService = new SchedulerService(speedtestService);

const fastify = Fastify({
  logger: true
});

async function main() {
  try {
    // Register CORS
    await fastify.register(cors, {
      origin: config.corsOrigin
    });

    // Connect to database
    await prisma.$connect();
    console.log('Connected to database');

    // Register API routes
    registerRoutes(fastify, prisma, schedulerService);

    // Start the scheduler
    schedulerService.start(config.speedtestCron);

    // Optionally run speedtest on startup
    if (config.runOnStartup) {
      console.log('Running initial speedtest...');
      // Run in background, don't block startup
      schedulerService.triggerManual().catch(err => {
        console.error('Initial speedtest failed:', err);
      });
    }

    // Start server
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Server running at http://${config.host}:${config.port}`);

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down...');
  schedulerService.stop();
  await prisma.$disconnect();
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main();
