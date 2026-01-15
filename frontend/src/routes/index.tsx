import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { api, type SpeedtestResult, type StatsData, type HourlyData } from '@/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartTooltipContent,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from '@/components/ui/chart';
import { formatMbps, formatMs } from '@/lib/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Download,
  Upload,
  Activity,
  Wifi,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
} from 'lucide-react';

export const Route = createFileRoute('/')({
  component: Dashboard,
});

const TIME_RANGES = [
  { label: '24 Stunden', hours: 24 },
  { label: '48 Stunden', hours: 48 },
  { label: '7 Tage', hours: 168 },
  { label: '30 Tage', hours: 720 },
];

function Dashboard() {
  const [latest, setLatest] = useState<SpeedtestResult | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState(TIME_RANGES[0]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (hours: number = selectedTimeRange.hours) => {
    try {
      setError(null);
      const [latestRes, statsRes, hourlyRes] = await Promise.all([
        api.getLatestResult(),
        api.getStats(),
        api.getHourlyStats({ hours }),
      ]);
      setLatest(latestRes.data);
      setStats(statsRes.data);
      setHourlyData(hourlyRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimeRangeChange = (range: typeof TIME_RANGES[0]) => {
    setSelectedTimeRange(range);
    fetchData(range.hours);
  };

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRunSpeedtest = async () => {
    setIsRunning(true);
    try {
      await api.runSpeedtest();
      // Wait a bit and refresh
      setTimeout(fetchData, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run speedtest');
    } finally {
      setIsRunning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const chartData = hourlyData.map((d) => {
    const date = new Date(d.hour);
    // For ranges > 48h, show date; otherwise just time
    const timeFormat = selectedTimeRange.hours > 48 ? 'dd.MM HH:mm' : 'HH:mm';
    return {
      time: format(date, timeFormat, { locale: de }),
      Download: d.download,
      Upload: d.upload,
    };
  });

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Aktuelle Geschwindigkeiten und Übersicht
          </p>
        </div>
        <Button onClick={handleRunSpeedtest} disabled={isRunning} size="lg">
          <RefreshCw className={`mr-2 h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Test läuft...' : 'Speedtest starten'}
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Current Speed Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Download</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMbps(latest?.download.mbps)}
            </div>
            {stats?.download && (
              <p className="text-xs text-muted-foreground">
                Durchschnitt: {formatMbps(stats.download.avg)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upload</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMbps(latest?.upload.mbps)}
            </div>
            {stats?.upload && (
              <p className="text-xs text-muted-foreground">
                Durchschnitt: {formatMbps(stats.upload.avg)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ping</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMs(latest?.ping.latency)}
            </div>
            {stats?.ping && (
              <p className="text-xs text-muted-foreground">
                Durchschnitt: {formatMs(stats.ping.avg)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={latest?.error ? 'destructive' : 'success'}>
                {latest?.error ? 'Fehler' : 'Online'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {latest?.isp || 'Unbekannter ISP'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart with Time Range Selector */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Letzte {selectedTimeRange.label}
              </CardTitle>
              <CardDescription>Download und Upload Geschwindigkeiten ({hourlyData.length} Datenpunkte)</CardDescription>
            </div>
            <div className="flex gap-1 flex-wrap">
              {TIME_RANGES.map((range) => (
                <Button
                  key={range.hours}
                  variant={selectedTimeRange.hours === range.hours ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTimeRangeChange(range)}
                >
                  {range.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ChartContainer>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="time"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `${value} Mbps`}
                />
                <Tooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="Download"
                  stroke="hsl(var(--chart-1))"
                  fillOpacity={1}
                  fill="url(#colorDownload)"
                />
                <Area
                  type="monotone"
                  dataKey="Upload"
                  stroke="hsl(var(--chart-2))"
                  fillOpacity={1}
                  fill="url(#colorUpload)"
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              Keine Daten verfügbar
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics Overview */}
      {stats && stats.count > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Maximalwerte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Download</span>
                <span className="font-medium">{formatMbps(stats.download?.max)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Upload</span>
                <span className="font-medium">{formatMbps(stats.upload?.max)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ping (beste)</span>
                <span className="font-medium">{formatMs(stats.ping?.min)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                Minimalwerte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Download</span>
                <span className="font-medium">{formatMbps(stats.download?.min)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Upload</span>
                <span className="font-medium">{formatMbps(stats.upload?.min)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ping (schlechteste)</span>
                <span className="font-medium">{formatMs(stats.ping?.max)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Last Test Info */}
      {latest && (
        <Card>
          <CardHeader>
            <CardTitle>Letzter Test</CardTitle>
            <CardDescription>
              {latest.timestamp
                ? format(new Date(latest.timestamp), "dd. MMMM yyyy 'um' HH:mm:ss", {
                    locale: de,
                  })
                : 'Unbekannt'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <span className="text-sm text-muted-foreground">Server</span>
                <p className="font-medium">
                  {latest.server?.name || 'Unbekannt'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {latest.server?.location}, {latest.server?.country}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Externe IP</span>
                <p className="font-medium">{latest.externalIp || 'Unbekannt'}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Jitter</span>
                <p className="font-medium">{formatMs(latest.ping.jitter)}</p>
              </div>
            </div>
            {latest.resultUrl && (
              <a
                href={latest.resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline mt-4 inline-block"
              >
                Detailliertes Ergebnis auf speedtest.net ansehen
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Total Tests Counter */}
      <div className="text-center text-sm text-muted-foreground">
        Gesamt: {stats?.count || 0} Speedtests durchgeführt
      </div>
    </div>
  );
}
