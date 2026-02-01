"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home", emoji: "🏠" },
  { href: "/market", label: "Market", emoji: "🏪" },
  { href: "/wallet", label: "Wallet", emoji: "💰" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="bg-[#0a0e1a]/80 backdrop-blur-xl border-b border-gray-700 px-4 py-2 sticky top-0 z-50">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" className="text-lg font-bold flex items-center gap-2">
          <span className="text-2xl">⛏️</span>
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            SaltDig
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                pathname === item.href
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              {item.emoji} {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
