import cron from 'node-cron';
import type { SpeedtestService } from './speedtest.service.js';

export class SchedulerService {
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;

  constructor(private speedtestService: SpeedtestService) {}

  /**
   * Start the scheduler with the given cron expression
   * Default: every 5 minutes
   */
  start(cronExpression: string = '*/5 * * * *'): void {
    if (this.task) {
      console.log('Scheduler already running');
      return;
    }

    console.log(`Starting scheduler with cron: ${cronExpression}`);

    this.task = cron.schedule(cronExpression, async () => {
      if (this.isRunning) {
        console.log('Previous speedtest still running, skipping this iteration');
        return;
      }

      this.isRunning = true;
      try {
        await this.speedtestService.runAndSave();
      } finally {
        this.isRunning = false;
      }
    });

    console.log('Scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('Scheduler stopped');
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
      return { success: false, error: 'A speedtest is already running' };
    }

    this.isRunning = true;
    try {
      return await this.speedtestService.runAndSave();
    } finally {
      this.isRunning = false;
    }
  }
}
