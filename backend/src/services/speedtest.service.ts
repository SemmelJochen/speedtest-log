import { exec } from 'child_process';
import { promisify } from 'util';
import { PrismaClient } from '@prisma/client';
import type { SpeedtestCliResult, SpeedtestOutput } from '../types/speedtest.js';

const execAsync = promisify(exec);

export class SpeedtestService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Run speedtest CLI and return parsed JSON result
   */
  async runSpeedtest(): Promise<SpeedtestOutput> {
    try {
      console.log(`[${new Date().toISOString()}] Starting speedtest...`);

      const { stdout, stderr } = await execAsync(
        'speedtest --format=json --accept-license --accept-gdpr',
        { timeout: 120000 } // 2 minute timeout
      );

      if (stderr) {
        console.warn('Speedtest stderr:', stderr);
      }

      const result = JSON.parse(stdout) as SpeedtestOutput;
      console.log(`[${new Date().toISOString()}] Speedtest completed successfully`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${new Date().toISOString()}] Speedtest failed:`, message);

      return {
        type: 'error',
        message: message
      };
    }
  }

  /**
   * Run speedtest and save result to database
   */
  async runAndSave(): Promise<{ success: boolean; resultId?: number; error?: string }> {
    const output = await this.runSpeedtest();

    if (output.type === 'error') {
      // Save error result
      const result = await this.prisma.speedtestResult.create({
        data: {
          timestamp: new Date(),
          error: output.message
        }
      });

      return { success: false, resultId: result.id, error: output.message };
    }

    // Get or create server
    const server = await this.getOrCreateServer(output);

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
        resultUrl: output.result.url
      }
    });

    console.log(`[${new Date().toISOString()}] Result saved with ID: ${result.id}`);

    return { success: true, resultId: result.id };
  }

  /**
   * Get existing server or create new one
   */
  private async getOrCreateServer(result: SpeedtestCliResult) {
    const existingServer = await this.prisma.speedtestServer.findUnique({
      where: { serverId: result.server.id }
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
        host: result.server.host
      }
    });
  }
}
