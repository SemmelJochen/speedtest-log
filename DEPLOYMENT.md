# Deployment Guide

## CI/CD Pipeline

Die CI/CD Pipeline besteht aus zwei Workflows:

### 1. CI Workflow (`.github/workflows/ci.yml`)

Wird bei jedem Push und Pull Request auf `main` ausgeführt:

- **Backend CI**: Format-Check, Linting, Type-Check, Build
- **Frontend CI**: Format-Check, Linting, Type-Check, Build
- **Docker Build**: Testet ob Docker Images erfolgreich gebaut werden können

### 2. Deploy Workflow (`.github/workflows/deploy.yml`)

Wird bei jedem Push auf `main` ausgeführt (außer Markdown-Dateien):

- Baut Docker Images für `linux/amd64` und `linux/arm64`
- Pusht Images zu GitHub Container Registry (ghcr.io)
- Optionaler automatischer Deploy zur NAS

## NAS Deployment Optionen

### Option A: Self-Hosted Runner (Empfohlen)

Am einfachsten für automatische Deployments.

#### Setup auf der NAS:

1. GitHub Actions Runner installieren:
   ```bash
   # Auf der NAS
   mkdir actions-runner && cd actions-runner
   curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
   tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz
   ```

2. Runner registrieren:
   ```bash
   ./config.sh --url https://github.com/<username>/<repo> --token <TOKEN>
   # Label: nas
   ```

3. Als Service installieren:
   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```

4. In GitHub Repository Settings:
   - Variables → Repository Variables → `DEPLOY_METHOD` = `self-hosted`

### Option B: SSH Deployment

Für NAS ohne GitHub Runner.

#### Voraussetzungen:

1. SSH-Zugang zur NAS
2. Docker und Docker Compose installiert
3. Projekt-Verzeichnis auf NAS vorbereitet

#### Setup:

1. SSH Key generieren:
   ```bash
   ssh-keygen -t ed25519 -f nas_deploy_key -N ""
   ```

2. Public Key auf NAS kopieren:
   ```bash
   ssh-copy-id -i nas_deploy_key.pub user@nas-host
   ```

3. GitHub Secrets konfigurieren:
   - `NAS_HOST`: IP oder Hostname der NAS
   - `NAS_USER`: SSH Benutzername
   - `NAS_SSH_KEY`: Inhalt von `nas_deploy_key` (private key)
   - `NAS_DEPLOY_PATH` (optional): Pfad zum docker-compose Verzeichnis

4. Repository Variable setzen:
   - `DEPLOY_METHOD` = `ssh`

5. Auf der NAS:
   ```bash
   # Projekt-Verzeichnis erstellen
   mkdir -p /docker/speedtest-logger
   cd /docker/speedtest-logger

   # docker-compose.yml kopieren
   # .env Datei erstellen mit Konfiguration
   ```

### Option C: Watchtower (Automatisches Image Update)

Für passive Updates ohne CI-Integration.

#### Setup auf der NAS:

1. Watchtower zum docker-compose hinzufügen:
   ```yaml
   services:
     watchtower:
       image: containrrr/watchtower
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock
       environment:
         - WATCHTOWER_CLEANUP=true
         - WATCHTOWER_POLL_INTERVAL=300
       restart: unless-stopped
   ```

2. Images in docker-compose auf ghcr.io umstellen:
   ```yaml
   services:
     backend:
       image: ghcr.io/<username>/speedtest-log-backend:latest
     frontend:
       image: ghcr.io/<username>/speedtest-log-frontend:latest
   ```

### Option D: Manuelles Deployment

Für vollständige Kontrolle.

```bash
# Auf der NAS
cd /docker/speedtest-logger
git pull origin main
docker compose build
docker compose up -d
```

## Erste Installation auf der NAS

1. Repository klonen:
   ```bash
   git clone https://github.com/<username>/speedtest-log.git /docker/speedtest-logger
   cd /docker/speedtest-logger
   ```

2. Konfiguration erstellen:
   ```bash
   cp .env.example .env
   nano .env  # Anpassen
   ```

3. Container starten:
   ```bash
   docker compose up -d
   ```

4. Logs prüfen:
   ```bash
   docker compose logs -f
   ```

## Lokale Entwicklung

```bash
# Dependencies installieren
cd backend && npm install
cd ../frontend && npm install

# Linting und Formatting
npm run lint
npm run format

# Build
npm run build
```

## Environment Variablen

| Variable | Beschreibung | Standard |
|----------|--------------|----------|
| `DB_USER` | PostgreSQL Benutzer | `speedtest` |
| `DB_PASSWORD` | PostgreSQL Passwort | `speedtest123` |
| `DB_NAME` | Datenbank Name | `speedtest` |
| `VITE_API_URL` | API URL für Frontend Build | `http://localhost:3001` |
| `SPEEDTEST_CRON` | Cron-Expression für Speedtests | `*/5 * * * *` |
| `RUN_ON_STARTUP` | Speedtest beim Container-Start | `true` |
