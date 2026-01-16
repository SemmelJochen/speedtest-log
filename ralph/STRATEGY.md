# Strategisches Vorgehen - Speedtest Logger

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Container                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Speedtest  │  │   Node.js   │  │     PostgreSQL      │ │
│  │    CLI      │→→│   Backend   │→→│     Database        │ │
│  │  (Ookla)    │  │   + API     │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                          ↓                                   │
│                   ┌─────────────┐                            │
│                   │   React     │                            │
│                   │  Frontend   │                            │
│                   │  (shadcn)   │                            │
│                   └─────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## Technologie-Stack

### Backend
- **Runtime:** Node.js mit TypeScript
- **Framework:** Fastify (schnell, typsicher)
- **ORM:** Prisma (automatische Migrationen, typsicher)
- **Scheduler:** node-cron für regelmäßige Tests

### Speedtest
- **Tool:** Speedtest CLI von Ookla
- **Grund:** Offizielle CLI, misst echte Geschwindigkeiten, JSON-Output
- **Intervall:** Alle 5 Minuten (konfigurierbar)
  - 1 Minute ist zu kurz (Test dauert ~30-60s, würde Netzwerk belasten)
  - 5 Minuten = 288 Messungen/Tag = gute Datengrundlage

### Datenbank
- **System:** PostgreSQL
- **Schema:** Normalisiert mit Server-Informationen getrennt

### Frontend
- **Framework:** React mit TanStack Router/Start
- **UI:** shadcn/ui + Tailwind CSS
- **Charts:** shadcn Charts (Recharts-basiert)

## Datenbank-Schema

```sql
-- Speedtest Server (normalisiert)
CREATE TABLE speedtest_servers (
  id SERIAL PRIMARY KEY,
  server_id INTEGER UNIQUE NOT NULL,
  name VARCHAR(255),
  location VARCHAR(255),
  country VARCHAR(100),
  host VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Speedtest Ergebnisse
CREATE TABLE speedtest_results (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,

  -- Ping Daten (in ms)
  ping_jitter DECIMAL(10, 3),
  ping_latency DECIMAL(10, 3),
  ping_low DECIMAL(10, 3),
  ping_high DECIMAL(10, 3),

  -- Download (in bytes/second, wird zu Mbit/s konvertiert)
  download_bandwidth BIGINT,
  download_bytes BIGINT,
  download_elapsed INTEGER,

  -- Upload (in bytes/second)
  upload_bandwidth BIGINT,
  upload_bytes BIGINT,
  upload_elapsed INTEGER,

  -- Packet Loss
  packet_loss DECIMAL(5, 2),

  -- ISP Info
  isp VARCHAR(255),

  -- Externe IP
  external_ip VARCHAR(45),

  -- Server Referenz
  server_id INTEGER REFERENCES speedtest_servers(id),

  -- Result URL für Details
  result_url VARCHAR(500),

  created_at TIMESTAMP DEFAULT NOW()
);

-- Index für schnelle Zeitabfragen
CREATE INDEX idx_results_timestamp ON speedtest_results(timestamp);
```

## Speedtest Ausführung

Der Speedtest CLI gibt JSON aus:
```bash
speedtest --format=json --accept-license --accept-gdpr
```

Output-Struktur (relevant):
```json
{
  "type": "result",
  "timestamp": "2024-01-15T10:30:00Z",
  "ping": {
    "jitter": 1.234,
    "latency": 12.567,
    "low": 11.0,
    "high": 15.0
  },
  "download": {
    "bandwidth": 12500000,  // bytes/s → 100 Mbit/s
    "bytes": 125000000,
    "elapsed": 10000
  },
  "upload": {
    "bandwidth": 3750000,   // bytes/s → 30 Mbit/s
    "bytes": 37500000,
    "elapsed": 10000
  },
  "packetLoss": 0,
  "isp": "Provider Name",
  "interface": {
    "externalIp": "1.2.3.4"
  },
  "server": {
    "id": 12345,
    "name": "Server Name",
    "location": "City",
    "country": "Country",
    "host": "server.host.com"
  },
  "result": {
    "url": "https://www.speedtest.net/result/c/..."
  }
}
```

## API Endpoints

### GET /api/results
- Query Params: `from`, `to`, `limit`, `offset`
- Returns: Paginated speedtest results

### GET /api/results/:id
- Returns: Single result with server details

### GET /api/results/latest
- Returns: Most recent result

### GET /api/stats
- Query Params: `from`, `to`, `interval` (hour/day/week)
- Returns: Aggregated statistics (avg, min, max, p95)

### GET /api/servers
- Returns: List of all servers used

### POST /api/speedtest/run
- Triggers: Manual speedtest execution
- Returns: New result

## Scheduler Konfiguration

```typescript
// Alle 5 Minuten
cron.schedule('*/5 * * * *', runSpeedtest);
```

## Docker Services

1. **postgres** - Datenbank
2. **backend** - Node.js API + Scheduler
3. **frontend** - React App (optional statisch served)

## Metriken Umrechnung

- Bandwidth (bytes/s) → Mbit/s: `bandwidth * 8 / 1_000_000`
- Beispiel: 12,500,000 bytes/s = 100 Mbit/s
