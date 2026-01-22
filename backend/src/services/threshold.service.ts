import { PrismaClient, SpeedtestResult, ThresholdConfig } from '@prisma/client';
import { config } from '../config.js';
import { Logger } from '../utils/logger.js';

export type ThresholdStatus = 'good' | 'warning' | 'critical' | 'unknown';

export interface ThresholdCheckResult {
  status: ThresholdStatus;
  downloadStatus: ThresholdStatus;
  uploadStatus: ThresholdStatus;
  downloadMbps: number;
  uploadMbps: number;
  downloadPercent: number;
  uploadPercent: number;
  contractedDownload: number;
  contractedUpload: number;
  thresholds: {
    normal: number;
    critical: number;
  };
}

export class ThresholdService {
  private log: Logger;

  constructor(private prisma: PrismaClient) {
    this.log = new Logger('ThresholdService');
  }

  /**
   * Get or create the active threshold configuration
   */
  async getConfig(): Promise<ThresholdConfig> {
    let thresholdConfig = await this.prisma.thresholdConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!thresholdConfig) {
      this.log.info('No threshold config found, creating default');
      thresholdConfig = await this.prisma.thresholdConfig.create({
        data: {
          contractedDownload: config.threshold.defaultContractedDownload,
          contractedUpload: config.threshold.defaultContractedUpload,
          normalThreshold: config.threshold.normalThreshold,
          criticalThreshold: config.threshold.criticalThreshold,
          isActive: true,
        },
      });
    }

    return thresholdConfig;
  }

  /**
   * Update threshold configuration
   */
  async updateConfig(data: {
    contractedDownload?: number;
    contractedUpload?: number;
    normalThreshold?: number;
    criticalThreshold?: number;
  }): Promise<ThresholdConfig> {
    const currentConfig = await this.getConfig();

    const updated = await this.prisma.thresholdConfig.update({
      where: { id: currentConfig.id },
      data: {
        contractedDownload: data.contractedDownload ?? currentConfig.contractedDownload,
        contractedUpload: data.contractedUpload ?? currentConfig.contractedUpload,
        normalThreshold: data.normalThreshold ?? currentConfig.normalThreshold,
        criticalThreshold: data.criticalThreshold ?? currentConfig.criticalThreshold,
      },
    });

    this.log.info('Threshold config updated', {
      contractedDownload: updated.contractedDownload,
      contractedUpload: updated.contractedUpload,
      normalThreshold: updated.normalThreshold,
      criticalThreshold: updated.criticalThreshold,
    });

    return updated;
  }

  /**
   * Convert bandwidth from bytes/second to Mbps
   */
  private bytesToMbps(bytes: bigint | null): number {
    if (!bytes) return 0;
    return (Number(bytes) * 8) / 1_000_000;
  }

  /**
   * Determine status based on percentage of contracted speed
   */
  private getStatusFromPercent(percent: number, thresholdConfig: ThresholdConfig): ThresholdStatus {
    if (percent >= thresholdConfig.normalThreshold) {
      return 'good';
    } else if (percent >= thresholdConfig.criticalThreshold) {
      return 'warning';
    } else {
      return 'critical';
    }
  }

  /**
   * Check a speedtest result against thresholds
   */
  async checkResult(result: SpeedtestResult): Promise<ThresholdCheckResult> {
    const thresholdConfig = await this.getConfig();

    const downloadMbps = this.bytesToMbps(result.downloadBandwidth);
    const uploadMbps = this.bytesToMbps(result.uploadBandwidth);

    const downloadPercent =
      thresholdConfig.contractedDownload > 0
        ? (downloadMbps / thresholdConfig.contractedDownload) * 100
        : 0;
    const uploadPercent =
      thresholdConfig.contractedUpload > 0
        ? (uploadMbps / thresholdConfig.contractedUpload) * 100
        : 0;

    const downloadStatus = this.getStatusFromPercent(downloadPercent, thresholdConfig);
    const uploadStatus = this.getStatusFromPercent(uploadPercent, thresholdConfig);

    // Overall status is the worst of download and upload
    let status: ThresholdStatus = 'good';
    if (downloadStatus === 'critical' || uploadStatus === 'critical') {
      status = 'critical';
    } else if (downloadStatus === 'warning' || uploadStatus === 'warning') {
      status = 'warning';
    }

    const checkResult: ThresholdCheckResult = {
      status,
      downloadStatus,
      uploadStatus,
      downloadMbps: Math.round(downloadMbps * 100) / 100,
      uploadMbps: Math.round(uploadMbps * 100) / 100,
      downloadPercent: Math.round(downloadPercent * 10) / 10,
      uploadPercent: Math.round(uploadPercent * 10) / 10,
      contractedDownload: thresholdConfig.contractedDownload,
      contractedUpload: thresholdConfig.contractedUpload,
      thresholds: {
        normal: thresholdConfig.normalThreshold,
        critical: thresholdConfig.criticalThreshold,
      },
    };

    this.log.debug('Threshold check completed', {
      status: checkResult.status,
      downloadPercent: `${checkResult.downloadPercent}%`,
      uploadPercent: `${checkResult.uploadPercent}%`,
    });

    return checkResult;
  }

  /**
   * Check the latest speedtest result
   */
  async checkLatest(): Promise<ThresholdCheckResult | null> {
    const latest = await this.prisma.speedtestResult.findFirst({
      where: { error: null },
      orderBy: { timestamp: 'desc' },
    });

    if (!latest) {
      this.log.warn('No successful speedtest results found');
      return null;
    }

    return this.checkResult(latest);
  }

  /**
   * Check if threshold is breached (warning or critical)
   */
  async isThresholdBreached(): Promise<{
    breached: boolean;
    status: ThresholdStatus;
    resultId?: number;
  }> {
    const latest = await this.prisma.speedtestResult.findFirst({
      where: { error: null },
      orderBy: { timestamp: 'desc' },
    });

    if (!latest) {
      return { breached: false, status: 'unknown' };
    }

    const check = await this.checkResult(latest);
    const breached = check.status === 'warning' || check.status === 'critical';

    if (breached) {
      this.log.warn('Threshold breached!', {
        status: check.status,
        downloadPercent: `${check.downloadPercent}%`,
        uploadPercent: `${check.uploadPercent}%`,
        resultId: latest.id,
      });
    }

    return { breached, status: check.status, resultId: latest.id };
  }
}
