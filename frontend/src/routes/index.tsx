import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import {
  api,
  type SpeedtestResult,
  type StatsData,
  type HourlyData,
  type DailyData,
} from '@/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartTooltipContent,
  AreaChart,
  Area,
  LineChart,
  Line,
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
  Download,
  Upload,
  Activity,
  Wifi,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  Calendar,
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
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [allResults, setAllResults] = useState<SpeedtestResult[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState(TIME_RANGES[0]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (hours: number = selectedTimeRange.hours) => {
    try {
      setError(null);
      // Get date from 14 days ago for day comparison
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const [latestRes, statsRes, hourlyRes, dailyRes, resultsRes] = await Promise.all([
        api.getLatestResult(),
        api.getStats(),
        api.getHourlyStats({ hours }),
        api.getDailyStats({ days: 30 }),
        api.getResults({ from: fourteenDaysAgo.toISOString(), limit: 5000 }),
      ]);
      setLatest(latestRes.data);
      setStats(statsRes.data);
      setHourlyData(hourlyRes.data);
      setDailyData(dailyRes.data);
      setAllResults(resultsRes.data);

      // Auto-select last 3 days with data
      const uniqueDays = [
        ...new Set(resultsRes.data.map((r) => format(new Date(r.timestamp), 'yyyy-MM-dd'))),
      ].slice(0, 3);
      setSelectedDays(uniqueDays);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimeRangeChange = (range: (typeof TIME_RANGES)[0]) => {
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

  // Get unique days from results for day comparison
  const availableDays = [
    ...new Set(allResults.map((r) => format(new Date(r.timestamp), 'yyyy-MM-dd'))),
  ]
    .sort()
    .reverse();

  // Prepare day comparison data - group by hour of day
  const dayComparisonData = (() => {
    // Create 24-hour slots
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      hourLabel: `${i.toString().padStart(2, '0')}:00`,
    }));

    // For each selected day, compute average download for each hour
    const dayData: Record<string, Record<number, { sum: number; count: number }>> = {};

    selectedDays.forEach((day) => {
      dayData[day] = {};
      for (let h = 0; h < 24; h++) {
        dayData[day][h] = { sum: 0, count: 0 };
      }
    });

    allResults.forEach((result) => {
      const day = format(new Date(result.timestamp), 'yyyy-MM-dd');
      const hour = new Date(result.timestamp).getHours();

      if (selectedDays.includes(day) && result.download.mbps) {
        dayData[day][hour].sum += result.download.mbps;
        dayData[day][hour].count += 1;
      }
    });

    return hours.map((h) => {
      const point: Record<string, string | number | null> = {
        hour: h.hour,
        hourLabel: h.hourLabel,
      };

      selectedDays.forEach((day) => {
        const data = dayData[day][h.hour];
        const label = format(new Date(day), 'dd.MM', { locale: de });
        point[label] = data.count > 0 ? Math.round((data.sum / data.count) * 10) / 10 : null;
      });

      return point;
    });
  })();

  // Colors for day comparison lines
  const dayColors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    '#8b5cf6',
    '#f59e0b',
  ];

  const toggleDay = (day: string) => {
    setSelectedDays(
      (prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].slice(-7)) // Max 7 days
    );
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Aktuelle Geschwindigkeiten und Übersicht</p>
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
            <div className="text-2xl font-bold">{formatMbps(latest?.download.mbps)}</div>
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
            <div className="text-2xl font-bold">{formatMbps(latest?.upload.mbps)}</div>
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
            <div className="text-2xl font-bold">{formatMs(latest?.ping.latency)}</div>
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
            <p className="text-xs text-muted-foreground mt-1">{latest?.isp || 'Unbekannter ISP'}</p>
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
              <CardDescription>
                Download und Upload Geschwindigkeiten ({hourlyData.length} Datenpunkte)
              </CardDescription>
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

      {/* Daily Trend Chart */}
      {dailyData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Täglicher Trend (30 Tage)
            </CardTitle>
            <CardDescription>
              Durchschnittliche Download- und Upload-Geschwindigkeiten pro Tag
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer>
              <LineChart
                data={dailyData.map((d) => ({
                  date: format(new Date(d.day), 'dd.MM', { locale: de }),
                  'Download Avg': d.download.avg,
                  'Download Min': d.download.min,
                  'Download Max': d.download.max,
                  Upload: d.upload,
                  Ping: d.ping,
                  Tests: d.count,
                }))}
              >
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
                  label={{ value: 'Mbps', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-background border rounded-lg shadow-lg p-3">
                        <p className="font-medium mb-2">{label}</p>
                        {payload.map((entry, idx) => {
                          const name = String(entry.name ?? '');
                          return (
                            <p key={idx} className="text-sm" style={{ color: entry.color }}>
                              {name}:{' '}
                              {typeof entry.value === 'number'
                                ? entry.value.toFixed(1)
                                : entry.value}
                              {name.includes('Ping') ? ' ms' : name === 'Tests' ? '' : ' Mbps'}
                            </p>
                          );
                        })}
                      </div>
                    );
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Download Avg"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="Upload"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="Download Min"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                  opacity={0.5}
                />
                <Line
                  type="monotone"
                  dataKey="Download Max"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                  opacity={0.5}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Day Comparison Chart - Compare hours across different days */}
      {availableDays.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Tagesvergleich (0-24 Uhr)
            </CardTitle>
            <CardDescription>
              Vergleiche Download-Geschwindigkeiten verschiedener Tage nach Uhrzeit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Day selector */}
            <div className="flex flex-wrap gap-2">
              {availableDays.slice(0, 14).map((day) => {
                const isSelected = selectedDays.includes(day);
                const dayLabel = format(new Date(day), 'EEE dd.MM', { locale: de });
                return (
                  <Button
                    key={day}
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleDay(day)}
                    style={
                      isSelected
                        ? {
                            backgroundColor:
                              dayColors[selectedDays.indexOf(day) % dayColors.length],
                          }
                        : {}
                    }
                  >
                    {dayLabel}
                  </Button>
                );
              })}
            </div>

            {selectedDays.length > 0 ? (
              <ChartContainer>
                <LineChart data={dayComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="hourLabel"
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value) => `${value}`}
                    label={{ value: 'Mbps', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-background border rounded-lg shadow-lg p-3">
                          <p className="font-medium mb-2">{label} Uhr</p>
                          {payload
                            .filter((p) => p.value !== null)
                            .map((entry, index) => (
                              <p key={index} className="text-sm" style={{ color: entry.color }}>
                                {entry.name}:{' '}
                                {typeof entry.value === 'number'
                                  ? entry.value.toFixed(1)
                                  : entry.value}{' '}
                                Mbps
                              </p>
                            ))}
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  {selectedDays.map((day, index) => {
                    const label = format(new Date(day), 'dd.MM', { locale: de });
                    return (
                      <Line
                        key={day}
                        type="monotone"
                        dataKey={label}
                        stroke={dayColors[index % dayColors.length]}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Wähle mindestens einen Tag zum Vergleichen aus
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                <p className="font-medium">{latest.server?.name || 'Unbekannt'}</p>
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
