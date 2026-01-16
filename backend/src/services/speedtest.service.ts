import { exec } from 'child_process';
import { promisify } from 'util';
import { PrismaClient } from '@prisma/client';
import type { SpeedtestCliResult, SpeedtestOutput } from '../types/speedtest.js';
import { Logger } from '../utils/logger.js';

const execAsync = promisify(exec);

export class SpeedtestService {
  private log: Logger;

  constructor(private prisma: PrismaClient) {
    this.log = new Logger('SpeedtestService');
  }

  /**
   * Run speedtest CLI and return parsed JSON result
   */
  async runSpeedtest(): Promise<SpeedtestOutput> {
    const endTimer = this.log.startTimer('runSpeedtest');

    try {
      this.log.info('Executing speedtest CLI command');

      const { stdout, stderr } = await execAsync(
        'speedtest --format=json --accept-license --accept-gdpr',
        { timeout: 120000 } // 2 minute timeout
      );

      if (stderr) {
        this.log.warn('Speedtest CLI stderr output', { stderr });
      }

      const result = JSON.parse(stdout) as SpeedtestOutput;

      if (result.type === 'result') {
        this.log.info('Speedtest completed', {
          download: `${((result.download.bandwidth * 8) / 1_000_000).toFixed(2)} Mbps`,
          upload: `${((result.upload.bandwidth * 8) / 1_000_000).toFixed(2)} Mbps`,
          ping: `${result.ping.latency.toFixed(2)} ms`,
          server: result.server.name,
        });
      }

      endTimer();
      return result;
    } catch (error) {
      this.log.error('Speedtest execution failed', error);
      endTimer();

      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run speedtest and save result to database
   */
  async runAndSave(): Promise<{ success: boolean; resultId?: number; error?: string }> {
    this.log.info('Starting speedtest run and save operation');
    const output = await this.runSpeedtest();

    if (output.type === 'error') {
      this.log.warn('Saving error result to database', { error: output.message });
      const result = await this.prisma.speedtestResult.create({
        data: {
          timestamp: new Date(),
          error: output.message,
        },
      });

      this.log.info('Error result saved', { resultId: result.id });
      return { success: false, resultId: result.id, error: output.message };
    }

    // Get or create server
    const server = await this.getOrCreateServer(output);
    this.log.debug('Server resolved', { serverId: server.id, serverName: server.name });

    // Save successful result
    const result = await this.prisma.speedtestResult.create({
      data: {
        timestamp: new Date(output.timestamp),
        pingJitter: output.ping.jitter,
        pingLatency: output.ping.latency,
        pingLow: output.ping.low,
        pingHigh: output.ping.high,
        downloadBandwidth: BigInt(output.download.bandwidth),
        downloadBytes: BigInt(output.download.bytes),
        downloadElapsed: output.download.elapsed,
        uploadBandwidth: BigInt(output.upload.bandwidth),
        uploadBytes: BigInt(output.upload.bytes),
        uploadElapsed: output.upload.elapsed,
        packetLoss: output.packetLoss ?? null,
        isp: output.isp,
        externalIp: output.interface.externalIp,
        serverId: server.id,
        resultUrl: output.result.url,
      },
    });

    this.log.info('Speedtest result saved successfully', {
      resultId: result.id,
      isp: output.isp,
      externalIp: output.interface.externalIp,
    });

    return { success: true, resultId: result.id };
  }

  /**
   * Get existing server or create new one
   */
  private async getOrCreateServer(result: SpeedtestCliResult) {
    const existingServer = await this.prisma.speedtestServer.findUnique({
      where: { serverId: result.server.id },
    });

    if (existingServer) {
      return existingServer;
    }

    return this.prisma.speedtestServer.create({
      data: {
        serverId: result.server.id,
        name: result.server.name,
        location: result.server.location,
        country: result.server.country,
        host: result.server.host,
      },
    });
  }
}
