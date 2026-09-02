#!/bin/bash
# ---------------------------------------------------------------------------------------------------
# Wiederherstellung – und, wichtiger, der Wiederherstellungstest.
#
# Eine Sicherung, die man nie zurückgespielt hat, ist keine Sicherung, sondern eine Hoffnung.
# Deshalb gibt es hier zwei Betriebsarten:
#
#   test <datei>   Spielt die Sicherung in eine Wegwerf-Datenbank ein, zählt die wichtigsten Tabellen
#                  und löscht sie wieder. Der Echtbetrieb wird dabei NICHT angefasst. Einmal im Quartal.
#
#   echt <datei>   Spielt die Sicherung in die laufende Datenbank zurück. Überschreibt alles.
#                  Nur im Ernstfall, und nur wenn du weißt, dass du das willst.
#
# Beispiele (am Server, im Ordner /opt/foxpeople):
#   docker compose run --rm --entrypoint /usr/local/bin/wiederherstellen.sh backup test /backups/db-2026-09-01.dump
#   docker compose run --rm --entrypoint /usr/local/bin/wiederherstellen.sh backup test /backups/db-2026-09-01.dump.gpg
# ---------------------------------------------------------------------------------------------------
set -uo pipefail

ART=${1:-}
DATEI=${2:-}
melde() { echo "[$(date -Iseconds)] $*"; }

if [ -z "$ART" ] || [ -z "$DATEI" ]; then
  echo "Aufruf: wiederherstellen.sh test|echt <Datei>"
  echo "Vorhandene Sicherungen:"
  ls -lh /backups/ 2>/dev/null | tail -20
  exit 1
fi

if [ ! -f "$DATEI" ]; then
  melde "FEHLER: $DATEI gibt es nicht."
  exit 1
fi

# Verschlüsselte Datei zuerst öffnen
QUELLE="$DATEI"
if [ "${DATEI##*.}" = "gpg" ]; then
  if [ -z "${SICHERUNG_PASSWORT:-}" ]; then
    melde "FEHLER: Die Datei ist verschlüsselt, aber SICHERUNG_PASSWORT fehlt in der .env."
    exit 1
  fi
  QUELLE=/tmp/entschluesselt.dump
  if ! gpg --batch --yes --quiet --pinentry-mode loopback --passphrase "$SICHERUNG_PASSWORT" -o "$QUELLE" -d "$DATEI"; then
    melde "FEHLER: Entschlüsselung fehlgeschlagen – stimmt SICHERUNG_PASSWORT noch?"
    exit 1
  fi
  melde "Datei entschlüsselt."
fi

if ! pg_restore --list "$QUELLE" > /dev/null 2>&1; then
  melde "FEHLER: Die Datei ist keine gültige Sicherung (Inhaltsverzeichnis nicht lesbar)."
  exit 1
fi
melde "Inhaltsverzeichnis lesbar – die Sicherung ist formal in Ordnung."

case "$ART" in
  test)
    ZIEL="pruefung_$(date +%s)"
    melde "Spiele die Sicherung testweise in die Datenbank $ZIEL ein (der Echtbetrieb bleibt unberührt)."
    createdb -h db -U foxpeople "$ZIEL" || { melde "FEHLER: Testdatenbank konnte nicht angelegt werden."; exit 1; }
    pg_restore -h db -U foxpeople -d "$ZIEL" --no-owner --no-privileges "$QUELLE" > /tmp/restore.log 2>&1
    echo
    echo "So viele Datensätze sind angekommen:"
    psql -h db -U foxpeople -d "$ZIEL" -t -A -F' | ' -c "
      SELECT 'Personen', count(*) FROM \"Person\"
      UNION ALL SELECT 'Kunden', count(*) FROM \"Kunde\"
      UNION ALL SELECT 'Einsätze', count(*) FROM \"Einsatz\"
      UNION ALL SELECT 'Rechnungen', count(*) FROM \"Rechnung\"
      UNION ALL SELECT 'Stundennachweise', count(*) FROM \"Stundennachweis\"
      UNION ALL SELECT 'Dokumente', count(*) FROM \"Dokument\";" 2>/dev/null
    echo
    dropdb -h db -U foxpeople "$ZIEL"
    melde "Testdatenbank wieder gelöscht. Wenn oben plausible Zahlen stehen, ist die Sicherung brauchbar."
    ;;
  echt)
    melde "ACHTUNG: Der aktuelle Datenbestand wird überschrieben."
    melde "Zum Abbrechen jetzt Strg+C – es geht in 10 Sekunden los."
    sleep 10
    pg_restore -h db -U foxpeople -d foxpeople --clean --if-exists --no-owner --no-privileges "$QUELLE"
    melde "Wiederherstellung abgeschlossen. Jetzt am besten die Anwendung neu starten: docker compose restart app"
    melde "Nicht vergessen: die Dateien (storage-*.tgz) müssen getrennt zurückgespielt werden."
    ;;
  *)
    melde "Unbekannte Betriebsart '$ART' – erlaubt sind test und echt."
    exit 1
    ;;
esac

rm -f /tmp/entschluesselt.dump
