import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { api, type SpeedtestResult } from '@/api/client';
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
import { formatMbps, formatMs } from '@/lib/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { RefreshCw, ChevronLeft, ChevronRight, Trash2, ExternalLink } from 'lucide-react';

export const Route = createFileRoute('/history')({
  component: History,
});

function History() {
  const [results, setResults] = useState<SpeedtestResult[]>([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 20, offset: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (offset: number = 0) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.getResults({ limit: 20, offset });
      setResults(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return;

    try {
      await api.deleteResult(id);
      fetchData(pagination.offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Verlauf</h1>
        <p className="text-muted-foreground">
          Alle Speedtest-Ergebnisse im Überblick
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Speedtest-Ergebnisse</CardTitle>
          <CardDescription>
            {pagination.total} Tests insgesamt
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Keine Ergebnisse vorhanden
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zeitpunkt</TableHead>
                    <TableHead>Download</TableHead>
                    <TableHead>Upload</TableHead>
                    <TableHead>Ping</TableHead>
                    <TableHead>Server</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.id}>
                      <TableCell>
                        {format(new Date(result.timestamp), "dd.MM.yy HH:mm", {
                          locale: de,
                        })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatMbps(result.download.mbps)}
                      </TableCell>
                      <TableCell>{formatMbps(result.upload.mbps)}</TableCell>
                      <TableCell>{formatMs(result.ping.latency)}</TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {result.server?.name || '—'}
                      </TableCell>
                      <TableCell>
                        {result.error ? (
                          <Badge variant="destructive">Fehler</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {result.resultUrl && (
                            <a
                              href={result.resultUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button variant="ghost" size="icon">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </a>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(result.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Seite {currentPage} von {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.offset === 0}
                    onClick={() => fetchData(pagination.offset - pagination.limit)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Zurück
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.offset + pagination.limit >= pagination.total}
                    onClick={() => fetchData(pagination.offset + pagination.limit)}
                  >
                    Weiter
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
