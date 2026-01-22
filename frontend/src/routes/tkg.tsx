import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import {
  api,
  type ThresholdConfig,
  type ThresholdCheckResult,
  type BundesnetzagenturExport,
} from '@/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMbps } from '@/lib/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Settings,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
  FileText,
  Loader2,
  ExternalLink,
} from 'lucide-react';

export const Route = createFileRoute('/tkg')({
  component: TKGPage,
});

function TKGPage() {
  const [, setConfig] = useState<ThresholdConfig | null>(null);
  const [status, setStatus] = useState<ThresholdCheckResult | null>(null);
  const [exports, setExports] = useState<BundesnetzagenturExport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [contractedDownload, setContractedDownload] = useState('');
  const [contractedUpload, setContractedUpload] = useState('');

  const fetchData = async () => {
    try {
      setError(null);
      const [configRes, statusRes, exportsRes, runningRes] = await Promise.all([
        api.getThresholdConfig(),
        api.getThresholdStatus().catch(() => ({ data: null })),
        api.getBundesnetzagenturExports(),
        api.getBundesnetzagenturStatus(),
      ]);

      setConfig(configRes.data);
      setStatus(statusRes.data);
      setExports(exportsRes.data);
      setIsMeasuring(runningRes.data.isRunning);

      // Initialize form
      setContractedDownload(configRes.data.contractedDownload.toString());
      setContractedUpload(configRes.data.contractedUpload.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Daten');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll for measurement status updates
    const interval = setInterval(async () => {
      const runningRes = await api.getBundesnetzagenturStatus();
      setIsMeasuring(runningRes.data.isRunning);
      if (!runningRes.data.isRunning) {
        // Refresh exports when measurement finishes
        const exportsRes = await api.getBundesnetzagenturExports();
        setExports(exportsRes.data);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await api.updateThresholdConfig({
        contractedDownload: parseInt(contractedDownload, 10),
        contractedUpload: parseInt(contractedUpload, 10),
      });
      setConfig(updated.data);
      setSuccess('Konfiguration gespeichert');

      // Refresh status with new config
      const statusRes = await api.getThresholdStatus().catch(() => ({ data: null }));
      setStatus(statusRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartMeasurement = async () => {
    setIsMeasuring(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.startBundesnetzagenturMeasurement('manual');
      setSuccess(`Messung gestartet (ID: ${result.data.id}). Bitte warten...`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Starten der Messung');
      setIsMeasuring(false);
    }
  };

  const handleDownload = (exportId: number) => {
    const url = api.getBundesnetzagenturDownloadUrl(exportId);
    window.open(url, '_blank');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'good':
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" /> Gut
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="warning" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> Warnung
          </Badge>
        );
      case 'critical':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" /> Kritisch
          </Badge>
        );
      default:
        return <Badge variant="secondary">Unbekannt</Badge>;
    }
  };

  const getExportStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">Abgeschlossen</Badge>;
      case 'running':
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Läuft
          </Badge>
        );
      case 'failed':
        return <Badge variant="destructive">Fehlgeschlagen</Badge>;
      default:
        return <Badge variant="secondary">Ausstehend</Badge>;
    }
  };

  const getTriggerReasonLabel = (reason: string) => {
    switch (reason) {
      case 'manual':
        return 'Manuell';
      case 'threshold_warning':
        return 'Warnung';
      case 'threshold_critical':
        return 'Kritisch';
      default:
        return reason;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="h-8 w-8" />
          TKG-Schwellenwerte
        </h1>
        <p className="text-muted-foreground">
          Konfiguriere deine vertraglich zugesicherten Geschwindigkeiten und überwache die
          TKG-Schwellenwerte
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500 text-green-700 dark:text-green-400 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {/* Current Status */}
      {status && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Aktueller Status</span>
              {getStatusBadge(status.status)}
            </CardTitle>
            <CardDescription>Basierend auf dem letzten Speedtest-Ergebnis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Download</span>
                  <div className="text-right">
                    <span className="font-bold">{formatMbps(status.downloadMbps)}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      ({status.downloadPercent}% von {status.contractedDownload} Mbps)
                    </span>
                    {getStatusBadge(status.downloadStatus)}
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      status.downloadStatus === 'good'
                        ? 'bg-green-500'
                        : status.downloadStatus === 'warning'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, status.downloadPercent)}%` }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Upload</span>
                  <div className="text-right">
                    <span className="font-bold">{formatMbps(status.uploadMbps)}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      ({status.uploadPercent}% von {status.contractedUpload} Mbps)
                    </span>
                    {getStatusBadge(status.uploadStatus)}
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      status.uploadStatus === 'good'
                        ? 'bg-green-500'
                        : status.uploadStatus === 'warning'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, status.uploadPercent)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>TKG-Schwellenwerte:</strong> Normalgeschwindigkeit{' '}
                <Badge variant="outline">{status.thresholds.normal}%</Badge> | Erhebliche Abweichung{' '}
                <Badge variant="outline">{status.thresholds.critical}%</Badge>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Vertragliche Geschwindigkeiten</CardTitle>
          <CardDescription>
            Gib die in deinem Vertrag zugesicherten Geschwindigkeiten ein
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="download" className="text-sm font-medium">
                Download (Mbps)
              </label>
              <input
                id="download"
                type="number"
                min="1"
                max="10000"
                value={contractedDownload}
                onChange={(e) => setContractedDownload(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
                placeholder="z.B. 100"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="upload" className="text-sm font-medium">
                Upload (Mbps)
              </label>
              <input
                id="upload"
                type="number"
                min="1"
                max="10000"
                value={contractedUpload}
                onChange={(e) => setContractedUpload(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
                placeholder="z.B. 40"
              />
            </div>
          </div>
          <Button onClick={handleSaveConfig} disabled={isSaving} className="mt-4">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Speichern...
              </>
            ) : (
              'Speichern'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Bundesnetzagentur Measurement */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Bundesnetzagentur Messung
          </CardTitle>
          <CardDescription>
            Automatische Messung über breitbandmessung.de mit Screenshot und Export
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              <strong>Hinweis:</strong> Diese automatisierte Messung dient nur zur Dokumentation.
              Für rechtlich bindende Nachweise verwende bitte die offizielle Desktop-App der
              Bundesnetzagentur mit 20 Messungen an 2 aufeinanderfolgenden Tagen.
            </p>
            <a
              href="https://breitbandmessung.de"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
            >
              breitbandmessung.de <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <Button onClick={handleStartMeasurement} disabled={isMeasuring} size="lg">
            {isMeasuring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Messung läuft...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Offizielle Messung starten
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Export History */}
      <Card>
        <CardHeader>
          <CardTitle>Messungs-Historie</CardTitle>
          <CardDescription>Frühere Bundesnetzagentur-Messungen</CardDescription>
        </CardHeader>
        <CardContent>
          {exports.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Noch keine Messungen durchgeführt
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Auslöser</TableHead>
                  <TableHead>Download</TableHead>
                  <TableHead>Upload</TableHead>
                  <TableHead>Latenz</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exports.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell>
                      {format(new Date(exp.timestamp), 'dd.MM.yyyy HH:mm', { locale: de })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTriggerReasonLabel(exp.triggerReason)}</Badge>
                    </TableCell>
                    <TableCell>{exp.downloadMbps ? formatMbps(exp.downloadMbps) : '-'}</TableCell>
                    <TableCell>{exp.uploadMbps ? formatMbps(exp.uploadMbps) : '-'}</TableCell>
                    <TableCell>{exp.latencyMs ? `${exp.latencyMs} ms` : '-'}</TableCell>
                    <TableCell>{getExportStatusBadge(exp.status)}</TableCell>
                    <TableCell>
                      {exp.hasZip && exp.status === 'completed' && (
                        <Button variant="outline" size="sm" onClick={() => handleDownload(exp.id)}>
                          <Download className="h-4 w-4 mr-1" />
                          ZIP
                        </Button>
                      )}
                      {exp.error && (
                        <span className="text-xs text-destructive" title={exp.error}>
                          Fehler
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
