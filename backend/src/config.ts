// Configuration with environment variable defaults

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',

  // Speedtest scheduler
  // Cron expression: default every 5 minutes
  speedtestCron: process.env.SPEEDTEST_CRON || '*/5 * * * *',

  // Run speedtest immediately on startup
  runOnStartup: process.env.RUN_ON_STARTUP === 'true',

  // Database URL (handled by Prisma via DATABASE_URL env)

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*'
};
