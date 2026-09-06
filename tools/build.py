#!/usr/bin/env python3
"""Baut aus der Ein-Datei-Version (src/site.html) die Upload-fertige Website (dist/).

Aufruf:  python3 tools/build.py
Ergebnis: dist/  – dieser Ordner wird 1:1 auf den Webspace hochgeladen.
"""
import html as htmlmod
import json
import os
import re
import shutil
import struct
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "site.html")
IMG_SRC = os.path.join(ROOT, "src", "images")
DIST = os.path.join(ROOT, "dist")

DOMAIN = "https://foxandpeople.at"
TODAY = date.today().isoformat()
JOB_DATE_POSTED = "2026-09-01"
JOB_VALID_THROUGH = "2026-12-31"   # Bei Aktualisierung der Jobs anpassen

DESCRIPTIONS = {
    "home": "Fox & People: Zeitarbeit und Personalvermittlung in Niederösterreich und Wien. Persönlicher Personaldienstleister für Gewerbe & Industrie, Kaufmännisch & Office sowie Fach- & Führungskräfte.",
    "unternehmen": "Zeitarbeit und Personalvermittlung für Unternehmen in Niederösterreich und Wien: Suche, Vorauswahl und Begleitung mit einer festen Ansprechperson, die Ihren Betrieb kennt.",
    "bewerber": "Jobs in Niederösterreich und Wien mit persönlicher Betreuung: kein anonymes Bewerbungsportal, sondern eine feste Ansprechperson, die sich Zeit für Sie nimmt.",
    "jobs": "Aktuelle Jobs in Niederösterreich und Wien: Produktion, Lager, Logistik, Office und Führungspositionen. Nach Segment, Ort und Anstellungsart filtern.",
    "segmente": "Drei Bereiche, in denen wir uns wirklich auskennen: Gewerbe & Industrie, Kaufmännisch & Office sowie Fach- & Führungskräfte – bei Überlassung wie bei Vermittlung.",
    "segmente/gewerbe-industrie": "Personaldienstleister für Gewerbe & Industrie in Niederösterreich und Wien: kurzfristige Überlassung bei Auftragsspitzen und Vermittlung in Festanstellung.",
    "segmente/kaufmaennisch-office": "Kaufmännisches Personal für Niederösterreich und Wien: von der Assistenz bis zur Buchhaltung, als befristete Vertretung oder dauerhafte Verstärkung.",
    "segmente/fach-fuehrungskraefte": "Fach- und Führungskräfte für Schlüsselpositionen in Niederösterreich und Wien: diskret, mit echtem Netzwerk in der Region.",
    "ueber-uns": "Fox & People ist eine Geschäftsbezeichnung der Blackburn Beteiligungs GmbH. Dahinter steht langjährige Praxis in der Arbeitskräfteüberlassung und eine abgelegte Meisterprüfung.",
    "kontakt": "Kontakt zu Fox & People: Unternehmen erhalten innerhalb eines Werktags eine Rückmeldung, Bewerbern antworten wir genauso persönlich – auch ohne passende Stelle.",
    "impressum": "Impressum der Blackburn Beteiligungs GmbH (Fox & People): Firmenbuch, UID, Gewerbeberechtigungen, Aufsicht und Kontakt.",
    "datenschutz": "Datenschutzerklärung von Fox & People: Welche Daten wir bei Anfragen und Bewerbungen verarbeiten, zu welchem Zweck und wie lange.",
    "404": "Diese Seite gibt es nicht.",
}

HERO_IMAGES = ["hero-home", "hero-unternehmen", "hero-bewerber", "hero-ueber-uns"]  # Reihenfolge im Quelltext


def die(msg):
    print("FEHLER:", msg, file=sys.stderr)
    sys.exit(1)


def jpeg_size(path):
    with open(path, "rb") as f:
        data = f.read()
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        seg_len = struct.unpack(">H", data[i + 2:i + 4])[0]
        i += 2 + seg_len
    die("JPEG-Größe nicht lesbar: " + path)


def read_src():
    with open(SRC, encoding="utf-8") as f:
        return f.read()


def between(text, start, end, start_at=0):
    a = text.index(start, start_at)
    b = text.index(end, a + len(start))
    return text[a + len(start):b], a, b


def rewrite_links(fragment):
    def repl(m):
        target = m.group(1)
        if target == "":
            return 'href="/"'
        if target == "kontakt/unternehmen":
            return 'href="/kontakt/#kontakt-unternehmen"'
        if target == "kontakt/bewerber":
            return 'href="/kontakt/#kontakt-bewerber"'
        return 'href="/%s/"' % target
    fragment = re.sub(r'href="#/([^"]*)"', repl, fragment)
    fragment = fragment.replace(" data-link", "")
    return fragment


def strip_tags(s):
    return htmlmod.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def main():
    src = read_src()

    # ---------- CSS ----------
    css, _, _ = between(src, "<style>", "</style>")
    css = css.strip("\n")
    css = css.replace("  [data-page] { display: block; }\n  [data-page][hidden] { display: none; }\n", "")
    css = re.sub(r"^  ", "", css, flags=re.M)

    # ---------- JS ----------
    js, _, _ = between(src, "<script>", "</script>")
    titles_block, ta, tb = between(js, "    var TITLES = {", "    };\n")
    js = js[:ta] + js[tb + len("    };\n"):]
    # Hash-Router durch statische Navigation ersetzen
    ra = js.index("    var pages = document.querySelectorAll('[data-page]');")
    rb = js.index("    // Skip-Link:")
    static_nav = """    // Alte Hash-Adressen (#/jobs) auf echte Unterseiten umleiten
    if (location.hash.indexOf('#/') === 0) {
      var old = location.hash.slice(2).replace(/\\/+$/, '');
      var target = old === '' ? '/' : '/' + old + '/';
      if (old === 'kontakt/unternehmen') target = '/kontakt/#kontakt-unternehmen';
      if (old === 'kontakt/bewerber') target = '/kontakt/#kontakt-bewerber';
      location.replace(target);
    }

    var mobileNav = document.getElementById('mobileNav');
    var burger = document.getElementById('burgerBtn');

    function closeMobileNav() {
      mobileNav.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    }

    // Aktiven Menüpunkt anhand des Pfads markieren
    var top = location.pathname.replace(/^\\/+|\\/+$/g, '').split('/')[0];
    document.querySelectorAll('[data-route]').forEach(function (a) {
      a.classList.toggle('active', a.dataset.route === top);
    });

"""
    js = js[:ra] + static_nav + js[rb:]
    js = js.replace("    // Sprache setzen (fuer Screenreader und korrekte Silbentrennung)\n    document.documentElement.lang = 'de-AT';\n\n", "")
    js = re.sub(r"^  ", "", js.strip("\n"), flags=re.M)
    if "[data-page]" in js or "hashchange" in js:
        die("Router nicht vollständig entfernt")

    # ---------- Kopf/Fuß ----------
    chrome_start = src.index('<a class="skip-link"')
    chrome_end = src.index('<!-- ============================================================ HOME -->')
    chrome = rewrite_links(src[chrome_start:chrome_end].rstrip() + "\n")
    footer, _, _ = between(src, "<footer class=\"site\">", "</footer>")
    footer = rewrite_links("<footer class=\"site\">" + footer + "</footer>")
    icon_href, _, _ = between(src, '<link rel="icon" href="', '">')

    # ---------- Seiten ----------
    pages = []
    for m in re.finditer(r'<main data-page="([^"]+)"( hidden)?>(.*?)</main>', src, flags=re.S):
        pages.append((m.group(1), m.group(3)))
    slugs = [p[0] for p in pages]
    if len(pages) < 20:
        die("Zu wenige Seiten gefunden: %d" % len(pages))

    # ---------- Bilder ----------
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(os.path.join(DIST, "images"))
    os.makedirs(os.path.join(DIST, "assets"))
    sizes = {}
    for name in HERO_IMAGES:
        for ext in ("jpg", "webp"):
            p = os.path.join(IMG_SRC, name + "." + ext)
            if not os.path.exists(p):
                die("Bild fehlt: " + p)
            shutil.copy(p, os.path.join(DIST, "images"))
        sizes[name] = jpeg_size(os.path.join(IMG_SRC, name + ".jpg"))
    for extra in ("vorschaubild.jpg", "favicon.svg", "apple-touch-icon.png"):
        p = os.path.join(ROOT, "src", extra)
        if os.path.exists(p):
            shutil.copy(p, DIST)

    hero_counter = [0]

    def replace_hero(m):
        idx = hero_counter[0]
        hero_counter[0] += 1
        name = HERO_IMAGES[idx]
        w, h = sizes[name]
        return ('<picture>'
                '<source srcset="/images/%s.webp" type="image/webp">'
                '<img class="hero-bg-img" src="/images/%s.jpg" width="%d" height="%d" alt="" aria-hidden="true" fetchpriority="high" decoding="async">'
                '</picture>') % (name, name, w, h)

    # ---------- Job-Daten für Google (JobPosting) ----------
    def job_ld(slug, body):
        title = strip_tags(re.search(r"<h1[^>]*>(.*?)</h1>", body, re.S).group(1))
        ort = strip_tags(re.search(r"Arbeitsort</span>(.*?)</div>", body, re.S).group(1))
        art = strip_tags(re.search(r"Beschäftigungsausmaß</span>(.*?)</div>", body, re.S).group(1))
        intro = strip_tags(re.search(r'<div class="job-body[^"]*">\s*<p>(.*?)</p>', body, re.S).group(1))
        job_body = re.search(r'<div class="job-body[^"]*">(.*?)</div>\s*<div class="job-pay', body, re.S).group(1)
        job_body = re.sub(r"\s+", " ", job_body).strip()
        pay = strip_tags(re.search(r'<div class="job-pay[^"]*">.*?<p>(.*?)</p>', body, re.S).group(1))
        num = re.search(r"€\s*([\d.]+)(?:,(\d+))?", pay)
        value = float(num.group(1).replace(".", "") + "." + (num.group(2) or "0"))
        unit = "YEAR" if "Jahr" in pay else "HOUR"
        locations = []
        for o in [x.strip() for x in ort.split(",")]:
            locality = o.replace("Bezirk ", "")
            locations.append({
                "@type": "Place",
                "address": {"@type": "PostalAddress", "addressLocality": locality,
                            "addressRegion": "Niederösterreich", "addressCountry": "AT"},
            })
        salary_value = {"@type": "QuantitativeValue", "unitText": unit}
        if pay.strip().lower().startswith("ab"):
            salary_value["minValue"] = value
        else:
            salary_value["value"] = value
        ld = {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": title,
            "description": job_body,
            "identifier": {"@type": "PropertyValue", "name": "Fox & People", "value": slug.split("/")[1]},
            "datePosted": JOB_DATE_POSTED,
            "validThrough": JOB_VALID_THROUGH + "T23:59:59+01:00",
            "employmentType": "FULL_TIME" if art == "Vollzeit" else "PART_TIME",
            "hiringOrganization": {"@type": "Organization", "name": "Fox & People (Blackburn Beteiligungs GmbH)",
                                    "sameAs": DOMAIN + "/", "email": "office@foxandpeople.at"},
            "jobLocation": locations if len(locations) > 1 else locations[0],
            "baseSalary": {"@type": "MonetaryAmount", "currency": "EUR", "value": salary_value},
            "directApply": False,
            "url": DOMAIN + "/" + slug + "/",
        }
        desc = "%s in %s: %s Entlohnung: %s. Jetzt bei Fox & People bewerben." % (title, ort, intro, pay)
        return ld, desc

    org_ld = {
        "@context": "https://schema.org",
        "@type": "EmploymentAgency",
        "name": "Fox & People",
        "legalName": "Blackburn Beteiligungs GmbH",
        "url": DOMAIN + "/",
        "image": DOMAIN + "/vorschaubild.jpg",
        "email": "office@foxandpeople.at",
        "vatID": "ATU81895246",
        "address": {"@type": "PostalAddress", "streetAddress": "Kettenreith 52", "postalCode": "3233",
                    "addressLocality": "Kilb", "addressRegion": "Niederösterreich", "addressCountry": "AT"},
        "areaServed": [{"@type": "State", "name": "Niederösterreich"}, {"@type": "City", "name": "Wien"}],
        "founder": {"@type": "Person", "name": "Matthias Fuchs"},
    }

    # ---------- HTML-Vorlage ----------
    titles = {}
    for m in re.finditer(r"'([^']+)':\s*'([^']*)'", titles_block):
        titles[m.group(1)] = m.group(2)

    def page_html(slug, body):
        title = titles.get(slug, "Fox & People")
        desc = DESCRIPTIONS.get(slug)
        ld = None
        if slug.startswith("jobs/"):
            ld, desc = job_ld(slug, body)
        elif slug == "home":
            ld = org_ld
        if not desc:
            die("Keine Beschreibung für " + slug)
        path = "/" if slug == "home" else "/%s/" % slug
        canonical = DOMAIN + path
        body = rewrite_links(body)
        body = re.sub(r'<img class="hero-bg-img" src="data:image/jpeg;base64,[^"]+" alt="" aria-hidden="true">', replace_hero, body)
        if "data:image/jpeg" in body:
            die("Eingebettetes Bild nicht ersetzt in " + slug)
        robots = '<meta name="robots" content="noindex">\n' if slug == "404" else ""
        ld_html = ""
        if ld:
            ld_html = '<script type="application/ld+json">%s</script>\n' % json.dumps(ld, ensure_ascii=False)
        e = htmlmod.escape
        head = f"""<!DOCTYPE html>
<html lang="de-AT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
{robots}<link rel="canonical" href="{canonical}">
<meta name="theme-color" content="#17262A">
<meta name="author" content="Blackburn Beteiligungs GmbH">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_AT">
<meta property="og:site_name" content="Fox &amp; People">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{DOMAIN}/vorschaubild.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{DOMAIN}/vorschaubild.jpg">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/styles.css">
<noscript><style>.reveal{{opacity:1;transform:none}}</style></noscript>
{ld_html}</head>
<body>
"""
        main = '<main data-page="%s">%s</main>\n' % (slug, body)
        return head + chrome + "\n" + main + "\n" + footer + '\n<script src="/assets/site.js" defer></script>\n</body>\n</html>\n'

    # ---------- Schreiben ----------
    with open(os.path.join(DIST, "assets", "styles.css"), "w", encoding="utf-8") as f:
        f.write(css + "\n")
    with open(os.path.join(DIST, "assets", "site.js"), "w", encoding="utf-8") as f:
        f.write(js + "\n")

    urls = []
    for slug, body in pages:
        out = page_html(slug, body)
        if slug == "home":
            targets = [os.path.join(DIST, "index.html")]
            urls.append(DOMAIN + "/")
        elif slug == "404":
            targets = [os.path.join(DIST, "404.html"), os.path.join(DIST, "404", "index.html")]
        else:
            targets = [os.path.join(DIST, slug, "index.html")]
            urls.append(DOMAIN + "/" + slug + "/")
        for t in targets:
            os.makedirs(os.path.dirname(t), exist_ok=True)
            with open(t, "w", encoding="utf-8") as f:
                f.write(out)

    if hero_counter[0] != len(HERO_IMAGES):
        die("Erwartet %d Hero-Bilder, gefunden %d" % (len(HERO_IMAGES), hero_counter[0]))

    with open(os.path.join(DIST, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for u in urls:
            prio = "1.0" if u.endswith(".at/") else ("0.8" if "/jobs/" in u else "0.6")
            if u.endswith(("/impressum/", "/datenschutz/")):
                prio = "0.2"
            f.write("  <url><loc>%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>\n" % (u, TODAY, prio))
        f.write("</urlset>\n")

    with open(os.path.join(DIST, "robots.txt"), "w", encoding="utf-8") as f:
        f.write("User-agent: *\nAllow: /\nDisallow: /404.html\nDisallow: /404/\n\nSitemap: %s/sitemap.xml\n" % DOMAIN)

    with open(os.path.join(DIST, ".htaccess"), "w", encoding="utf-8") as f:
        f.write("""# Fox & People – Server-Einstellungen für Apache-Webspace (z. B. World4You, easyname, Hetzner)
AddDefaultCharset UTF-8
Options -Indexes
ErrorDocument 404 /404.html

# Nach Aktivierung des SSL-Zertifikats beim Hoster: die drei Zeilen unten freischalten (# entfernen)
# RewriteEngine On
# RewriteCond %{HTTPS} !=on
# RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/webp "access plus 30 days"
  ExpiresByType image/jpeg "access plus 30 days"
  ExpiresByType image/png "access plus 30 days"
  ExpiresByType image/svg+xml "access plus 30 days"
  ExpiresByType text/css "access plus 7 days"
  ExpiresByType application/javascript "access plus 7 days"
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
</IfModule>
""")

    print("Fertig: %d Seiten, %d URLs in sitemap.xml -> %s" % (len(pages), len(urls), DIST))


if __name__ == "__main__":
    main()
