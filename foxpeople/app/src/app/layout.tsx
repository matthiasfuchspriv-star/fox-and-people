import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Fox & People", template: "%s · Fox & People" },
  description: "Verwaltungssoftware für Arbeitskräfteüberlassung & Personalvermittlung",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-AT">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Nur die Wortmarke nutzt Instrument Sans – die Oberfläche läuft in der Systemschrift des Geräts */}
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
