import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RefreshCw, Server, MapPin, Globe } from 'lucide-react';

interface ServerInfo {
  id: number;
  serverId: number;
  name: string;
  location: string;
  country: string;
}

export const Route = createFileRoute('/servers')({
  component: Servers,
});

function Servers() {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        setError(null);
        const res = await api.getServers();
        setServers(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch servers');
      } finally {
        setIsLoading(false);
      }
    };

    fetchServers();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Group servers by country
  const serversByCountry = servers.reduce((acc, server) => {
    const country = server.country || 'Unbekannt';
    if (!acc[country]) {
      acc[country] = [];
    }
    acc[country].push(server);
    return acc;
  }, {} as Record<string, ServerInfo[]>);

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Server</h1>
        <p className="text-muted-foreground">
          Verwendete Speedtest-Server im Überblick
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt Server</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{servers.length}</div>
            <p className="text-xs text-muted-foreground">
              verschiedene Server verwendet
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Länder</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(serversByCountry).length}</div>
            <p className="text-xs text-muted-foreground">
              verschiedene Länder
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Standorte</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(servers.map(s => s.location)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              verschiedene Standorte
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Server List */}
      <Card>
        <CardHeader>
          <CardTitle>Alle Server</CardTitle>
          <CardDescription>
            Server, die bei Speedtests verwendet wurden
          </CardDescription>
        </CardHeader>
        <CardContent>
          {servers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Noch keine Server verwendet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Standort</TableHead>
                  <TableHead>Land</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((server) => (
                  <TableRow key={server.id}>
                    <TableCell className="font-mono text-sm">
                      {server.serverId}
                    </TableCell>
                    <TableCell className="font-medium">
                      {server.name || '—'}
                    </TableCell>
                    <TableCell>{server.location || '—'}</TableCell>
                    <TableCell>{server.country || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Servers by Country */}
      {Object.keys(serversByCountry).length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Server nach Land</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(serversByCountry).map(([country, countryServers]) => (
                <div
                  key={country}
                  className="p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{country}</span>
                  </div>
                  <p className="text-2xl font-bold">{countryServers.length}</p>
                  <p className="text-xs text-muted-foreground">
                    {countryServers.length === 1 ? 'Server' : 'Server'}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
