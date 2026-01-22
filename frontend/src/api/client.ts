// API base URL - automatically detect based on current hostname for LAN access
// Always use the same hostname the user is accessing the frontend from
const API_BASE = `${window.location.protocol}//${window.location.hostname}:3001`;
console.log('API Base URL:', API_BASE);

export interface SpeedtestResult {
  id: number;
  timestamp: string;
  ping: {
    jitter: number | null;
    latency: number | null;
    low: number | null;
    high: number | null;
  };
  download: {
    mbps: number | null;
    bytes: number | null;
    elapsed: number | null;
  };
  upload: {
    mbps: number | null;
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

export interface StatsData {
  count: number;
  download: {
    avg: number | null;
    min: number | null;
    max: number | null;
    p5: number | null;
    p95: number | null;
    median: number | null;
  } | null;
  upload: {
    avg: number | null;
    min: number | null;
    max: number | null;
    p5: number | null;
    p95: number | null;
    median: number | null;
  } | null;
  ping: {
    avg: number | null;
    min: number | null;
    max: number | null;
    p5: number | null;
    p95: number | null;
    median: number | null;
  } | null;
  packetLoss: {
    avg: number | null;
    min: number | null;
    max: number | null;
  } | null;
}

export interface HourlyData {
  hour: string;
  download: number | null;
  upload: number | null;
  ping: number | null;
  count: number;
}

export interface DailyData {
  day: string;
  download: {
    avg: number | null;
    min: number | null;
    max: number | null;
  };
  upload: number | null;
  ping: number | null;
  count: number;
}

// TKG Threshold Types
export interface ThresholdConfig {
  id: number;
  contractedDownload: number;
  contractedUpload: number;
  normalThreshold: number;
  criticalThreshold: number;
  updatedAt: string;
}

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

// Bundesnetzagentur Export Types
export interface BundesnetzagenturExport {
  id: number;
  timestamp: string;
  triggerReason: 'manual' | 'threshold_warning' | 'threshold_critical';
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyMs: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error: string | null;
  hasZip: boolean;
  createdAt: string;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // Only set Content-Type for requests with a body
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };

  // Add Content-Type only if there's a body
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  // Results
  getResults: async (params?: { from?: string; to?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString();
    return fetchApi<{
      data: SpeedtestResult[];
      pagination: { total: number; limit: number; offset: number };
    }>(`/api/results${query ? `?${query}` : ''}`);
  },

  getLatestResult: async () => {
    return fetchApi<{ data: SpeedtestResult | null }>('/api/results/latest');
  },

  getResult: async (id: number) => {
    return fetchApi<{ data: SpeedtestResult }>(`/api/results/${id}`);
  },

  deleteResult: async (id: number) => {
    return fetchApi<{ success: boolean }>(`/api/results/${id}`, { method: 'DELETE' });
  },

  // Stats
  getStats: async (params?: { from?: string; to?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);

    const query = searchParams.toString();
    return fetchApi<{ data: StatsData }>(`/api/stats${query ? `?${query}` : ''}`);
  },

  getHourlyStats: async (params?: { from?: string; to?: string; hours?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.hours) searchParams.set('hours', params.hours.toString());

    const query = searchParams.toString();
    return fetchApi<{ data: HourlyData[] }>(`/api/stats/hourly${query ? `?${query}` : ''}`);
  },

  getDailyStats: async (params?: { from?: string; to?: string; days?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.days) searchParams.set('days', params.days.toString());

    const query = searchParams.toString();
    return fetchApi<{ data: DailyData[] }>(`/api/stats/daily${query ? `?${query}` : ''}`);
  },

  // Speedtest control
  runSpeedtest: async () => {
    return fetchApi<{ success: boolean; resultId?: number; error?: string; message?: string }>(
      '/api/speedtest/run',
      { method: 'POST' }
    );
  },

  getStatus: async () => {
    return fetchApi<{ schedulerActive: boolean; timestamp: string }>('/api/speedtest/status');
  },

  // Servers
  getServers: async () => {
    return fetchApi<{
      data: Array<{
        id: number;
        serverId: number;
        name: string;
        location: string;
        country: string;
      }>;
    }>('/api/servers');
  },

  // TKG Threshold
  getThresholdConfig: async () => {
    return fetchApi<{ data: ThresholdConfig }>('/api/threshold/config');
  },

  updateThresholdConfig: async (config: Partial<Omit<ThresholdConfig, 'id' | 'updatedAt'>>) => {
    return fetchApi<{ data: ThresholdConfig }>('/api/threshold/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  getThresholdStatus: async () => {
    return fetchApi<{ data: ThresholdCheckResult }>('/api/threshold/status');
  },

  checkThresholdBreach: async () => {
    return fetchApi<{ data: { breached: boolean; status: ThresholdStatus; resultId?: number } }>(
      '/api/threshold/check'
    );
  },

  // Bundesnetzagentur
  startBundesnetzagenturMeasurement: async (
    triggerReason: 'manual' | 'threshold_warning' | 'threshold_critical' = 'manual',
    triggerResultId?: number
  ) => {
    return fetchApi<{ data: { id: number; status: string; message: string } }>(
      '/api/bundesnetzagentur/measure',
      {
        method: 'POST',
        body: JSON.stringify({ triggerReason, triggerResultId }),
      }
    );
  },

  startBundesnetzagenturIfBreached: async () => {
    return fetchApi<{
      data: {
        id?: number;
        triggered: boolean;
        status: string;
        thresholdStatus?: ThresholdStatus;
        message: string;
      };
    }>('/api/bundesnetzagentur/measure-if-breached', { method: 'POST' });
  },

  getBundesnetzagenturStatus: async () => {
    return fetchApi<{ data: { isRunning: boolean } }>('/api/bundesnetzagentur/status');
  },

  getBundesnetzagenturExports: async (limit = 20) => {
    return fetchApi<{ data: BundesnetzagenturExport[] }>(
      `/api/bundesnetzagentur/exports?limit=${limit}`
    );
  },

  getBundesnetzagenturExport: async (id: number) => {
    return fetchApi<{ data: BundesnetzagenturExport }>(`/api/bundesnetzagentur/exports/${id}`);
  },

  getBundesnetzagenturDownloadUrl: (id: number) => {
    return `${API_BASE}/api/bundesnetzagentur/exports/${id}/download`;
  },
};
