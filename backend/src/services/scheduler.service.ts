import cron from 'node-cron';
import type { SpeedtestService } from './speedtest.service.js';
import type { ThresholdService } from './threshold.service.js';
import type { BundesnetzagenturService } from './bundesnetzagentur.service.js';
import { Logger } from '../utils/logger.js';

export class SchedulerService {
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;
  private log: Logger;
  private runCount = 0;

  constructor(
    private speedtestService: SpeedtestService,
    private thresholdService?: ThresholdService,
    private bundesnetzagenturService?: BundesnetzagenturService
  ) {
    this.log = new Logger('SchedulerService');
  }

  /**
   * Start the scheduler with the given cron expression
   * Default: every 5 minutes
   */
  start(cronExpression: string = '*/5 * * * *'): void {
    if (this.task) {
      this.log.warn('Scheduler already running, ignoring start request');
      return;
    }

    this.log.info('Initializing scheduler', { cronExpression });

    this.task = cron.schedule(cronExpression, async () => {
      if (this.isRunning) {
        this.log.warn('Previous speedtest still running, skipping this scheduled run');
        return;
      }

      this.runCount++;
      this.log.info(`Scheduled speedtest triggered`, { runNumber: this.runCount });

      this.isRunning = true;
      try {
        const result = await this.speedtestService.runAndSave();
        if (result.success) {
          this.log.info('Scheduled speedtest completed successfully', {
            resultId: result.resultId,
          });

          // Check thresholds and trigger Bundesnetzagentur measurement if needed
          await this.checkThresholdAndTrigger(result.resultId);
        } else {
          this.log.warn('Scheduled speedtest completed with error', { error: result.error });
        }
      } catch (error) {
        this.log.error('Scheduled speedtest failed unexpectedly', {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.isRunning = false;
      }
    });

    this.log.info('Scheduler started successfully');
  }

  /**
   * Check if threshold is breached and trigger Bundesnetzagentur measurement
   */
  private async checkThresholdAndTrigger(resultId?: number): Promise<void> {
    if (!this.thresholdService || !this.bundesnetzagenturService) {
      this.log.debug('Threshold services not configured, skipping auto-trigger check');
      return;
    }

    try {
      const breach = await this.thresholdService.isThresholdBreached();

      if (!breach.breached) {
        this.log.debug('Threshold check passed', { status: breach.status });
        return;
      }

      // Threshold breached - check if measurement is already running
      if (this.bundesnetzagenturService.isCurrentlyRunning()) {
        this.log.info('Threshold breached but Bundesnetzagentur measurement already running', {
          status: breach.status,
        });
        return;
      }

      // Trigger automatic measurement
      const triggerReason =
        breach.status === 'critical' ? 'threshold_critical' : 'threshold_warning';

      this.log.warn('Threshold breached, triggering automatic Bundesnetzagentur measurement', {
        status: breach.status,
        triggerReason,
        resultId: breach.resultId,
      });

      await this.bundesnetzagenturService.startMeasurement(triggerReason, breach.resultId);

      this.log.info('Automatic Bundesnetzagentur measurement started');
    } catch (error) {
      this.log.error('Failed to check threshold or trigger measurement', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.log.info('Scheduler stopped', { totalRuns: this.runCount });
    }
  }

  /**
   * Check if scheduler is active
   */
  isActive(): boolean {
    return this.task !== null;
  }

  /**
   * Manually trigger a speedtest (useful for testing or on-demand)
   */
  async triggerManual(): Promise<{ success: boolean; resultId?: number; error?: string }> {
    if (this.isRunning) {
      this.log.warn('Manual trigger rejected - speedtest already running');
      return { success: false, error: 'A speedtest is already running' };
    }

    this.log.info('Manual speedtest triggered');
    this.isRunning = true;

    try {
      const result = await this.speedtestService.runAndSave();
      if (result.success) {
        this.log.info('Manual speedtest completed successfully', { resultId: result.resultId });

        // Check thresholds and trigger Bundesnetzagentur measurement if needed
        await this.checkThresholdAndTrigger(result.resultId);
      } else {
        this.log.warn('Manual speedtest completed with error', { error: result.error });
      }
      return result;
    } catch (error) {
      this.log.error('Manual speedtest failed unexpectedly', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
}
