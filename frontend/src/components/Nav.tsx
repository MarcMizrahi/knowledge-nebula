"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Knowledge" },
  { href: "/upload", label: "Upload" },
  { href: "/search", label: "Search" },
  { href: "/chat", label: "Chat" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-white/5 glass sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-6xl flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">🌌</span>
          <span className="font-semibold gradient-text text-lg">Knowledge Nebula</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                pathname === l.href
                  ? "bg-violet-500/20 text-violet-300"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
