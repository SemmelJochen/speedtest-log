# Speedtest Logger - Projektdokumentation

## Projektübersicht

Speedtest Logger ist eine Full-Stack-Anwendung zum automatischen Logging und Analysieren von Internet-Geschwindigkeitstests. Die App führt regelmäßige Messungen durch und visualisiert die Ergebnisse in einem Dashboard.

## Architektur

```
speedtest-log/
├── backend/                 # Node.js API Server (Fastify + Prisma)
│   ├── src/
│   │   ├── index.ts        # Server Entry Point
│   │   ├── config.ts       # Umgebungsvariablen
│   │   ├── services/       # Business Logic
│   │   │   ├── speedtest.service.ts    # Ookla CLI Ausführung
│   │   │   ├── scheduler.service.ts    # Cron-basierte Planung
│   │   │   ├── threshold.service.ts    # TKG-Schwellenwert-Überwachung (NEU)
│   │   │   └── bundesnetzagentur.service.ts  # Playwright-Messung (NEU)
│   │   ├── routes/         # API Endpoints
│   │   └── utils/          # Logger, Helpers
│   └── prisma/
│       └── schema.prisma   # Datenbankschema
├── frontend/               # React SPA (Vite + Tailwind)
│   └── src/
│       ├── routes/         # Seiten (Dashboard, History, Analytics)
│       ├── components/     # UI-Komponenten
│       └── api/client.ts   # API-Client
└── docker-compose.yml      # Container-Orchestrierung
```

## Tech Stack

| Komponente | Technologie |
|------------|-------------|
| Backend | Node.js, TypeScript, Fastify |
| ORM | Prisma |
| Datenbank | PostgreSQL 16 |
| Frontend | React 18, Vite, Tailwind CSS |
| Charts | Recharts |
| Container | Docker, Docker Compose |
| Speedtest | Ookla Speedtest CLI |
| Browser-Automatisierung | Playwright (NEU) |

## API Endpoints

### Bestehende Endpoints

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/api/results` | Liste aller Ergebnisse (paginiert) |
| GET | `/api/results/latest` | Letztes Ergebnis |
| GET | `/api/results/:id` | Einzelnes Ergebnis |
| DELETE | `/api/results/:id` | Ergebnis löschen |
| GET | `/api/stats` | Aggregierte Statistiken |
| GET | `/api/stats/hourly` | Stündliche Durchschnitte |
| GET | `/api/stats/daily` | Tägliche Durchschnitte |
| POST | `/api/speedtest/run` | Manueller Speedtest |
| GET | `/api/speedtest/status` | Scheduler-Status |

### Neue Endpoints (TKG-Feature)

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/api/threshold/config` | Aktuelle Schwellenwert-Konfiguration |
| PUT | `/api/threshold/config` | Schwellenwerte aktualisieren |
| GET | `/api/threshold/status` | Aktueller TKG-Status (gut/warnung/kritisch) |
| GET | `/api/threshold/check` | Prüft ob Schwellenwert unterschritten |
| POST | `/api/bundesnetzagentur/measure` | Offizielle Messung manuell starten |
| POST | `/api/bundesnetzagentur/measure-if-breached` | Messung nur bei Unterschreitung |
| GET | `/api/bundesnetzagentur/status` | Läuft gerade eine Messung? |
| POST | `/api/bundesnetzagentur/cancel` | Laufende Messung abbrechen |
| POST | `/api/bundesnetzagentur/cleanup` | Stuck Messungen aufräumen |
| GET | `/api/bundesnetzagentur/exports` | Liste aller Messungen |
| GET | `/api/bundesnetzagentur/exports/:id` | Details einer Messung |
| GET | `/api/bundesnetzagentur/exports/:id/download` | ZIP-Download |

## Datenbankschema

### Bestehende Tabellen

```prisma
model SpeedtestResult {
  id                Int       @id @default(autoincrement())
  timestamp         DateTime
  pingJitter        Decimal?
  pingLatency       Decimal?
  downloadBandwidth BigInt?
  uploadBandwidth   BigInt?
  packetLoss        Decimal?
  isp               String?
  externalIp        String?
  serverId          Int?
  resultUrl         String?
  error             String?
  createdAt         DateTime  @default(now())
}

model SpeedtestServer {
  id        Int      @id @default(autoincrement())
  serverId  Int      @unique
  name      String
  location  String
  country   String
  host      String
  createdAt DateTime @default(now())
}
```

### Neue Tabellen (TKG-Feature)

```prisma
model ThresholdConfig {
  id                    Int      @id @default(autoincrement())
  contractedDownload    Int      // Vertraglich zugesicherte Download-Geschwindigkeit in Mbps
  contractedUpload      Int      // Vertraglich zugesicherte Upload-Geschwindigkeit in Mbps
  normalThreshold       Int      @default(90)  // 90% = Normalgeschwindigkeit
  criticalThreshold     Int      @default(50)  // 50% = erhebliche Abweichung
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

model BundesnetzagenturExport {
  id            Int      @id @default(autoincrement())
  timestamp     DateTime @default(now())
  triggerReason String   // "manual" | "threshold_warning" | "threshold_critical"
  downloadMbps  Decimal?
  uploadMbps    Decimal?
  latencyMs     Decimal?
  screenshotPath String?
  exportPath    String?
  zipPath       String?
  status        String   @default("pending") // "pending" | "running" | "completed" | "failed"
  error         String?
  createdAt     DateTime @default(now())
}
```

## TKG-Schwellenwerte (Telekommunikationsgesetz)

Nach der TKG-Novelle 12/2021 gelten folgende Schwellenwerte:

| Kriterium | Schwellenwert | Bedeutung |
|-----------|---------------|-----------|
| Normalgeschwindigkeit | ≥ 90% der Maximalgeschwindigkeit | Akzeptabel |
| Warnung | < 90% der Maximalgeschwindigkeit | Unter Normal |
| Erhebliche Abweichung | < 50% der Maximalgeschwindigkeit | Kritisch - Sonderkündigungsrecht |

## Konfiguration

### Umgebungsvariablen

```bash
# Datenbank
DATABASE_URL=postgresql://user:pass@localhost:5432/speedtest

# Server
PORT=3001
HOST=0.0.0.0

# Scheduler
SPEEDTEST_CRON=*/5 * * * *  # Alle 5 Minuten
RUN_ON_STARTUP=true

# TKG-Schwellenwerte (NEU)
CONTRACTED_DOWNLOAD_MBPS=100  # Vertraglich zugesichert
CONTRACTED_UPLOAD_MBPS=40     # Vertraglich zugesichert
```

## Feature: Automatische Bundesnetzagentur-Messung

### Wichtiger Hinweis

Die automatisierte Messung über breitbandmessung.de dient nur zur **Dokumentation und Frühwarnung**.
Für rechtlich bindende Nachweise beim Anbieter muss die **offizielle Desktop-App** verwendet werden:
- 20 Messungen an 2 aufeinanderfolgenden Tagen
- Protokoll wird direkt in der App erstellt

### Ablauf

1. **Monitoring**: `ThresholdService` prüft Speedtest-Ergebnisse gegen TKG-Schwellenwerte
2. **Trigger**: Manuell über Frontend oder automatisch bei Schwellenwert-Unterschreitung
3. **Messung**: Playwright öffnet breitbandmessung.de/test und führt Messung durch
4. **Screenshots**: Mehrere Screenshots während des Prozesses (vorher, während, nachher)
5. **Export**: HTML der Seite + optional PDF-Export wenn verfügbar
6. **ZIP**: Alles wird als ZIP-Datei mit Metadaten gepackt
7. **Download**: Frontend zeigt Download-Link in der TKG-Seite

### Playwright-Integration Details

**Messablauf auf breitbandmessung.de:**

```
1. Navigiere zu /test
2. Klicke "Browsermessung starten" Button
3. Consent-Modal erscheint → Klicke "Akzeptieren"
4. Messung läuft (60-120 Sekunden)
5. "Die Messung ist abgeschlossen." erscheint
6. Exportiere CSV für Messwerte
7. Erstelle Screenshots & ZIP
```

**Selektoren (Stand 2026-01-20):**

```typescript
const SELECTORS = {
  // Start-Button
  startButton: 'button.btn-primary:has-text("Browsermessung starten")',

  // Consent-Modal nach Klick
  consentModal: '.modal.show',
  consentAcceptButton: '.modal.show button:has-text("Akzeptieren")',

  // Fertig-Erkennung
  completionIndicators: [
    'h1:has-text("Die Messung ist abgeschlossen")',
    'button:has-text("Test wiederholen")',
  ],

  // CSV-Export (Ergebnisse sind auf Canvas gerendert!)
  exportButton: 'button:has-text("Ergebnis exportieren")',
};
```

**Wichtig:** Die Messergebnisse (Download/Upload/Ping) werden auf `<canvas>` Elementen gerendert und können nicht direkt als Text ausgelesen werden. Daher wird der CSV-Export verwendet.

### ZIP-Inhalt

Jede Messung erzeugt ein ZIP mit:
- `screenshots/01_initial_page.png` - Seite vor dem Start
- `screenshots/02_consent_modal.png` - Zustimmungs-Dialog (optional)
- `screenshots/03_measurement_running.png` - Während der Messung
- `screenshots/04_measurement_result.png` - Ergebnis-Screenshot
- `messung_[timestamp].csv` - CSV-Export mit Messwerten
- `page_[timestamp].html` - Kompletter HTML-Inhalt für Debugging
- `metadata.json` - Messwerte, Test-ID, Zeitstempel, Disclaimer

### Exports-Verzeichnis

Die Dateien werden gespeichert unter:
```
backend/exports/
├── screenshots/   # Alle Screenshots
├── data/          # HTML und PDF Exporte
└── zips/          # Fertige ZIP-Downloads
```

## Entwicklung

### Lokaler Start

```bash
# Backend
cd backend
npm install
npx playwright install chromium  # Für Bundesnetzagentur-Messung
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

### Docker

```bash
docker-compose up -d
```

### Datenbank-Migration

Nach Schema-Änderungen:
```bash
cd backend
npx prisma migrate dev --name "add_tkg_tables"
npx prisma generate
```

### Neue Abhängigkeiten (TKG-Feature)

Backend:
- `playwright` - Browser-Automatisierung
- `archiver` - ZIP-Erstellung
- `@fastify/static` - Statische Dateien servieren

## Notizen für zukünftige Entwicklung

- [ ] WebSocket für Echtzeit-Updates während Bundesnetzagentur-Messung
- [ ] Email-Benachrichtigung bei kritischen Schwellenwerten
- [ ] Historische Analyse der Schwellenwert-Unterschreitungen
- [ ] PDF-Report-Generierung für Beschwerden beim Anbieter
