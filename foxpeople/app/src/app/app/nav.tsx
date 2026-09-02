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
    <nav className="fixed bottom-0 inset-x-0 max-w-lg mx-auto bg-surface border-t border-line flex justify-around px-1 py-1.5 z-20" style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}>
      {sichtbar.map((it) => { const active = it.href === "/app" ? path === "/app" : path.startsWith(it.href); return (
        <Link key={it.href} href={it.href} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-md text-[11px] font-semibold ${active ? "text-fox" : "text-muted"}`}>
          <it.icon size={21} strokeWidth={active ? 2.4 : 1.9} />{labels?.[it.key] ?? it.key.split(".")[1]}
        </Link>); })}
    </nav>
  );
}
