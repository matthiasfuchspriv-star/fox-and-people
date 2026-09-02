import type { NextConfig } from "next";

/**
 * Sicherheits-Kopfzeilen gehören in die Anwendung, nicht nur in den Webserver davor – sonst fehlen sie,
 * sobald jemand die Anwendung ohne Caddy betreibt oder dessen Konfiguration ändert.
 */
const sicherheitsKopfzeilen = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), payment=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Keine fremden Skripte, keine eingebetteten Fremdseiten. 'unsafe-inline' ist für die Stile und die
  // wenigen Inline-Skripte von Next.js nötig; alles Externe bleibt gesperrt.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      // Die Hausschriften kommen von Google Fonts – ohne diese beiden Zeilen blockiert die eigene
      // Sicherheitsregel das Stylesheet, und die ganze Software rendert in einer Ersatzschrift.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "@node-rs/argon2", "exceljs", "@prisma/client", "@prisma/adapter-pg", "pg"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  async headers() {
    return [{ source: "/:path*", headers: sicherheitsKopfzeilen }];
  },
};

export default nextConfig;
