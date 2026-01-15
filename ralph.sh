#!/bin/bash
#
# ralph.sh - Autonomer Task-Runner mit Claude Code
# Spawnt neue Sessions mit frischem Context und arbeitet TASK.md ab
#

set -e

# Farben fuer Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default-Werte
MAX_ITERATIONS=10
COMPLETION_PROMISE=""
TASK_FILE="TASK.md"
PROGRESS_FILE="PROGRESS.md"
VERBOSE=false
EXTRA_CONTEXT=""
CONTINUE_RUN=false

# Log-Datei mit Timestamp
RUN_TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
LOG_DIR="./ralph_logs"
LOG_FILE="${LOG_DIR}/ralph_run_${RUN_TIMESTAMP}.log"
LATEST_LOG="${LOG_DIR}/ralph_latest.log"

# Hilfe-Text
show_help() {
    cat << EOF
${CYAN}ralph.sh${NC} - Autonomer Task-Runner mit Claude Code

${YELLOW}USAGE:${NC}
    ./ralph.sh [OPTIONS]
    ./ralph.sh [OPTIONS] --continue "Fehlermeldung oder zusaetzlicher Kontext"

${YELLOW}OPTIONS:${NC}
    -m, --max-iterations NUM    Maximale Anzahl an Iterationen (default: 10)
    -c, --completion-promise    Text/Pattern das in PROGRESS.md erscheinen muss
                                um als "fertig" zu gelten
    -t, --task-file FILE        Task-Datei (default: TASK.md)
    -p, --progress-file FILE    Progress-Datei (default: PROGRESS.md)
    -v, --verbose               Ausfuehrliche Ausgabe
    -h, --help                  Diese Hilfe anzeigen

    ${CYAN}Fortsetzen & Kontext:${NC}
    --continue                  Task fortsetzen (PROGRESS.md wird nicht zurueckgesetzt)
    -x, --extra "TEXT"          Zusaetzlicher Kontext/Prompt (z.B. Fehlermeldungen)
    --error "TEXT"              Alias fuer --extra (fuer Fehlermeldungen)
    -xf, --extra-file FILE      Kontext aus Datei lesen (fuer mehrzeiligen Text)
    --error-file FILE           Alias fuer --extra-file
    -xi, --extra-interactive    Kontext interaktiv eingeben (beenden mit Ctrl+D)

    ${CYAN}Logging:${NC}
    -l, --log-dir DIR           Log-Verzeichnis (default: ./ralph_logs)
    --no-log                    Logging deaktivieren

${YELLOW}BEISPIELE:${NC}
    # Einfacher Aufruf mit 5 Iterationen
    ./ralph.sh --max-iterations 5

    # Mit Completion-Promise (stoppt wenn "ALLE TASKS ABGESCHLOSSEN" in PROGRESS.md)
    ./ralph.sh -m 20 -c "ALLE TASKS ABGESCHLOSSEN"

    # Task fortsetzen mit Fehlermeldung (einzeilig)
    ./ralph.sh --continue --error "Build failed: Cannot find module 'react'"

    # Mehrzeilige Fehlermeldung aus Datei
    docker-compose up 2>&1 | tee error.log
    ./ralph.sh --continue --error-file error.log

    # Mehrzeilige Fehlermeldung per Pipe
    docker-compose up 2>&1 | ./ralph.sh --continue -xi

    # Interaktiv eingeben (Text einpasten, dann Ctrl+D)
    ./ralph.sh --continue -xi

    # Mit zusaetzlichem Kontext
    ./ralph.sh -m 10 -x "Bitte verwende Python statt Node.js"

${YELLOW}FUNKTIONSWEISE:${NC}
    1. Liest TASK.md fuer die Aufgabenbeschreibung
    2. Liest PROGRESS.md fuer den aktuellen Stand (falls vorhanden)
    3. Startet Claude Code mit ultrathink in neuer Session
    4. Claude arbeitet Tasks ab und aktualisiert PROGRESS.md
    5. Prueft ob completion-promise erfuellt ist
    6. Wiederholt bis max-iterations erreicht oder fertig

EOF
}

# Argumente parsen
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--max-iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        -c|--completion-promise)
            COMPLETION_PROMISE="$2"
            shift 2
            ;;
        -t|--task-file)
            TASK_FILE="$2"
            shift 2
            ;;
        -p|--progress-file)
            PROGRESS_FILE="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --continue)
            CONTINUE_RUN=true
            shift
            ;;
        -x|--extra|--error)
            EXTRA_CONTEXT="$2"
            shift 2
            ;;
        -xf|--extra-file|--error-file)
            if [[ ! -f "$2" ]]; then
                echo -e "${RED}Fehler: Datei '$2' nicht gefunden!${NC}"
                exit 1
            fi
            EXTRA_CONTEXT=$(cat "$2")
            shift 2
            ;;
        -xi|--extra-interactive)
            # Prüfe ob stdin ein Terminal ist oder Daten gepipet werden
            if [[ -t 0 ]]; then
                echo -e "${CYAN}Gib den zusaetzlichen Kontext ein (beenden mit Ctrl+D):${NC}"
                echo -e "${YELLOW}─────────────────────────────────────────────────────${NC}"
            fi
            EXTRA_CONTEXT=$(cat)
            if [[ -t 0 ]]; then
                echo -e "${YELLOW}─────────────────────────────────────────────────────${NC}"
                echo -e "${GREEN}Kontext eingelesen (${#EXTRA_CONTEXT} Zeichen)${NC}"
            fi
            shift
            ;;
        -l|--log-dir)
            LOG_DIR="$2"
            LOG_FILE="${LOG_DIR}/ralph_run_${RUN_TIMESTAMP}.log"
            LATEST_LOG="${LOG_DIR}/ralph_latest.log"
            shift 2
            ;;
        --no-log)
            LOG_DIR=""
            LOG_FILE=""
            LATEST_LOG=""
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unbekannte Option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Pruefe ob TASK.md existiert
if [[ ! -f "$TASK_FILE" ]]; then
    echo -e "${RED}Fehler: $TASK_FILE nicht gefunden!${NC}"
    exit 1
fi

# Pruefe ob claude command verfuegbar ist
if ! command -v claude &> /dev/null; then
    echo -e "${RED}Fehler: 'claude' CLI nicht gefunden!${NC}"
    echo "Bitte installiere Claude Code: https://claude.com/code"
    exit 1
fi

# Logging initialisieren
init_logging() {
    if [[ -z "$LOG_DIR" ]]; then
        return 0  # Logging deaktiviert
    fi

    # Log-Verzeichnis erstellen
    mkdir -p "$LOG_DIR"

    # Log-Datei initialisieren
    cat > "$LOG_FILE" << EOF
================================================================================
RALPH.SH - AUTONOMER TASK-RUNNER LOG
================================================================================
Gestartet: $(date '+%Y-%m-%d %H:%M:%S')
Task-Datei: $TASK_FILE
Progress-Datei: $PROGRESS_FILE
Max Iterationen: $MAX_ITERATIONS
Completion-Promise: ${COMPLETION_PROMISE:-'(nicht gesetzt)'}
Continue-Mode: $CONTINUE_RUN
Extra-Context: ${EXTRA_CONTEXT:-'(keiner)'}
================================================================================

EOF

    # Symlink auf neuestes Log
    ln -sf "$(basename "$LOG_FILE")" "$LATEST_LOG"

    echo -e "${BLUE}Log-Datei: $LOG_FILE${NC}"
}

# Funktion zum Loggen
log_message() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Immer auf Terminal ausgeben
    case $level in
        "INFO")
            echo -e "${BLUE}[$timestamp] $message${NC}"
            ;;
        "ERROR")
            echo -e "${RED}[$timestamp] ERROR: $message${NC}"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[$timestamp] $message${NC}"
            ;;
        *)
            echo "[$timestamp] $message"
            ;;
    esac

    # In Log-Datei schreiben falls aktiv
    if [[ -n "$LOG_FILE" ]]; then
        echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    fi
}

# Logging initialisieren
init_logging

# Initialisiere PROGRESS.md falls nicht vorhanden oder nicht im Continue-Mode
if [[ ! -f "$PROGRESS_FILE" ]] || [[ "$CONTINUE_RUN" == false && ! -s "$PROGRESS_FILE" ]]; then
    cat > "$PROGRESS_FILE" << 'PROGRESS_EOF'
# Progress Log

## Status: IN PROGRESS

## Gesamtuebersicht Tasks
PROGRESS_EOF
    # Tasks aus TASK.md extrahieren
    grep -E "^#{1,3} Task" "$TASK_FILE" 2>/dev/null | sed 's/^/- [ ] /' >> "$PROGRESS_FILE" || echo "- [ ] Tasks werden beim ersten Durchlauf identifiziert" >> "$PROGRESS_FILE"

    cat >> "$PROGRESS_FILE" << EOF

---

## Aenderungshistorie

> Jede Iteration dokumentiert hier ihre Aenderungen mit Reasoning.
> Format: Was wurde geaendert, warum, welche Dateien betroffen.

---

## Iteration 0 - Initialisierung - $(date '+%Y-%m-%d %H:%M')

### Zusammenfassung
Progress-Tracking initialisiert. Warte auf erste Iteration.

### Task Status
$(grep -E "^#{1,3} Task" "$TASK_FILE" 2>/dev/null | sed 's/^/- [ ] /' || echo "- [ ] Tasks werden identifiziert")

### Naechste Schritte
- Iteration 1 wird alle Tasks analysieren und mit der Implementierung beginnen

EOF
    log_message "INFO" "Neue $PROGRESS_FILE erstellt"
fi

# Funktion zum Pruefen des Completion-Promise
check_completion() {
    if [[ -z "$COMPLETION_PROMISE" ]]; then
        return 1  # Kein Promise definiert, nie automatisch fertig
    fi

    if grep -q "$COMPLETION_PROMISE" "$PROGRESS_FILE" 2>/dev/null; then
        return 0  # Promise gefunden
    fi

    return 1  # Promise nicht gefunden
}

# Funktion zum Erstellen des Prompts
create_prompt() {
    local iteration=$1
    local task_content
    local progress_content
    local extra_section=""

    task_content=$(cat "$TASK_FILE")
    progress_content=$(cat "$PROGRESS_FILE" 2>/dev/null || echo "Noch kein Progress vorhanden.")

    # Extra-Kontext hinzufuegen falls vorhanden
    if [[ -n "$EXTRA_CONTEXT" ]]; then
        extra_section="
## ZUSAETZLICHER KONTEXT / FEHLERMELDUNG
Der Benutzer hat folgenden zusaetzlichen Kontext/Fehlermeldung mitgegeben:
\`\`\`
$EXTRA_CONTEXT
\`\`\`
WICHTIG: Beruecksichtige diesen Kontext bei deiner Arbeit! Falls es eine Fehlermeldung ist, analysiere und behebe das Problem zuerst!
"
    fi

    cat << PROMPT
Du bist ein autonomer Task-Runner. Dies ist Iteration $iteration von maximal $MAX_ITERATIONS.

WICHTIG: Dies ist eine KOMPLETT NEUE SESSION mit frischem Context!
Du hast KEINEN Zugriff auf vorherige Konversationen - nur auf PROGRESS.md als Gedaechtnis.
$extra_section
## DEINE AUFGABE
Arbeite ALLE Tasks aus der TASK.md ab - nicht nur einen! Gehe systematisch durch und erledige so viel wie moeglich in dieser Iteration. Dokumentiere deinen Fortschritt praezise in PROGRESS.md.

## WICHTIGE REGELN
1. Lies ZUERST PROGRESS.md um zu verstehen wo du stehst - das ist dein einziges Gedaechtnis!
2. Arbeite ALLE unerledigten Tasks ab, nicht nur einen pro Iteration
3. Fuer jeden Task:
   a) Implementiere die Loesung
   b) Teste ob es funktioniert (kompilieren, ausfuehren, etc.)
   c) Erst wenn der Test erfolgreich ist, markiere als erledigt in PROGRESS.md
4. Aktualisiere PROGRESS.md KONTINUIERLICH waehrend du arbeitest
5. Wenn alle Tasks erledigt sind, schreibe "ALLE TASKS ABGESCHLOSSEN" in PROGRESS.md
6. Sei GRUENDLICH - ueberspringe keine Schritte, teste alles
${COMPLETION_PROMISE:+7. Completion-Signal: Schreibe "$COMPLETION_PROMISE" wenn alles fertig ist}

## TASK.md INHALT
\`\`\`markdown
$task_content
\`\`\`

## AKTUELLER PROGRESS (PROGRESS.md)
\`\`\`markdown
$progress_content
\`\`\`

## DEIN AUFTRAG FUER DIESE ITERATION
1. Lies PROGRESS.md und analysiere den aktuellen Stand
2. Identifiziere ALLE noch unerledigten Tasks
3. Fuer JEDEN unerledigten Task:
   - Implementiere die Loesung
   - Teste gruendlich (build, run, etc.)
   - Dokumentiere Ergebnis in PROGRESS.md
   - Gehe zum naechsten Task
4. Aktualisiere PROGRESS.md nach JEDEM abgeschlossenen Task mit:
   - [x] Task X: Erledigt - kurze Beschreibung was gemacht wurde
   - Eventuelle Probleme oder Erkenntnisse
5. Falls ALLE Tasks erledigt:
   - Schreibe "## Status: ALLE TASKS ABGESCHLOSSEN" in PROGRESS.md
   ${COMPLETION_PROMISE:+- Schreibe "$COMPLETION_PROMISE" in PROGRESS.md}

## ITERATION PROGRESS FORMAT (fuer PROGRESS.md)
WICHTIG: Dokumentiere JEDE Aenderung mit Reasoning! Nutze dieses Format:

\`\`\`markdown
---

## Iteration $iteration - $(date '+%Y-%m-%d %H:%M')

### Zusammenfassung
[2-3 Saetze: Was wurde in dieser Iteration erreicht?]

### Aenderungen

#### 1. [Dateiname oder Komponente]
- **Was:** [Konkrete Aenderung beschreiben]
- **Warum:** [Reasoning - warum war diese Aenderung notwendig?]
- **Dateien:** \`path/to/file.ts\`, \`path/to/other.ts\`

#### 2. [Naechste Aenderung]
- **Was:** ...
- **Warum:** ...
- **Dateien:** ...

### Task Status
- [x] Task 1: Erledigt - [kurze Beschreibung]
- [x] Task 2: Erledigt - [kurze Beschreibung]
- [ ] Task 3: Noch offen
- [ ] Task 4: Noch offen

### Erkenntnisse & Probleme
- [Wichtige Erkenntnisse fuer die naechste Iteration]
- [Eventuelle Blocker oder Probleme]

### Naechste Schritte
- [Was muss die naechste Iteration machen?]
\`\`\`

Beginne JETZT mit der Arbeit! Arbeite ALLE Tasks durch und dokumentiere JEDE Aenderung!
PROMPT
}

# Header ausgeben
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                      ralph.sh                                ║"
echo "║            Autonomer Task-Runner mit Claude Code             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${BLUE}Konfiguration:${NC}"
echo -e "  Max Iterationen:    ${YELLOW}$MAX_ITERATIONS${NC}"
echo -e "  Task-Datei:         ${YELLOW}$TASK_FILE${NC}"
echo -e "  Progress-Datei:     ${YELLOW}$PROGRESS_FILE${NC}"
echo -e "  Completion-Promise: ${YELLOW}${COMPLETION_PROMISE:-'(nicht gesetzt)'}${NC}"
echo -e "  Continue-Mode:      ${YELLOW}$CONTINUE_RUN${NC}"
if [[ -n "$EXTRA_CONTEXT" ]]; then
    echo -e "  Extra-Kontext:      ${YELLOW}(${#EXTRA_CONTEXT} Zeichen)${NC}"
fi
echo ""
echo -e "${BLUE}Logging:${NC}"
if [[ -n "$LOG_FILE" ]]; then
    echo -e "  Log-Verzeichnis:    ${YELLOW}$LOG_DIR${NC}"
    echo -e "  Log-Datei:          ${YELLOW}$LOG_FILE${NC}"
    echo -e "  Latest-Symlink:     ${YELLOW}$LATEST_LOG${NC}"
else
    echo -e "  ${YELLOW}Logging deaktiviert${NC}"
fi
echo ""

# Hauptschleife
for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo ""
    log_message "INFO" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_message "INFO" "▶ ITERATION $i/$MAX_ITERATIONS gestartet"
    log_message "INFO" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Prompt erstellen
    PROMPT=$(create_prompt $i)

    if [[ "$VERBOSE" == true ]]; then
        echo -e "${YELLOW}Prompt:${NC}"
        echo "$PROMPT"
        echo ""
    fi

    # Logge den Prompt in die Log-Datei
    if [[ -n "$LOG_FILE" ]]; then
        echo "" >> "$LOG_FILE"
        echo "┌──────────────────────────────────────────────────────────────────────────────" >> "$LOG_FILE"
        echo "│ ITERATION $i - PROMPT" >> "$LOG_FILE"
        echo "│ $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
        echo "└──────────────────────────────────────────────────────────────────────────────" >> "$LOG_FILE"
        echo "$PROMPT" >> "$LOG_FILE"
        echo "" >> "$LOG_FILE"
        echo "┌──────────────────────────────────────────────────────────────────────────────" >> "$LOG_FILE"
        echo "│ ITERATION $i - CLAUDE OUTPUT" >> "$LOG_FILE"
        echo "│ $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
        echo "└──────────────────────────────────────────────────────────────────────────────" >> "$LOG_FILE"
    fi

    log_message "INFO" "Starte Claude Code Session..."

    # Claude ausfuehren
    CLAUDE_CMD="claude --print --dangerously-skip-permissions --model claude-opus-4-5-20251101 --max-turns 50"

    # Output speichern fuer Log
    ITERATION_LOG="/tmp/ralph_iteration_${i}.log"

    # Claude ausfuehren und Output sowohl auf Terminal als auch in Logs schreiben
    if [[ -n "$LOG_FILE" ]]; then
        # Mit Logging: Output geht an Terminal UND Log-Datei
        if ! eval "$CLAUDE_CMD" '"$PROMPT"' 2>&1 | tee "$ITERATION_LOG" | tee -a "$LOG_FILE"; then
            log_message "ERROR" "Claude Ausfuehrung fehlgeschlagen"
        fi
    else
        # Ohne Logging: Output geht nur an Terminal
        if ! eval "$CLAUDE_CMD" '"$PROMPT"' 2>&1 | tee "$ITERATION_LOG"; then
            echo -e "${RED}Fehler bei Claude Ausfuehrung!${NC}"
        fi
    fi

    # Log Iteration Ende
    if [[ -n "$LOG_FILE" ]]; then
        echo "" >> "$LOG_FILE"
        echo "──────────────────────────────────────────────────────────────────────────────" >> "$LOG_FILE"
        echo "ITERATION $i BEENDET - $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
        echo "──────────────────────────────────────────────────────────────────────────────" >> "$LOG_FILE"
        echo "" >> "$LOG_FILE"
    fi

    echo ""
    log_message "SUCCESS" "Iteration $i abgeschlossen"

    # Zeige Zusammenfassung der letzten Iteration aus PROGRESS.md
    echo ""
    echo -e "${YELLOW}┌─────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│ ZUSAMMENFASSUNG ITERATION $i                                     ${NC}"
    echo -e "${YELLOW}└─────────────────────────────────────────────────────────────────┘${NC}"

    # Extrahiere die letzte Iteration-Zusammenfassung aus PROGRESS.md
    if grep -q "## Iteration $i" "$PROGRESS_FILE" 2>/dev/null; then
        # Zeige Zusammenfassung
        echo -e "${CYAN}Zusammenfassung:${NC}"
        sed -n "/## Iteration $i/,/### Aenderungen/p" "$PROGRESS_FILE" 2>/dev/null | grep -A5 "### Zusammenfassung" | tail -n +2 | head -5 | sed 's/^/  /'
        echo ""

        # Zeige Task Status
        echo -e "${CYAN}Task Status:${NC}"
        sed -n "/## Iteration $i/,/### Erkenntnisse/p" "$PROGRESS_FILE" 2>/dev/null | grep -E "^\- \[.\]" | head -10 | sed 's/^/  /'
        echo ""

        # Zaehle erledigte vs offene Tasks
        DONE_COUNT=$(sed -n "/## Iteration $i/,/---/p" "$PROGRESS_FILE" 2>/dev/null | grep -c "\- \[x\]" || echo "0")
        TODO_COUNT=$(sed -n "/## Iteration $i/,/---/p" "$PROGRESS_FILE" 2>/dev/null | grep -c "\- \[ \]" || echo "0")
        echo -e "${GREEN}Erledigt: $DONE_COUNT${NC} | ${YELLOW}Offen: $TODO_COUNT${NC}"

        # Log die Zusammenfassung
        if [[ -n "$LOG_FILE" ]]; then
            echo "" >> "$LOG_FILE"
            echo "ITERATION $i ZUSAMMENFASSUNG:" >> "$LOG_FILE"
            echo "  Erledigt: $DONE_COUNT | Offen: $TODO_COUNT" >> "$LOG_FILE"
        fi
    else
        echo -e "${YELLOW}  (Keine strukturierte Zusammenfassung in PROGRESS.md gefunden)${NC}"
    fi
    echo ""

    # Pruefe ob fertig
    if check_completion; then
        echo ""
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║              COMPLETION-PROMISE ERFUELLT!                    ║${NC}"
        echo -e "${GREEN}║                   Task abgeschlossen.                        ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "Gefunden: ${YELLOW}$COMPLETION_PROMISE${NC} in $PROGRESS_FILE"

        # Log-Abschluss
        if [[ -n "$LOG_FILE" ]]; then
            cat >> "$LOG_FILE" << EOF

================================================================================
RALPH.SH - ERFOLGREICH ABGESCHLOSSEN
================================================================================
Beendet: $(date '+%Y-%m-%d %H:%M:%S')
Iterationen: $i von $MAX_ITERATIONS
Status: COMPLETION-PROMISE ERFUELLT
Promise: $COMPLETION_PROMISE
================================================================================
EOF
            echo -e "${BLUE}Vollstaendiges Log: $LOG_FILE${NC}"
        fi
        exit 0
    fi

    # Extra-Kontext nur fuer erste Iteration verwenden
    EXTRA_CONTEXT=""

    # Pause zwischen Iterationen - neuer Context wird vorbereitet
    if [[ $i -lt $MAX_ITERATIONS ]]; then
        echo ""
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${CYAN}  Bereite neue Session vor (frischer Context/Cache)...${NC}"
        echo -e "${CYAN}  Naechste Iteration startet in 5 Sekunden...${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        sleep 5
    fi
done

# Max Iterationen erreicht
echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║            MAXIMALE ITERATIONEN ERREICHT                     ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Der Task wurde nach $MAX_ITERATIONS Iterationen nicht abgeschlossen."
echo -e "Pruefe ${CYAN}$PROGRESS_FILE${NC} fuer den aktuellen Stand."
echo ""
echo -e "${BLUE}Optionen:${NC}"
echo -e "  1. Erhoehe --max-iterations und starte erneut"
echo -e "  2. Pruefe PROGRESS.md und passe TASK.md an"
echo -e "  3. Fuehre manuell weiter aus"
echo -e "  4. Mit Fehlermeldung fortsetzen:"
echo -e "     ${CYAN}./ralph.sh --continue --error \"Deine Fehlermeldung\"${NC}"

# Log-Abschluss bei Max-Iterationen
if [[ -n "$LOG_FILE" ]]; then
    cat >> "$LOG_FILE" << EOF

================================================================================
RALPH.SH - MAXIMALE ITERATIONEN ERREICHT
================================================================================
Beendet: $(date '+%Y-%m-%d %H:%M:%S')
Iterationen: $MAX_ITERATIONS von $MAX_ITERATIONS
Status: NICHT ABGESCHLOSSEN
Completion-Promise: ${COMPLETION_PROMISE:-'(nicht gesetzt)'}
================================================================================

Naechste Schritte:
- Pruefe PROGRESS.md fuer aktuellen Stand
- Erhoehe --max-iterations falls noetig
- Oder fuehre manuell weiter aus
- Mit Fehlermeldung fortsetzen: ./ralph.sh --continue --error "..."
EOF
    echo ""
    echo -e "${BLUE}Vollstaendiges Log: $LOG_FILE${NC}"
fi

exit 1
