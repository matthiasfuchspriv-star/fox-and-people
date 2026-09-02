"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clock, Wallet, MessageCircle, User } from "lucide-react";

const items = [
  { href: "/app", key: "nav.start", icon: Home },
  { href: "/app/stunden", key: "nav.stunden", icon: Clock },
  { href: "/app/lohn", key: "nav.lohn", icon: Wallet },
  { href: "/app/chat", key: "nav.chat", icon: MessageCircle },
  { href: "/app/profil", key: "nav.profil", icon: User },
] as const;

export function AppNav({ labels, stunden = false }: { labels?: Record<string, string>; stunden?: boolean }) {
  const path = usePathname();
  if (path.startsWith("/app/login")) return null;
  // Der Stundenzettel erscheint nur, wenn er für einen laufenden Einsatz freigeschaltet ist
  const sichtbar = items.filter((it) => stunden || it.href !== "/app/stunden");
  return (
    <nav className="app-tabbar fixed bottom-0 inset-x-0 max-w-lg mx-auto flex justify-around px-1 pt-1.5 z-20" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
      {sichtbar.map((it) => { const active = it.href === "/app" ? path === "/app" : path.startsWith(it.href); return (
        <Link key={it.href} href={it.href} className={`app-tab ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
          <it.icon size={23} strokeWidth={active ? 2.3 : 1.7} />{labels?.[it.key] ?? it.key.split(".")[1]}
        </Link>); })}
    </nav>
  );
}
