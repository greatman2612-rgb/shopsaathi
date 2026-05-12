"use client";

import { useLocale } from "@/contexts/LocaleContext";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", primary: "navHome" as const, sub: "navSubHome" as const },
  { href: "/billing", primary: "navBilling" as const, sub: "navSubBilling" as const },
  { href: "/udhar", primary: "navUdhar" as const, sub: "navSubUdhar" as const },
  { href: "/inventory", primary: "navInventory" as const, sub: "navSubInventory" as const },
  { href: "/purchase", primary: "navPurchase" as const, sub: "navSubPurchase" as const },
  { href: "/expenses", primary: "navExpenses" as const, sub: "navSubExpenses" as const },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const { locale, t } = useLocale();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 overflow-x-auto px-0.5 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-w-[3.25rem] shrink-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 transition-colors sm:min-w-0 sm:px-1 sm:py-2 ${
                active
                  ? "bg-green-50 text-[#16a34a]"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className="max-w-[4.5rem] truncate text-center text-[10px] font-semibold leading-tight sm:max-w-none sm:text-xs">
                {t(tab.primary)}
              </span>
              {locale === "hi" && t(tab.sub) ? (
                <span
                  className={`truncate text-[10px] leading-tight ${
                    active ? "font-medium text-[#16a34a]" : "font-normal text-zinc-500"
                  }`}
                >
                  {t(tab.sub)}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
