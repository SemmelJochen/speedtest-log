// API base URL - automatically detect based on current hostname for LAN access
function getApiBase(): string {
  // If explicitly set via environment (non-empty), use that
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl;
  }

  // Auto-detect: use same hostname as frontend, but port 3001
  // This allows LAN access without hardcoding IPs
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3001`;
}

const API_BASE = getApiBase();
console.log('API Base URL:', API_BASE); // Debug log

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

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
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
    return fetchApi<{ data: SpeedtestResult[]; pagination: { total: number; limit: number; offset: number } }>(
      `/api/results${query ? `?${query}` : ''}`
    );
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
    return fetchApi<{ data: Array<{ id: number; serverId: number; name: string; location: string; country: string }> }>(
      '/api/servers'
    );
  },
};
