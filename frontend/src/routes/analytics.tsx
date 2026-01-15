import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { api, type StatsData, type DailyData, type HourlyData } from '@/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltipContent,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from '@/components/ui/chart';
import { formatMbps, formatMs } from '@/lib/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  RefreshCw,
  BarChart3,
  TrendingUp,
  Activity,
  Calendar,
} from 'lucide-react';

export const Route = createFileRoute('/analytics')({
  component: Analytics,
});

function Analytics() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : 30;
      const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;

      const [statsRes, dailyRes, hourlyRes] = await Promise.all([
        api.getStats({ from: getDateFrom(days) }),
        api.getDailyStats({ days }),
        api.getHourlyStats({ hours: Math.min(hours, 168) }), // Max 7 days hourly
      ]);

      setStats(statsRes.data);
      setDailyData(dailyRes.data);
      setHourlyData(hourlyRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  const getDateFrom = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const dailyChartData = dailyData.map((d) => ({
    date: format(new Date(d.day), 'dd.MM', { locale: de }),
    'Download Avg': d.download.avg,
    'Download Min': d.download.min,
    'Download Max': d.download.max,
    Upload: d.upload,
    Ping: d.ping,
  }));

  const hourlyPingData = hourlyData.map((d) => ({
    time: format(new Date(d.hour), 'dd.MM HH:mm', { locale: de }),
    Ping: d.ping,
    Tests: d.count,
  }));

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Analyse</h1>
        <p className="text-muted-foreground">
          Detaillierte Statistiken und Trends
        </p>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2">
        <Button
          variant={timeRange === '24h' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTimeRange('24h')}
        >
          24 Stunden
        </Button>
        <Button
          variant={timeRange === '7d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTimeRange('7d')}
        >
          7 Tage
        </Button>
        <Button
          variant={timeRange === '30d' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTimeRange('30d')}
        >
          30 Tage
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Statistics Summary */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Tests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.count}</div>
              <p className="text-xs text-muted-foreground">
                im gewählten Zeitraum
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Ø Download</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatMbps(stats.download?.avg)}
              </div>
              <p className="text-xs text-muted-foreground">
                P95: {formatMbps(stats.download?.p95)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Ø Upload</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatMbps(stats.upload?.avg)}
              </div>
              <p className="text-xs text-muted-foreground">
                P95: {formatMbps(stats.upload?.p95)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Ø Ping</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatMs(stats.ping?.avg)}</div>
              <p className="text-xs text-muted-foreground">
                P95: {formatMs(stats.ping?.p95)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Download Range Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Download Geschwindigkeit pro Tag
          </CardTitle>
          <CardDescription>Min, Durchschnitt und Max Werte</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyChartData.length > 0 ? (
            <ChartContainer className="h-[350px]">
              <BarChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="Download Min" fill="hsl(var(--chart-4))" opacity={0.5} />
                <Bar dataKey="Download Avg" fill="hsl(var(--chart-1))" />
                <Bar dataKey="Download Max" fill="hsl(var(--chart-2))" opacity={0.7} />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground">
              Keine Daten verfügbar
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Upload Trend
          </CardTitle>
          <CardDescription>Tägliche Durchschnittswerte</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyChartData.length > 0 ? (
            <ChartContainer>
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="Upload"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--chart-2))' }}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              Keine Daten verfügbar
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ping Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Ping Verlauf
          </CardTitle>
          <CardDescription>Latenz über Zeit (stündlich)</CardDescription>
        </CardHeader>
        <CardContent>
          {hourlyPingData.length > 0 ? (
            <ChartContainer className="h-[300px]">
              <AreaChart data={hourlyPingData}>
                <defs>
                  <linearGradient id="colorPing" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="time"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `${value} ms`}
                />
                <Tooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="Ping"
                  stroke="hsl(var(--chart-3))"
                  fillOpacity={1}
                  fill="url(#colorPing)"
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

      {/* Percentile Table */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Perzentile Übersicht
            </CardTitle>
            <CardDescription>
              Statistische Verteilung der Messwerte
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Metrik</th>
                    <th className="text-right py-2">Min</th>
                    <th className="text-right py-2">P5</th>
                    <th className="text-right py-2">Median</th>
                    <th className="text-right py-2">Durchschnitt</th>
                    <th className="text-right py-2">P95</th>
                    <th className="text-right py-2">Max</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 font-medium">Download</td>
                    <td className="text-right">{formatMbps(stats.download?.min)}</td>
                    <td className="text-right">{formatMbps(stats.download?.p5)}</td>
                    <td className="text-right">{formatMbps(stats.download?.median)}</td>
                    <td className="text-right font-medium">{formatMbps(stats.download?.avg)}</td>
                    <td className="text-right">{formatMbps(stats.download?.p95)}</td>
                    <td className="text-right">{formatMbps(stats.download?.max)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 font-medium">Upload</td>
                    <td className="text-right">{formatMbps(stats.upload?.min)}</td>
                    <td className="text-right">{formatMbps(stats.upload?.p5)}</td>
                    <td className="text-right">{formatMbps(stats.upload?.median)}</td>
                    <td className="text-right font-medium">{formatMbps(stats.upload?.avg)}</td>
                    <td className="text-right">{formatMbps(stats.upload?.p95)}</td>
                    <td className="text-right">{formatMbps(stats.upload?.max)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">Ping</td>
                    <td className="text-right">{formatMs(stats.ping?.min)}</td>
                    <td className="text-right">{formatMs(stats.ping?.p5)}</td>
                    <td className="text-right">{formatMs(stats.ping?.median)}</td>
                    <td className="text-right font-medium">{formatMs(stats.ping?.avg)}</td>
                    <td className="text-right">{formatMs(stats.ping?.p95)}</td>
                    <td className="text-right">{formatMs(stats.ping?.max)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
