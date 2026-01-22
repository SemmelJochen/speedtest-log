# Speedtest Logger

Eine Self-Hosted Lösung zum automatischen Überwachen deiner Internetgeschwindigkeit mit TKG-Schwellenwert-Monitoring und automatischer Bundesnetzagentur-Messung.

## Das Problem

Internetanbieter versprechen hohe Geschwindigkeiten, aber liefern sie diese auch? Nach dem deutschen Telekommunikationsgesetz (TKG) hast du das Recht auf die vertraglich zugesicherte Leistung:

- **Normalgeschwindigkeit**: Mindestens 90% der versprochenen Geschwindigkeit
- **Erhebliche Abweichung**: Unter 50% berechtigt zur Sonderkündigung

Das Problem: Um das nachzuweisen, müsstest du regelmäßig manuell Speedtests durchführen und dokumentieren. Wer macht das schon?

## Die Lösung

Speedtest Logger automatisiert das komplett:

- **Automatische Messungen** alle 5 Minuten (konfigurierbar) via Ookla Speedtest CLI
- **Langzeit-Statistiken** mit Durchschnittswerten, Trends und Ausreißer-Erkennung
- **TKG-Überwachung** mit konfigurierbaren Schwellenwerten für deine Vertragsgeschwindigkeit
- **Automatische Bundesnetzagentur-Messung** wenn Schwellenwerte unterschritten werden
- **Web-Dashboard** zur Visualisierung aller Daten

## Features

### Dashboard
- Echtzeit-Anzeige des letzten Speedtests
- Tages-, Wochen- und Monatsstatistiken
- Tagesvergleichs-Chart (vergleiche verschiedene Tage nach Uhrzeit)
- Download/Upload/Ping Historie

### TKG-Monitoring
- Konfiguriere deine vertraglich zugesicherte Geschwindigkeit
- Automatische Berechnung der TKG-Schwellenwerte (90% / 50%)
- Visueller Status: Gut / Warnung / Kritisch
- Automatischer Trigger bei Unterschreitung

### Bundesnetzagentur-Integration
- Automatische Messung über breitbandmessung.de bei Schwellenwert-Unterschreitung
- Screenshots und CSV-Export als Dokumentation
- ZIP-Download mit allen Messdaten
- Messungs-Historie mit Status-Tracking

> **Hinweis**: Die automatisierte Messung dient zur Dokumentation. Für rechtlich bindende Nachweise verwende die [offizielle Desktop-App](https://breitbandmessung.de) mit 20 Messungen an 2 aufeinanderfolgenden Tagen.

## Tech Stack

| Komponente | Technologie |
|------------|-------------|
| Backend | Node.js, TypeScript, Fastify, Prisma |
| Frontend | React 18, Vite, TailwindCSS, Recharts |
| Datenbank | PostgreSQL |
| Speedtest | Ookla Speedtest CLI |
| Browser-Automatisierung | Playwright (für Bundesnetzagentur) |
| Container | Docker, Docker Compose |

## Quick Start

### Mit Docker Compose (empfohlen)

```bash
# Repository klonen
git clone https://github.com/SemmelJochen/speedtest-log.git
cd speedtest-log

# Konfiguration anpassen (optional)
cp .env.example .env
# Bearbeite .env nach Bedarf

# Container starten
docker compose up -d
```

Das Dashboard ist dann erreichbar unter: `http://localhost:3000`

### Umgebungsvariablen

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `SPEEDTEST_CRON` | `*/5 * * * *` | Cron-Ausdruck für automatische Tests |
| `RUN_ON_STARTUP` | `true` | Speedtest beim Start ausführen |
| `CONTRACTED_DOWNLOAD_MBPS` | `100` | Vertraglich zugesicherte Download-Geschwindigkeit |
| `CONTRACTED_UPLOAD_MBPS` | `40` | Vertraglich zugesicherte Upload-Geschwindigkeit |

## Entwicklung

### Voraussetzungen

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose (für PostgreSQL)

### Lokaler Start

```bash
# Dependencies installieren
pnpm install

# Datenbank starten
docker compose -f docker-compose.dev.yml up -d

# Backend starten (in separatem Terminal)
cd backend
pnpm dev

# Frontend starten (in separatem Terminal)
cd frontend
pnpm dev
```

### Projektstruktur

```
speedtest-log/
├── backend/                 # Node.js API Server
│   ├── src/
│   │   ├── services/       # Business Logic
│   │   │   ├── speedtest.service.ts      # Ookla CLI Wrapper
│   │   │   ├── scheduler.service.ts      # Cron-basierte Planung
│   │   │   ├── threshold.service.ts      # TKG-Überwachung
│   │   │   └── bundesnetzagentur.service.ts  # Playwright-Messung
│   │   └── routes/         # API Endpoints
│   └── prisma/             # Datenbankschema
├── frontend/               # React SPA
│   └── src/
│       ├── routes/         # Seiten (Dashboard, TKG, Analytics)
│       └── components/     # UI-Komponenten
└── docker-compose.yml      # Produktions-Setup
```

## API

| Endpoint | Beschreibung |
|----------|--------------|
| `GET /api/results` | Speedtest-Ergebnisse (paginiert) |
| `GET /api/results/latest` | Letztes Ergebnis |
| `GET /api/stats` | Aggregierte Statistiken |
| `GET /api/stats/hourly` | Stündliche Durchschnitte |
| `GET /api/stats/daily` | Tägliche Durchschnitte |
| `POST /api/speedtest/run` | Manueller Speedtest |
| `GET /api/threshold/status` | Aktueller TKG-Status |
| `PUT /api/threshold/config` | Schwellenwerte konfigurieren |
| `POST /api/bundesnetzagentur/measure` | Bundesnetzagentur-Messung starten |
| `GET /api/bundesnetzagentur/exports` | Messungs-Historie |

## Deployment

Siehe [DEPLOYMENT.md](DEPLOYMENT.md) für detaillierte Anleitungen zu:
- GitHub Actions CI/CD Pipeline
- NAS Deployment (Synology, QNAP, etc.)
- Self-Hosted Runner Setup

## Roadmap / TODO

### Hohe Priorität

- [ ] **Prisma Migrations** - Aktuell wird `prisma db push` verwendet, was für Produktion nicht ideal ist. Umstellung auf versionierte Migrations für sichere Schema-Änderungen
- [ ] **Tests** - Unit-Tests für Services, Integration-Tests für API, E2E-Tests für kritische Flows
- [ ] **Docker Healthchecks** - Healthcheck-Endpoints für Backend/Frontend, damit Docker Container-Status korrekt erkennt
- [ ] **Error Retry Logic** - Automatische Wiederholung bei fehlgeschlagenen Speedtests (Netzwerk-Timeouts, etc.)

### Mittlere Priorität

- [ ] **Email-Benachrichtigungen** - Alert bei kritischen Schwellenwert-Unterschreitungen
- [ ] **PDF-Report-Generierung** - Zusammenfassender Bericht für Beschwerden beim Anbieter
- [ ] **Daten-Export** - CSV/JSON Export der Speedtest-Historie
- [ ] **Backup/Restore** - Einfache Datensicherung der PostgreSQL-Datenbank

### Nice to Have

- [ ] **Server-Auswahl** - Bestimmten Speedtest-Server für konsistentere Messungen wählen
- [ ] **Rate Limiting** - API-Absicherung gegen Missbrauch
- [ ] **i18n** - Internationalisierung (aktuell nur Deutsch)
- [ ] **Historische Analyse** - Trends über Monate, Vergleich mit Vorjahr, Ausfall-Statistiken

### Bekannte Einschränkungen

- Die Bundesnetzagentur-Messung benötigt einen headed Browser (kein reines Headless) für zuverlässige Ergebnisse
- Playwright im Docker-Container erhöht die Image-Größe erheblich (~400MB für Chromium)
- Die breitbandmessung.de Selektoren können sich bei Website-Updates ändern

## Lizenz

MIT

## Rechtlicher Hinweis

Dieses Tool dient zur persönlichen Dokumentation der Internetgeschwindigkeit. Die automatisierten Messungen über breitbandmessung.de ersetzen nicht die offizielle Messkampagne der Bundesnetzagentur für rechtliche Zwecke. Für Beschwerden beim Anbieter oder Sonderkündigungen nutze bitte die [offizielle Desktop-App](https://breitbandmessung.de/desktop-app).
