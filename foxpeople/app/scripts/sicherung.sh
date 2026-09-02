#!/bin/bash
# ---------------------------------------------------------------------------------------------------
# Tägliche Sicherung von Fox & People – lokal und, wenn eingerichtet, verschlüsselt außer Haus.
#
# Warum außer Haus: Eine Kopie, die neben dem Original liegt, hilft gegen "aus Versehen gelöscht",
# aber nicht gegen Plattenschaden, einen falschen Befehl oder einen Einbruch auf dem Server – dann ist
# beides zusammen weg. Deshalb wird die Sicherung zusätzlich auf eine zweite Maschine geschoben
# (Hetzner Storage Box), und zwar verschlüsselt: Wer dort hineinsieht, sieht nur unlesbare Dateien.
#
# Ohne die Storagebox-Variablen in der .env läuft alles wie bisher – nur lokal. Nichts geht kaputt,
# wenn die Einrichtung noch nicht gemacht ist.
# ---------------------------------------------------------------------------------------------------
set -uo pipefail

ZIEL=/backups
TAGE_LOKAL=${SICHERUNG_TAGE_LOKAL:-30}
STUNDE=${SICHERUNG_STUNDE:-02}

melde() { echo "[$(date -Iseconds)] $*"; }

sichern() {
  local d; d=$(date +%F)
  local dump="$ZIEL/db-$d.dump"
  local dateien="$ZIEL/storage-$d.tgz"

  # ---- 1. Datenbank -------------------------------------------------------------------------------
  # -Fc statt "pg_dump | gzip": bei einer Pipe kommt der Rückgabewert von gzip an, ein abgebrochener
  # Dump hinterlässt also eine Datei, die gültig aussieht und es nicht ist.
  if ! pg_dump -h db -U foxpeople -Fc -f "$dump" foxpeople; then
    melde "FEHLER: pg_dump fehlgeschlagen – unvollständige Datei wird entfernt"
    rm -f "$dump"
    return 1
  fi
  local groesse; groesse=$(wc -c < "$dump")
  if [ "$groesse" -lt 10000 ]; then
    melde "WARNUNG: Die Sicherung ist nur $groesse Bytes groß – das ist zu klein, bitte prüfen"
  fi

  # Gegenprobe: lässt sich das Inhaltsverzeichnis der Sicherung lesen? Wenn nicht, ist sie unbrauchbar.
  if ! pg_restore --list "$dump" > /dev/null 2>&1; then
    melde "FEHLER: Die Sicherung ist beschädigt (Inhaltsverzeichnis nicht lesbar) – wird entfernt"
    rm -f "$dump"
    return 1
  fi

  # ---- 2. Hochgeladene Dateien --------------------------------------------------------------------
  if ! tar czf "$dateien" -C /storage .; then
    melde "FEHLER: Die Dateien konnten nicht gepackt werden"
    rm -f "$dateien"
    return 1
  fi

  melde "Sicherung $d erstellt (Datenbank $groesse Bytes, Dateien $(wc -c < "$dateien") Bytes)"

  # ---- 3. Alte lokale Sicherungen wegräumen -------------------------------------------------------
  find "$ZIEL" -maxdepth 1 -name 'db-*.dump' -mtime "+$TAGE_LOKAL" -delete
  find "$ZIEL" -maxdepth 1 -name 'storage-*.tgz' -mtime "+$TAGE_LOKAL" -delete
  find "$ZIEL" -maxdepth 1 -name '*.gpg' -mtime "+$TAGE_LOKAL" -delete

  # ---- 4. Kopie außer Haus ------------------------------------------------------------------------
  ausser_haus "$d" "$dump" "$dateien"
}

ausser_haus() {
  local d="$1" dump="$2" dateien="$3"
  if [ -z "${STORAGEBOX_HOST:-}" ] || [ -z "${STORAGEBOX_USER:-}" ]; then
    melde "Hinweis: Keine Kopie außer Haus eingerichtet (STORAGEBOX_HOST/STORAGEBOX_USER fehlen)."
    return 0
  fi
  if [ -z "${SICHERUNG_PASSWORT:-}" ]; then
    melde "FEHLER: SICHERUNG_PASSWORT fehlt – ohne Verschlüsselung wird nichts nach außen geschoben."
    return 1
  fi
  if [ ! -f /schluessel/id_ed25519 ]; then
    melde "FEHLER: Kein SSH-Schlüssel unter /schluessel/id_ed25519 – siehe docs/sicherung-ausser-haus.md"
    return 1
  fi

  # Schlüssel muss privat sein, sonst verweigert ssh den Dienst
  install -m 600 /schluessel/id_ed25519 /tmp/schluessel
  local SSH="ssh -i /tmp/schluessel -p ${STORAGEBOX_PORT:-23} -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/tmp/known_hosts"
  local PFAD=${STORAGEBOX_PFAD:-foxpeople}

  local fehler=0
  for f in "$dump" "$dateien"; do
    local name; name=$(basename "$f")
    # Symmetrisch verschlüsseln: zum Zurückholen genügt dasselbe Passwort, kein Schlüsselbund nötig
    if ! gpg --batch --yes --quiet --pinentry-mode loopback \
        --passphrase "$SICHERUNG_PASSWORT" --symmetric --cipher-algo AES256 \
        -o "/tmp/$name.gpg" "$f"; then
      melde "FEHLER: $name konnte nicht verschlüsselt werden"
      fehler=1
      continue
    fi
    if rsync -e "$SSH" --timeout=600 "/tmp/$name.gpg" "${STORAGEBOX_USER}@${STORAGEBOX_HOST}:${PFAD}/"; then
      melde "Außer Haus gesichert: $name.gpg"
    else
      melde "FEHLER: $name.gpg konnte nicht übertragen werden"
      fehler=1
    fi
    rm -f "/tmp/$name.gpg"
  done

  # Aufbewahrung außer Haus: alles älter als 90 Tage entfernen
  $SSH "${STORAGEBOX_USER}@${STORAGEBOX_HOST}" \
    "find ${PFAD} -name '*.gpg' -mtime +${SICHERUNG_TAGE_EXTERN:-90} -delete" 2>/dev/null \
    || melde "Hinweis: Alte Sicherungen außer Haus konnten nicht aufgeräumt werden (nicht kritisch)"

  rm -f /tmp/schluessel
  return $fehler
}

# ---- Hauptschleife --------------------------------------------------------------------------------
# Halbstündlich nachsehen, ob die Sicherung dieses Tages schon gelaufen ist. Dadurch läuft sie wirklich
# zur eingestellten Stunde und nicht "24 Stunden nach dem letzten Neustart".
melde "Sicherungsdienst gestartet (täglich um ${STUNDE}:00 Uhr, lokal ${TAGE_LOKAL} Tage)"
if [ -n "${STORAGEBOX_HOST:-}" ]; then
  melde "Kopie außer Haus: ${STORAGEBOX_USER:-?}@${STORAGEBOX_HOST}:${STORAGEBOX_PFAD:-foxpeople}"
fi

# Einmalig auf Zuruf: docker compose run --rm backup jetzt
if [ "${1:-}" = "jetzt" ]; then
  sichern
  exit $?
fi

while true; do
  if [ "$(date +%H)" = "$STUNDE" ] && [ ! -f "$ZIEL/db-$(date +%F).dump" ]; then
    sichern || melde "Die Sicherung von heute ist nicht vollständig durchgelaufen."
  fi
  sleep 1800
done
