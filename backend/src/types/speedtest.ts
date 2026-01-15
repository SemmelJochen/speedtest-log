// Types matching Ookla Speedtest CLI JSON output

export interface SpeedtestCliResult {
  type: 'result';
  timestamp: string;
  ping: {
    jitter: number;
    latency: number;
    low: number;
    high: number;
  };
  download: {
    bandwidth: number; // bytes/second
    bytes: number;
    elapsed: number; // milliseconds
  };
  upload: {
    bandwidth: number; // bytes/second
    bytes: number;
    elapsed: number; // milliseconds
  };
  packetLoss?: number;
  isp: string;
  interface: {
    internalIp: string;
    name: string;
    macAddr: string;
    isVpn: boolean;
    externalIp: string;
  };
  server: {
    id: number;
    host: string;
    port: number;
    name: string;
    location: string;
    country: string;
    ip: string;
  };
  result: {
    id: string;
    url: string;
    persisted: boolean;
  };
}

export interface SpeedtestError {
  type: 'error';
  message: string;
}

export type SpeedtestOutput = SpeedtestCliResult | SpeedtestError;

// Converted result for API responses
export interface SpeedtestResultFormatted {
  id: number;
  timestamp: Date;
  ping: {
    jitter: number | null;
    latency: number | null;
    low: number | null;
    high: number | null;
  };
  download: {
    mbps: number | null; // Converted to Mbit/s
    bytes: number | null;
    elapsed: number | null;
  };
  upload: {
    mbps: number | null; // Converted to Mbit/s
    bytes: number | null;
    elapsed: number | null;
  };
  packetLoss: number | null;
  isp: string | null;
  externalIp: string | null;
  server: {
    id: number;
    name: string | null;
    location: string | null;
    country: string | null;
  } | null;
  resultUrl: string | null;
  error: string | null;
}

// Utility function to convert bytes/s to Mbit/s
export function bytesToMbps(bytesPerSecond: bigint | number | null): number | null {
  if (bytesPerSecond === null) return null;
  const bytes = typeof bytesPerSecond === 'bigint' ? Number(bytesPerSecond) : bytesPerSecond;
  return Number((bytes * 8 / 1_000_000).toFixed(2));
}
