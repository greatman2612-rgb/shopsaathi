"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", labelEn: "Home", labelHi: "घर" },
  { href: "/billing", labelEn: "Billing", labelHi: "बिलिंग" },
  { href: "/udhar", labelEn: "Udhar", labelHi: "उधार" },
  { href: "/inventory", labelEn: "Inventory", labelHi: "स्टॉक" },
  { href: "/more", labelEn: "More", labelHi: "और" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {tabs.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-2 transition-colors ${
                active
                  ? "bg-green-50 text-[#16a34a]"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className="truncate text-xs font-semibold leading-tight">
                {tab.labelEn}
              </span>
              <span
                className={`truncate text-[10px] leading-tight ${
                  active ? "font-medium text-[#16a34a]" : "font-normal text-zinc-500"
                }`}
              >
                {tab.labelHi}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
