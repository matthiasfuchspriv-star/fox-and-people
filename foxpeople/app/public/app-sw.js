// Service Worker der Mitarbeiter-App: App-Shell cachen, Seiten netzwerk-zuerst (Daten müssen aktuell sein),
// Offline-Hinweis und Push-Benachrichtigungen (Stunden bestätigt, Chat-Antwort, Urlaub, Lohnzettel, Erinnerungen).
const CACHE = "fp-app-v3";
// Nur unpersönliche Dateien werden gecacht (Manifest, Icons). Seiten wie /app/lohn, /app/chat oder
// /app/profil enthalten personenbezogene Daten – auf einem weitergegebenen Handy wären sie sonst
// offline weiter lesbar, und beim Abmelden blieben sie im Gerätespeicher liegen.
const CACHEBAR = ["/app-manifest.json", "/app-icon-192.png", "/app-icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/app-manifest.json", "/app-icon-192.png"]).catch(() => undefined))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
const OFFLINE = () => new Response("<html lang='de'><body style='font-family:sans-serif;padding:24px'><h2>Offline</h2><p>Keine Verbindung – bitte später erneut versuchen. Im Notfall: +43 676 4574096</p></body></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Abmelden: erst den Cache leeren, dann normal weiterleiten
  if (url.pathname === "/app/logout") {
    e.respondWith(caches.delete(CACHE).then(() => fetch(e.request)).catch(() => fetch(e.request)));
    return;
  }
  if (!url.pathname.startsWith("/app")) return;
  if (CACHEBAR.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })));
    return;
  }
  e.respondWith(fetch(e.request).catch(() => OFFLINE()));
});

self.addEventListener("push", (e) => {
  let d = { titel: "Fox & People", text: "Es gibt etwas Neues in deiner App.", url: "/app" };
  try { if (e.data) d = { ...d, ...e.data.json() }; } catch { if (e.data) d.text = e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.titel, {
    body: d.text,
    icon: "/app-icon-192.png",
    badge: "/app-icon-192.png",
    data: { url: d.url },
    tag: d.anlass || "fp",
    renotify: true,
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const ziel = (e.notification.data && e.notification.data.url) || "/app";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if (c.url.includes("/app") && "focus" in c) { c.navigate(ziel); return c.focus(); }
    return self.clients.openWindow(ziel);
  }));
});
