# Fox & People – Verwaltungssoftware

Webbasierte All-in-One-Software für Arbeitskräfteüberlassung & Personalvermittlung (Blackburn Beteiligungs GmbH, Marke Fox & People). Kunden- und Bewerber-/Mitarbeiterverwaltung, Einsatzplanung mit Konfliktprüfung, Angebotskalkulation nach dem WIFI-NÖ-Schema 2023 (1:1 aus dem Excel-Verrechnungstool), Verträge aus Vorlagen, Monatsabrechnung mit automatischen Rückstellungen, Rechnungen mit lückenlosem Nummernkreis und Mahnwesen, Mitarbeiter-Portal, Controlling-Dashboard je Kostenstelle, Wissensassistent (Admin) und Monatsreports.

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · PostgreSQL 16 · Prisma 7 (pg-Adapter) · Tailwind 4 · @react-pdf/renderer · Playwright/Vitest.

## Schnellstart (lokal)

```bash
cd app
cp .env.example .env            # Werte setzen: DATABASE_URL, SESSION_SECRET, FIELD_ENCRYPTION_KEY (openssl rand -hex 32), SMTP …
npm install                      # generiert den Prisma-Client
npm run migrate                  # legt die Tabellen an (prisma/migrations/*.sql)
EXCEL_IMPORT_PATH=../Verrechnungstool.xlsx DEMO=1 npm run seed   # Kostenstellen, Nutzer, Sätze, Vorlagen; optional Excel-Import und Demo-Daten
npm run dev                      # http://localhost:3000
```

Zugänge nach dem Seed (Passwort `FoxPeople2026!` bzw. `SEED_PASSWORD`, bitte sofort ändern):

| Login | Rolle | sieht |
|---|---|---|
| admin@foxandpeople.at | Systemadmin | alles + Einstellungen, Wissensassistent |
| zentrale@foxandpeople.at | Zentrale (Headquarter Fox & People) | alle Kostenstellen |
| heindl@foxandpeople.at | Kostenstellen-Leitung | nur Kostenstelle Heindl (+ gemeinsamer Bewerber-Pool) |

## Produktion (Docker)

```bash
cp app/.env.example app/.env     # Produktionswerte eintragen (MAIL_MODE=live, SMTP, APP_URL=https://…)
DB_PASSWORD=… docker compose up -d --build
docker compose exec app npm run seed          # einmalig
```

Der Container führt die Migrationen beim Start aus. `backup`-Service: täglicher DB-Dump + Dateispeicher nach `./backups`, 30 Tage Aufbewahrung. Reverse-Proxy mit TLS (Caddy/Traefik/nginx) davorschalten.

## Tests

```bash
npm test          # Kalkulations-Engine gegen die Excel-Referenzwerte (28 Tests, auf 1e-6 genau)
npm run test:e2e  # Playwright-Smoke-Test der Kernabläufe gegen den laufenden Dev-Server
```

## Struktur

```
app/src/engine/kalkulation.ts   Kalkulations-Engine (Excel-Zellen dokumentiert), kalkulation.test.ts
app/src/lib/                    auth (Session, Rollen, Mandantenfilter), audit, crypto (SVNR-Verschlüsselung), controlling, einsatz (Konfliktprüfung),
                                import-excel, rechnung, vertrag (Platzhalter), wissen (Retrieval + Claude), pdf*, mail, storage
app/src/app/(app)/              Module: personen, kunden, einsaetze, angebote, vertraege, abrechnung, rechnungen, aufgaben, assistent, einstellungen
app/src/app/portal/             Mitarbeiter-Portal (Magic-Link)
app/prisma/schema.prisma        Datenmodell · prisma/migrations/*.sql · prisma/seed.ts · prisma/vorlagen/*.md (Vertragsvorlagen)
app/public/brand/               Wortmarke (SVG, hell/negativ)
docs/                           Datenmodell & Rechtemodell, Betrieb & Sicherheit, Startklar-Checkliste
```

## Wichtige Umgebungsvariablen

| Variable | Bedeutung |
|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindung |
| `SESSION_SECRET` | Signatur der Session-Cookies (≥ 32 Zeichen) |
| `FIELD_ENCRYPTION_KEY` | 64 Hex-Zeichen, AES-256-GCM für SVNR & 2FA-Secrets – **niemals ändern, sonst sind die Felder unlesbar** |
| `MAIL_MODE` | `test` (nur protokollieren) oder `live` |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | Versand über das Office-Postfach (Microsoft 365: smtp.office365.com:587) |
| `APP_URL` | öffentliche URL (für Portal-Links) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Wissensassistent & Monatsreport-Einschätzung (optional; ohne Key extraktiver Modus) |
| `FILE_STORAGE_DIR` | Dateispeicher (Dokumente, Fotos, PDFs) |
