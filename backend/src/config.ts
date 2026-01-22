// Configuration with environment variable defaults

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // TKG Threshold defaults (can be overridden via database)
  threshold: {
    defaultContractedDownload: parseInt(process.env.CONTRACTED_DOWNLOAD_MBPS || '100', 10),
    defaultContractedUpload: parseInt(process.env.CONTRACTED_UPLOAD_MBPS || '40', 10),
    normalThreshold: 90,   // 90% = Normalgeschwindigkeit nach TKG
    criticalThreshold: 50, // 50% = erhebliche Abweichung nach TKG
  },

  // Bundesnetzagentur export paths
  exports: {
    baseDir: path.resolve(__dirname, '../../exports'),
    screenshotsDir: path.resolve(__dirname, '../../exports/screenshots'),
    dataDir: path.resolve(__dirname, '../../exports/data'),
    zipsDir: path.resolve(__dirname, '../../exports/zips'),
  },

  // Playwright settings
  playwright: {
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    timeout: 180000, // 3 Minuten für die Messung
  },

  // Bundesnetzagentur measurement settings
  bundesnetzagentur: {
    // Max time a measurement can be "running" before considered stuck (5 minutes)
    stuckTimeoutMs: parseInt(process.env.BNA_STUCK_TIMEOUT_MS || '300000', 10),
    // Default geolocation (Berlin) - used for the site's location permission
    geolocation: {
      latitude: parseFloat(process.env.GEO_LAT || '52.52'),
      longitude: parseFloat(process.env.GEO_LON || '13.405'),
    },
  },
};
