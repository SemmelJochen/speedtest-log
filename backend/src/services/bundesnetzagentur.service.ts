import { chromium, Browser, Page } from 'playwright';
import { PrismaClient, BundesnetzagenturExport } from '@prisma/client';
import { config } from '../config.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { createWriteStream } from 'fs';

// Selectors for breitbandmessung.de - based on actual page HTML analysis
// Last updated: 2026-01-22
//
// FLOW:
// 1. Cookie banner appears at bottom -> Accept cookies first (blocks other clicks!)
// 2. Geolocation modal may appear -> Auto-dismisses when Playwright grants permission
// 3. Click "Browsermessung starten" button
// 4. Privacy consent modal appears -> Click "Akzeptieren"
// 5. Measurement runs (60-120 seconds)
// 6. "Die Messung ist abgeschlossen." appears with results
//
const SELECTORS = {
  // Cookie banner - appears at bottom of page, BLOCKS other clicks!
  cookieBanner: '#cookie-banner',
  cookieAcceptAll: 'button:has-text("Alle Cookies zulassen")',

  // Geolocation modal - "Zugriff erlauben"
  // Auto-dismisses when Playwright grants geolocation permission
  geolocationModal: '.modal:has-text("Zugriff erlauben")',

  // Start button on /test page
  startButton: 'button.btn-primary:has-text("Browsermessung starten")',

  // Privacy consent modal - appears after clicking start
  consentModal: '.modal.show',
  consentAcceptButton: '.modal.show button:has-text("Akzeptieren")',

  // Completion detection - ONLY use the specific completion text
  // The h1 changes from "Die Laufzeitmessung wird durchgeführt." to "Die Messung ist abgeschlossen."
  completionIndicator: 'h1:has-text("Die Messung ist abgeschlossen")',

  // Export link - "Ergebnis exportieren (csv)"
  exportButton: 'text="Ergebnis exportieren (csv)"',

  // Metadata table with date/time/test-id
  metadataTable: '.more-info table',
};

export interface MeasurementResult {
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyMs: number | null;
  screenshotPath: string;
  exportPath: string | null;
  zipPath: string;
}

export class BundesnetzagenturService {
  private log: Logger;
  private browser: Browser | null = null;
  private isRunning = false;
  private currentExportId: number | null = null;

  constructor(private prisma: PrismaClient) {
    this.log = new Logger('BundesnetzagenturService');
  }

  /**
   * Initialize service - cleanup stuck measurements from previous runs
   */
  async initialize(): Promise<void> {
    await this.cleanupStuckMeasurements();
  }

  /**
   * Cleanup measurements that are stuck in 'running' or 'pending' state
   * This can happen if the server crashed during a measurement
   */
  async cleanupStuckMeasurements(): Promise<number> {
    const stuckTimeout = new Date(Date.now() - config.bundesnetzagentur.stuckTimeoutMs);

    const stuckMeasurements = await this.prisma.bundesnetzagenturExport.updateMany({
      where: {
        status: { in: ['running', 'pending'] },
        createdAt: { lt: stuckTimeout },
      },
      data: {
        status: 'failed',
        error: 'Measurement timed out (server restart or stuck process)',
      },
    });

    if (stuckMeasurements.count > 0) {
      this.log.warn(`Cleaned up ${stuckMeasurements.count} stuck measurements`);
    }

    return stuckMeasurements.count;
  }

  /**
   * Try to click an element using multiple possible selectors
   * Returns true if successful, false otherwise
   */
  private async tryClickSelectors(page: Page, selectors: string[], description: string): Promise<boolean> {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          this.log.debug(`Clicked ${description} using selector: ${selector}`);
          return true;
        }
      } catch {
        // Continue to next selector
      }
    }
    this.log.debug(`Could not find ${description} with any selector`);
    return false;
  }

  /**
   * Wait for any of the given selectors to appear
   */
  private async waitForAnySelector(page: Page, selectors: string[], timeout: number): Promise<boolean> {
    const selectorPromises = selectors.map((selector) =>
      page.waitForSelector(selector, { timeout, state: 'visible' }).catch(() => null)
    );

    try {
      const result = await Promise.race(selectorPromises);
      return result !== null;
    } catch {
      return false;
    }
  }

  /**
   * Parse CSV export from Bundesnetzagentur to extract measurement values
   * CSV format varies, but typically contains Download, Upload, and Latency/Ping
   */
  private parseCSVResults(csvContent: string): {
    download: number | null;
    upload: number | null;
    latency: number | null;
  } {
    const result = { download: null as number | null, upload: null as number | null, latency: null as number | null };

    try {
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) return result;

      // First line is header, second line is data
      // Strip quotes from CSV values (CSV uses "value" format)
      const stripQuotes = (s: string) => s.replace(/^"|"$/g, '').trim();
      const headers = lines[0].split(';').map((h) => stripQuotes(h).toLowerCase());
      const values = lines[1].split(';').map((v) => stripQuotes(v));

      // Find relevant columns
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const value = values[i];

        // Parse number (handle German decimal format: comma instead of dot)
        const numValue = parseFloat(value.replace(',', '.'));
        if (isNaN(numValue)) continue;

        // Match common header names
        if (header.includes('download') || header.includes('empfang')) {
          result.download = numValue;
        } else if (header.includes('upload') || header.includes('senden')) {
          result.upload = numValue;
        } else if (header.includes('latenz') || header.includes('ping') || header.includes('laufzeit')) {
          result.latency = numValue;
        }
      }

      this.log.debug('Parsed CSV', { headers, values, result });
    } catch (error) {
      this.log.warn('CSV parsing failed', error);
    }

    return result;
  }

  /**
   * Ensure export directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(config.exports.baseDir, { recursive: true });
    await fs.mkdir(config.exports.screenshotsDir, { recursive: true });
    await fs.mkdir(config.exports.dataDir, { recursive: true });
    await fs.mkdir(config.exports.zipsDir, { recursive: true });
  }

  /**
   * Generate unique filename based on timestamp
   */
  private generateFilename(prefix: string, extension: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}_${timestamp}.${extension}`;
  }

  /**
   * Start a new measurement and record it in the database
   */
  async startMeasurement(
    triggerReason: 'manual' | 'threshold_warning' | 'threshold_critical',
    triggerResultId?: number
  ): Promise<BundesnetzagenturExport> {
    if (this.isRunning) {
      throw new Error('Eine Messung läuft bereits');
    }

    // Cleanup any old stuck measurements first
    await this.cleanupStuckMeasurements();

    this.log.info('Starting Bundesnetzagentur measurement', { triggerReason, triggerResultId });

    // Create database record
    const exportRecord = await this.prisma.bundesnetzagenturExport.create({
      data: {
        triggerReason,
        triggerResultId,
        status: 'pending',
      },
    });

    this.currentExportId = exportRecord.id;

    // Run measurement in background with timeout wrapper
    this.runMeasurementWithTimeout(exportRecord.id).catch((error) => {
      this.log.error('Measurement failed', error);
    });

    return exportRecord;
  }

  /**
   * Run measurement with overall timeout protection
   */
  private async runMeasurementWithTimeout(exportId: number): Promise<void> {
    const timeoutMs = config.bundesnetzagentur.stuckTimeoutMs;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Measurement timed out after ${timeoutMs / 1000} seconds`));
      }, timeoutMs);
    });

    try {
      await Promise.race([this.runMeasurement(exportId), timeoutPromise]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log.error('Measurement failed or timed out', { exportId, error: errorMessage });

      // Update database record
      await this.prisma.bundesnetzagenturExport.update({
        where: { id: exportId },
        data: {
          status: 'failed',
          error: errorMessage,
        },
      });

      // Cleanup browser if still running
      if (this.browser) {
        try {
          await this.browser.close();
        } catch {
          // Ignore close errors
        }
        this.browser = null;
      }

      this.isRunning = false;
      this.currentExportId = null;
    }
  }

  /**
   * Run the actual measurement with Playwright
   */
  private async runMeasurement(exportId: number): Promise<void> {
    this.isRunning = true;
    await this.ensureDirectories();

    // Update status to running
    await this.prisma.bundesnetzagenturExport.update({
      where: { id: exportId },
      data: { status: 'running' },
    });

    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      this.log.info('Launching browser for measurement');

      browser = await chromium.launch({
        headless: config.playwright.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.browser = browser;

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        locale: 'de-DE',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        // Grant geolocation permission and provide configured location
        permissions: ['geolocation'],
        geolocation: config.bundesnetzagentur.geolocation,
      });

      page = await context.newPage();

      // Navigate to Bundesnetzagentur speed test
      this.log.info('Navigating to breitbandmessung.de');
      await page.goto('https://breitbandmessung.de/test', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Wait for page to fully load
      this.log.info('Waiting for page to fully load...');
      await page.waitForTimeout(2000);

      // Take screenshot of initial page
      const preScreenshotPath = path.join(
        config.exports.screenshotsDir,
        this.generateFilename('01_initial_page', 'png')
      );
      await page.screenshot({ path: preScreenshotPath, fullPage: true });
      this.log.debug('Initial page screenshot saved');

      // STEP 1: Handle cookie banner (MUST be done first - it blocks other clicks!)
      this.log.info('Step 1: Checking for cookie banner...');
      try {
        const cookieBanner = await page.$(SELECTORS.cookieBanner);
        if (cookieBanner) {
          this.log.info('Cookie banner detected, accepting cookies...');
          await page.click(SELECTORS.cookieAcceptAll, { timeout: 5000 });
          this.log.info('Clicked "Alle Cookies zulassen"');
          await page.waitForTimeout(500); // Wait for banner to disappear
        }
      } catch (cookieError) {
        this.log.debug('Cookie banner not found or already dismissed', cookieError);
      }

      // STEP 2: Wait for geolocation modal to auto-dismiss (Playwright grants permission)
      this.log.info('Step 2: Checking for geolocation modal...');
      try {
        const geoModal = await page.$(SELECTORS.geolocationModal);
        if (geoModal) {
          this.log.info('Geolocation modal detected - waiting for auto-dismiss...');
          // Wait for modal to disappear (should happen automatically since we granted permission)
          await page.waitForSelector(SELECTORS.geolocationModal, { state: 'hidden', timeout: 15000 });
          this.log.info('Geolocation modal dismissed');
        }
      } catch (geoError) {
        this.log.debug('Geolocation modal not found or already dismissed', geoError);
      }

      // Take screenshot after initial modals
      const afterModalsScreenshotPath = path.join(
        config.exports.screenshotsDir,
        this.generateFilename('02_after_modals', 'png')
      );
      await page.screenshot({ path: afterModalsScreenshotPath, fullPage: true });

      // STEP 3: Click "Browsermessung starten" button
      this.log.info('Step 3: Looking for "Browsermessung starten" button...');
      try {
        await page.waitForSelector(SELECTORS.startButton, { timeout: 10000, state: 'visible' });
        await page.click(SELECTORS.startButton);
        this.log.info('Clicked "Browsermessung starten" button');
      } catch {
        this.log.warn('Primary selector failed, trying fallback...');
        await page.click('button.btn-primary:has-text("starten")');
      }

      // STEP 4: Handle privacy consent modal
      this.log.info('Step 4: Waiting for consent modal...');
      await page.waitForTimeout(1500); // Wait for modal animation

      try {
        const consentModal = await page.$(SELECTORS.consentModal);
        if (consentModal) {
          this.log.info('Consent modal detected');

          // Take screenshot of modal
          const modalScreenshotPath = path.join(
            config.exports.screenshotsDir,
            this.generateFilename('03_consent_modal', 'png')
          );
          await page.screenshot({ path: modalScreenshotPath, fullPage: true });

          // Click "Akzeptieren"
          await page.waitForSelector(SELECTORS.consentAcceptButton, { timeout: 5000, state: 'visible' });
          await page.click(SELECTORS.consentAcceptButton);
          this.log.info('Clicked "Akzeptieren" in consent modal');
        }
      } catch (modalError) {
        this.log.warn('Consent modal handling failed', modalError);
      }

      // STEP 5: Measurement is now running
      await page.waitForTimeout(3000); // Wait for measurement to start
      const duringScreenshotPath = path.join(
        config.exports.screenshotsDir,
        this.generateFilename('04_measurement_running', 'png')
      );
      await page.screenshot({ path: duringScreenshotPath, fullPage: true });
      this.log.info('Measurement started, waiting for completion...');

      // Wait for measurement to complete
      // Detection: h1 text changes to "Die Messung ist abgeschlossen."
      this.log.info('Waiting for "Die Messung ist abgeschlossen"...');

      let completionFound = false;
      try {
        await page.waitForSelector(SELECTORS.completionIndicator, {
          timeout: config.playwright.timeout,
          state: 'visible',
        });
        completionFound = true;
        this.log.info('Measurement completed - detected completion indicator');
        // Small delay to ensure all results are rendered
        await page.waitForTimeout(2000);
      } catch (timeoutError) {
        this.log.warn('Completion indicator not found within timeout, taking screenshot anyway');
      }

      // Take final screenshot (result page)
      const resultScreenshotPath = path.join(
        config.exports.screenshotsDir,
        this.generateFilename('05_measurement_result', 'png')
      );
      await page.screenshot({ path: resultScreenshotPath, fullPage: true });
      this.log.info('Result screenshot saved', { path: resultScreenshotPath });

      // Note: Results are rendered on CANVAS elements - cannot extract text directly!
      // We will get the values from the CSV export instead.
      let downloadMbps: number | null = null;
      let uploadMbps: number | null = null;
      let latencyMs: number | null = null;

      // Try to export CSV to get actual measurement values
      let exportPath: string | null = null;
      try {
        this.log.info('Looking for CSV export button...');
        const exportButton = await page.$(SELECTORS.exportButton);

        if (exportButton) {
          this.log.info('Found export button, clicking...');

          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 15000 }),
            exportButton.click(),
          ]);

          exportPath = path.join(config.exports.dataDir, this.generateFilename('messung', 'csv'));
          await download.saveAs(exportPath);
          this.log.info('CSV export saved', { path: exportPath });

          // Parse CSV to extract values
          try {
            const csvContent = await fs.readFile(exportPath, 'utf-8');
            this.log.debug('CSV content:', { csvContent: csvContent.substring(0, 500) });

            // CSV format is typically: header row, then data row
            // Try to extract download, upload, latency from CSV
            const lines = csvContent.split('\n');
            if (lines.length >= 2) {
              // Parse based on typical Bundesnetzagentur CSV format
              // Usually contains columns like: Download, Upload, Latenz/Ping
              const parsed = this.parseCSVResults(csvContent);
              downloadMbps = parsed.download;
              uploadMbps = parsed.upload;
              latencyMs = parsed.latency;

              this.log.info('Extracted results from CSV', { downloadMbps, uploadMbps, latencyMs });
            }
          } catch (parseError) {
            this.log.warn('Could not parse CSV file', parseError);
          }
        } else {
          this.log.warn('Export button not found');
        }
      } catch (exportError) {
        this.log.warn('CSV export failed', exportError);
      }

      // Extract metadata from page (date, time, test-id)
      let testMetadata: { date?: string; time?: string; testId?: string } = {};
      try {
        testMetadata = await page.evaluate(() => {
          const timeElements = document.querySelectorAll('time');
          const date = timeElements[0]?.textContent || undefined;
          const time = timeElements[1]?.textContent?.replace(' Uhr', '') || undefined;

          // Test-ID is in the table
          const cells = document.querySelectorAll('.more-info td');
          let testId: string | undefined;
          for (const cell of cells) {
            const text = cell.textContent || '';
            if (text.length > 50 && /^[a-f0-9]+$/.test(text)) {
              testId = text;
              break;
            }
          }

          return { date, time, testId };
        });
        this.log.info('Extracted metadata', testMetadata);
      } catch {
        this.log.debug('Could not extract metadata');
      }

      // Save page HTML for debugging
      const htmlPath = path.join(config.exports.dataDir, this.generateFilename('page', 'html'));
      const html = await page.content();
      await fs.writeFile(htmlPath, html, 'utf-8');

      // Create ZIP with all files (including all screenshots for debugging)
      // Collect all screenshot paths (some may not exist if steps were skipped)
      const allScreenshots = [
        preScreenshotPath,
        afterModalsScreenshotPath,
        duringScreenshotPath,
        resultScreenshotPath,
      ].filter(Boolean);
      const zipPath = await this.createZip(exportId, allScreenshots, exportPath, htmlPath, {
        downloadMbps,
        uploadMbps,
        latencyMs,
        testMetadata,
      });

      // Update database record
      await this.prisma.bundesnetzagenturExport.update({
        where: { id: exportId },
        data: {
          status: 'completed',
          downloadMbps,
          uploadMbps,
          latencyMs,
          screenshotPath: resultScreenshotPath,
          exportPath,
          zipPath,
        },
      });

      this.log.info('Measurement completed successfully', { exportId, zipPath });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log.error('Measurement failed', error);

      await this.prisma.bundesnetzagenturExport.update({
        where: { id: exportId },
        data: {
          status: 'failed',
          error: errorMessage,
        },
      });
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore close errors
        }
      }
      this.browser = null;
      this.isRunning = false;
      this.currentExportId = null;
    }
  }

  /**
   * Create ZIP archive with all measurement files
   */
  private async createZip(
    exportId: number,
    screenshotPaths: string[],
    exportPath: string | null,
    htmlPath: string,
    measurementData?: {
      downloadMbps: number | null;
      uploadMbps: number | null;
      latencyMs: number | null;
      testMetadata?: { date?: string; time?: string; testId?: string };
    }
  ): Promise<string> {
    const zipPath = path.join(config.exports.zipsDir, this.generateFilename(`measurement_${exportId}`, 'zip'));

    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        this.log.info('ZIP created', { path: zipPath, size: archive.pointer() });
        resolve(zipPath);
      });

      archive.on('error', reject);

      archive.pipe(output);

      // Add all screenshots to archive
      for (const screenshotPath of screenshotPaths) {
        try {
          archive.file(screenshotPath, { name: `screenshots/${path.basename(screenshotPath)}` });
        } catch {
          this.log.warn(`Could not add screenshot to ZIP: ${screenshotPath}`);
        }
      }

      // Add HTML page
      archive.file(htmlPath, { name: path.basename(htmlPath) });

      // Add CSV export if available
      if (exportPath) {
        archive.file(exportPath, { name: path.basename(exportPath) });
      }

      // Add comprehensive metadata
      const metadata = {
        exportId,
        timestamp: new Date().toISOString(),
        source: 'breitbandmessung.de',
        measurement: {
          downloadMbps: measurementData?.downloadMbps ?? null,
          uploadMbps: measurementData?.uploadMbps ?? null,
          latencyMs: measurementData?.latencyMs ?? null,
        },
        bundesnetzagenturData: {
          date: measurementData?.testMetadata?.date ?? null,
          time: measurementData?.testMetadata?.time ?? null,
          testId: measurementData?.testMetadata?.testId ?? null,
        },
        files: {
          screenshots: screenshotPaths.map((p) => path.basename(p)),
          csvExport: exportPath ? path.basename(exportPath) : null,
          html: path.basename(htmlPath),
        },
        disclaimer:
          'Diese Messung wurde automatisch durchgeführt und dient nur zur Dokumentation. ' +
          'Für rechtlich bindende Nachweise nach TKG verwenden Sie bitte die offizielle ' +
          'Desktop-App der Bundesnetzagentur mit 20 Messungen an 2 aufeinanderfolgenden Tagen.',
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

      archive.finalize();
    });
  }

  /**
   * Get measurement status
   */
  async getStatus(exportId: number): Promise<BundesnetzagenturExport | null> {
    return this.prisma.bundesnetzagenturExport.findUnique({
      where: { id: exportId },
    });
  }

  /**
   * Get all exports
   */
  async getAllExports(limit = 20): Promise<BundesnetzagenturExport[]> {
    return this.prisma.bundesnetzagenturExport.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get ZIP path for download
   */
  async getZipPath(exportId: number): Promise<string | null> {
    const exportRecord = await this.prisma.bundesnetzagenturExport.findUnique({
      where: { id: exportId },
    });

    if (!exportRecord?.zipPath) {
      return null;
    }

    // Verify file exists
    try {
      await fs.access(exportRecord.zipPath);
      return exportRecord.zipPath;
    } catch {
      return null;
    }
  }

  /**
   * Check if a measurement is currently running
   */
  isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get current running measurement ID
   */
  getCurrentExportId(): number | null {
    return this.currentExportId;
  }

  /**
   * Cancel current measurement (if running)
   */
  async cancelCurrentMeasurement(): Promise<boolean> {
    if (!this.isRunning || !this.currentExportId) {
      return false;
    }

    this.log.warn('Cancelling current measurement', { exportId: this.currentExportId });

    // Close browser to stop measurement
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore close errors
      }
      this.browser = null;
    }

    // Update database record
    await this.prisma.bundesnetzagenturExport.update({
      where: { id: this.currentExportId },
      data: {
        status: 'failed',
        error: 'Measurement cancelled by user',
      },
    });

    this.isRunning = false;
    this.currentExportId = null;

    return true;
  }
}
