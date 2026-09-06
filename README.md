# Fox & People – Website

Zeitarbeit und Personalvermittlung in Niederösterreich und Wien.
Eine Geschäftsbezeichnung der Blackburn Beteiligungs GmbH.

## Was liegt wo

| Ordner / Datei | Zweck |
| --- | --- |
| `dist/` | **Die fertige Website.** Den Inhalt dieses Ordners 1:1 auf den Webspace hochladen (in das Verzeichnis, auf das `foxandpeople.at` zeigt, meist `htdocs/`, `public_html/` oder `www/`). |
| `src/site.html` | Die Ein-Datei-Vorlage, aus der alles gebaut wird. Texte werden hier geändert. |
| `src/images/` | Hero-Bilder als JPEG (Original) und WebP (kleiner, wird bevorzugt geladen). |
| `src/vorschaubild.jpg` | Vorschaubild 1200 × 630 px für WhatsApp, LinkedIn, Facebook. |
| `src/favicon.svg`, `src/apple-touch-icon.png` | Browser-Symbol und Home-Bildschirm-Symbol. |
| `tools/build.py` | Erzeugt aus `src/` den Ordner `dist/` (echte Unterseiten, Sitemap, robots.txt, Google-Jobdaten). |
| `tools/og-card.html` | Vorlage, aus der das Vorschaubild gerendert wurde. |

## Website neu bauen (nach Textänderungen)

```
python3 tools/build.py
```

Braucht nur Python 3, keine weiteren Pakete. Danach `dist/` erneut hochladen.
Auf jeder Unterseite wird beim Bauen automatisch gesetzt: Titel, Beschreibung,
Canonical-Adresse, Vorschau-Angaben, und auf den Jobseiten die strukturierten
Daten für Google for Jobs (`JobPosting`).

## Upload / Hosting – Checkliste

1. Domain `foxandpeople.at` auf den Webspace zeigen lassen.
2. SSL-Zertifikat beim Hoster aktivieren (bei den meisten Anbietern ein Klick, Let's Encrypt).
3. Inhalt von `dist/` hochladen. Wichtig: auch die versteckte Datei `.htaccess`
   (setzt die 404-Seite, Zeichensatz, Caching und Sicherheits-Header; funktioniert auf Apache-Webspace wie World4You, easyname, Hetzner).
4. Nach aktivem SSL: in `dist/.htaccess` die drei Zeilen für die HTTPS-Weiterleitung freischalten (`#` entfernen) und die Datei erneut hochladen.
5. Testen: `https://foxandpeople.at/`, `/jobs/`, `/kontakt/`, eine falsche Adresse (muss die 404-Seite zeigen),
   Vorschau testen mit https://www.opengraph.xyz oder im WhatsApp-Chat.
6. Google Search Console anlegen und `https://foxandpeople.at/sitemap.xml` einreichen.

Kein Apache (z. B. Netlify, Vercel, Cloudflare Pages, nginx): die 404-Seite ist `dist/404.html`
und `dist/404/index.html`; Netlify und Cloudflare Pages erkennen `404.html` automatisch.

## Vor dem Livegang noch zu ergänzen (nur mit Ihren Angaben möglich)

- **Impressum:** Bescheiddatum und zuständige Behörde für beide Gewerbeberechtigungen (Arbeitskräfteüberlassung, Arbeitsvermittlung); AMS-Eintragungsdatum bzw. Registrierungsnummer. Die Stellen sind in `src/site.html` als gelbe Hinweisboxen (`legal-placeholder`) markiert.
- **Telefonnummer:** derzeit nur E-Mail im Impressum und auf der Kontaktseite (Kommentar `TODO Telefon` in `src/site.html`).
- **Schrift und Farben nach Briefkopf:** sobald Briefpapier oder Logo-Dateien vorliegen, können Schriftart und Akzentfarbe angepasst werden. Derzeit bewusst System-Schriften ohne externe Dienste (DSGVO).
- **Jobs aktualisieren:** Datum `Stand: …` auf der Jobseite und in `tools/build.py` die Werte `JOB_DATE_POSTED` / `JOB_VALID_THROUGH` anpassen. Abgelaufene Stellen von der Seite nehmen, sonst meldet Google sie als „abgelaufen“.

## Technik in Kürze

- Reines HTML/CSS/JS, keine Datenbank, kein CMS, keine Cookies, keine externen Dienste, keine Web-Fonts von Drittanbietern.
- Formulare öffnen das E-Mail-Programm (mailto an office@foxandpeople.at) mit den eingegebenen Daten; es wird nichts auf dem Server gespeichert.
- Alte Adressen der Vorschau-Version (`/#/jobs`) werden automatisch auf die neuen Unterseiten umgeleitet.
- Barrierefreiheit: Kontraste nach WCAG AA geprüft, Tastaturbedienung, Skip-Link, reduzierte Bewegung wird respektiert.
