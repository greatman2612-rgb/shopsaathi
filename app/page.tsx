"use client";

import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const SHOP_ID = "shop001";

const quickActions = [
  { href: "/billing", title: "New Bill", subtitle: "नया बिल", primary: true },
  { href: "/udhar", title: "Add Udhar", subtitle: "उधार जोड़ें", primary: false },
  { href: "/reports", title: "View Reports", subtitle: "रिपोर्ट", primary: false },
] as const;

type BillRow = {
  id: string;
  total: number;
  is_udhar: boolean;
  items: { name?: string; qty?: number; price?: number }[];
  createdAt: Date | null;
};

type InsightRow = { insight: string; icon: string };

function formatRupee(n: number) {
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatItemsSummary(items: BillRow["items"]): string {
  if (!Array.isArray(items) || items.length === 0) return "—";
  return items
    .map((row) => `${String(row.name ?? "Item")} x${Number(row.qty ?? 0)}`)
    .join(", ");
}

function formatBillTime(d: Date | null) {
  if (!d) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapBillRow(data: Record<string, unknown>): BillRow {
  const rawItems = data.items;
  const items: BillRow["items"] = Array.isArray(rawItems)
    ? rawItems.map((it: Record<string, unknown>) => ({
        name: it.name != null ? String(it.name) : undefined,
        qty: it.qty != null ? Number(it.qty) : undefined,
        price: it.price != null ? Number(it.price) : undefined,
      }))
    : [];
  return {
    id: String(data.id ?? ""),
    total: Number(data.total ?? 0),
    is_udhar: Boolean(data.is_udhar),
    items,
    createdAt: toDate(data.created_at),
  };
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [aajKamai, setAajKamai] = useState(0);
  const [kulUdhar, setKulUdhar] = useState(0);
  const [aajBills, setAajBills] = useState(0);
  const [kamStock, setKamStock] = useState(0);
  const [recentBills, setRecentBills] = useState<BillRow[]>([]);
  const [last7Bills, setLast7Bills] = useState<BillRow[]>([]);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const start7 = new Date(todayStart);
      start7.setDate(start7.getDate() - 7);
      const todayIso = todayStart.toISOString();
      const start7Iso = start7.toISOString();

      const [
        todaySalesRes,
        udharRes,
        todayCountRes,
        lowStockRes,
        recentBillsRes,
        last7BillsRes,
      ] = await Promise.all([
        supabase
          .from("bills")
          .select("total")
          .eq("shop_id", SHOP_ID)
          .gte("created_at", todayIso),
        supabase
          .from("customers")
          .select("total_udhar")
          .eq("shop_id", SHOP_ID),
        supabase
          .from("bills")
          .select("id")
          .eq("shop_id", SHOP_ID)
          .gte("created_at", todayIso),
        supabase
          .from("products")
          .select("id")
          .eq("shop_id", SHOP_ID)
          .lt("stock_qty", 5),
        supabase
          .from("bills")
          .select("*")
          .eq("shop_id", SHOP_ID)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("bills")
          .select("*")
          .eq("shop_id", SHOP_ID)
          .gte("created_at", start7Iso),
      ]);

      const todaySalesRows = (todaySalesRes.data ?? []) as Record<string, unknown>[];
      const todayTotal = todaySalesRows.reduce(
        (sum, row) => sum + Number(row.total ?? 0),
        0,
      );
      const todayCount = (todayCountRes.data ?? []).length;
      setAajKamai(Math.round(todayTotal * 100) / 100);
      setAajBills(todayCount);

      const recentRows = (recentBillsRes.data ?? []) as Record<string, unknown>[];
      setRecentBills(recentRows.map(mapBillRow));

      const last7Rows = (last7BillsRes.data ?? []) as Record<string, unknown>[];
      setLast7Bills(last7Rows.map(mapBillRow));

      let udharSum = 0;
      ((udharRes.data ?? []) as Record<string, unknown>[]).forEach((row) => {
        udharSum += Number(row.total_udhar ?? 0);
      });
      setKulUdhar(Math.round(udharSum * 100) / 100);

      setKamStock((lowStockRes.data ?? []).length);
    } catch (e) {
      console.error(e);
      setAajKamai(0);
      setKulUdhar(0);
      setAajBills(0);
      setKamStock(0);
      setRecentBills([]);
      setLast7Bills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (loading) return;
    if (last7Bills.length === 0) {
      setInsights([]);
      setInsightsLoading(false);
      return;
    }

    let cancelled = false;
    setInsightsLoading(true);

    const payload = last7Bills.map((b) => ({
      total: b.total,
      is_udhar: b.is_udhar,
      items: b.items,
      created_at: b.createdAt?.toISOString() ?? null,
    }));

    void (async () => {
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "insight", bills: payload }),
        });
        if (!res.ok) throw new Error("insight failed");
        const data = (await res.json()) as { insights?: InsightRow[] };
        const list = Array.isArray(data.insights) ? data.insights : [];
        const cleaned = list
          .filter(
            (row) =>
              row &&
              typeof row.insight === "string" &&
              row.insight.trim().length > 0,
          )
          .map((row) => ({
            insight: row.insight.trim(),
            icon: typeof row.icon === "string" && row.icon.trim() ? row.icon.trim() : "✨",
          }))
          .slice(0, 3);
        if (!cancelled) setInsights(cleaned);
      } catch {
        if (!cancelled) setInsights([]);
      } finally {
        if (!cancelled) setInsightsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, last7Bills]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <p className="text-3xl font-extrabold tracking-tight text-[#16a34a]">
            ShopSaathi
          </p>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            दुकान का साथी
          </p>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Namaste 👋
          </h1>
          <p className="mt-1 text-base text-zinc-600">
            Welcome — आपकी दुकान, आसान प्रबंधन
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Today overview">
        {loading ? (
          <>
            {[0, 1, 2, 3].map((i) => (
              <article
                key={i}
                className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
              >
                <div className="h-4 w-28 animate-pulse rounded bg-zinc-200" />
                <div className="mt-3 h-8 w-24 animate-pulse rounded bg-zinc-200" />
                <div className="mt-2 h-3 w-20 animate-pulse rounded bg-zinc-100" />
              </article>
            ))}
          </>
        ) : (
          <>
            <article className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <p className="text-sm font-medium text-zinc-500">Aaj ki Kamai</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900">
                {formatRupee(aajKamai)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">आज की बिक्री (bills)</p>
            </article>
            <article className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <p className="text-sm font-medium text-zinc-500">Kul Udhar</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900">
                {formatRupee(kulUdhar)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">बकाया जोड़</p>
            </article>
            <article className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <p className="text-sm font-medium text-zinc-500">Aaj ke Bills</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[#16a34a]">
                {aajBills}
              </p>
              <p className="mt-1 text-xs text-zinc-400">आज के बिल</p>
            </article>
            <article className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-4 shadow-sm ring-1 ring-orange-100/80">
              <p className="text-sm font-semibold text-orange-800/90">
                Kam Stock
              </p>
              <p className="mt-2 text-xl font-bold leading-snug text-red-600 sm:text-2xl">
                <span className="text-orange-800/90">Kam Stock:</span>{" "}
                <span className="tabular-nums text-red-600">{kamStock}</span>{" "}
                <span className="text-base font-semibold text-orange-800">
                  items
                </span>
              </p>
              <p className="mt-1 text-xs font-medium text-orange-800/80">
                stock &lt; 5
              </p>
            </article>
          </>
        )}
      </section>

      <section aria-label="Recent bills">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Haal ke Bills / हाल के बिल
        </h2>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
              >
                <div className="h-4 max-w-[12rem] w-[75%] animate-pulse rounded bg-zinc-200" />
                <div className="mt-2 h-3 w-full animate-pulse rounded bg-zinc-100" />
                <div className="mt-3 flex justify-between gap-2">
                  <div className="h-6 w-16 animate-pulse rounded bg-zinc-200" />
                  <div className="h-6 w-14 animate-pulse rounded bg-zinc-200" />
                </div>
              </div>
            ))}
          </div>
        ) : recentBills.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
            Abhi koi bill nahi — pehla bill banayein
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentBills.map((b) => (
              <li
                key={b.id}
                className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-zinc-700">
                    {formatItemsSummary(b.items)}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      b.is_udhar
                        ? "bg-orange-50 text-orange-700 ring-1 ring-orange-100"
                        : "bg-green-50 text-[#16a34a] ring-1 ring-green-100"
                    }`}
                  >
                    {b.is_udhar ? "Udhar" : "Cash"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-extrabold tabular-nums text-zinc-900">
                    {formatRupee(b.total)}
                  </p>
                  <p className="text-xs font-medium text-zinc-400">
                    {formatBillTime(b.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Quick actions / जल्दी के काम
        </h2>
        <div className="flex flex-col gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`flex items-center justify-between rounded-2xl border px-4 py-4 shadow-sm transition active:scale-[0.99] ${
                action.primary
                  ? "border-transparent bg-[#16a34a] text-white shadow-sm"
                  : "border-zinc-100 bg-white text-zinc-900 ring-1 ring-zinc-100"
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-base font-semibold">{action.title}</span>
                <span
                  className={`text-sm ${
                    action.primary ? "text-green-50" : "text-zinc-500"
                  }`}
                >
                  {action.subtitle}
                </span>
              </div>
              <span
                className={`text-lg ${
                  action.primary ? "text-green-100" : "text-[#16a34a]"
                }`}
                aria-hidden
              >
                →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {!loading && last7Bills.length > 0 ? (
        <section aria-label="AI insights">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Insights ✨
          </h2>
          {insightsLoading ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
                >
                  <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-200" />
                  <div className="mt-3 h-4 w-full animate-pulse rounded bg-zinc-200" />
                  <div className="mt-2 h-4 w-[85%] animate-pulse rounded bg-zinc-100" />
                </div>
              ))}
            </div>
          ) : insights.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {insights.map((row, idx) => (
                <article
                  key={`${idx}-${row.insight.slice(0, 24)}`}
                  className="rounded-2xl border border-green-100 bg-green-50/50 p-4 shadow-sm ring-1 ring-green-100/80"
                >
                  <p className="text-2xl" aria-hidden>
                    {row.icon}
                  </p>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-800">
                    {row.insight}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
