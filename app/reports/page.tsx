"use client";

import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

const SHOP_ID = "shop001";

type Period = "today" | "week" | "month";

type PayType = "cash" | "udhar";

type BillItem = { name?: string; qty?: number; price?: number };

type RawBill = {
  id: string;
  total: number;
  is_udhar: boolean;
  items: BillItem[];
  createdAt: Date | null;
  customerId?: string;
  customerName?: string;
};

type BillRow = {
  id: string;
  customer: string;
  itemsSummary: string;
  total: number;
  payType: PayType;
  timeLabel: string;
};

type BestRow = {
  name: string;
  units: number;
  revenue: number;
};

type UdharTop = { name: string; amount: number };

const TABS: { id: Period; label: string; labelHi: string }[] = [
  { id: "today", label: "Aaj", labelHi: "आज" },
  { id: "week", label: "Is Hafte", labelHi: "इस हफ़्ते" },
  { id: "month", label: "Is Mahine", labelHi: "इस महीने" },
];

function formatRupee(n: number) {
  return `₹${n.toLocaleString("en-IN", {
    maximumFractionDigits: n % 1 ? 2 : 0,
  })}`;
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

function periodRange(period: Period, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "today") {
    // start = today 00:00
  } else if (period === "week") {
    start.setDate(start.getDate() - 6);
  } else {
    start.setDate(start.getDate() - 29);
  }
  return { start, end };
}

function inRange(d: Date | null, start: Date, end: Date) {
  if (!d) return false;
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function formatItemsSummary(items: BillItem[]): string {
  if (!Array.isArray(items) || items.length === 0) return "—";
  return items
    .map((row) => `${String(row.name ?? "Item")} x${Number(row.qty ?? 0)}`)
    .join(", ");
}

function relativeTimeHindi(d: Date, now: Date) {
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return "Abhi";
  if (mins < 60) return `${mins} min pehle`;
  if (hours < 24) return `${hours} ghante pehle`;
  if (days === 1) return "1 din pehle";
  return `${days} din pehle`;
}

function mapBillRow(data: Record<string, unknown>): RawBill {
  const rawItems = data.items;
  const items: BillItem[] = Array.isArray(rawItems)
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
    customerId:
      data.customer_id != null ? String(data.customer_id) : undefined,
    customerName:
      data.customer_name != null ? String(data.customer_name).trim() : undefined,
  };
}

function parseTxDate(
  data: Record<string, unknown>,
  refYear: number,
): Date | null {
  const ts = toDate(data.created_at);
  if (ts) return ts;
  const dayStr = String(data.date ?? "").trim();
  if (!dayStr) return null;
  const parsed = new Date(`${dayStr} ${refYear}`);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const parsedPrev = new Date(`${dayStr} ${refYear - 1}`);
  if (!Number.isNaN(parsedPrev.getTime())) return parsedPrev;
  return null;
}

function BestBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
      <div
        className="h-full rounded-full bg-[#16a34a]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>("today");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalBills: 0,
    totalUdharDiya: 0,
    cashReceived: 0,
  });
  const [bestSelling, setBestSelling] = useState<BestRow[]>([]);
  const [recentBills, setRecentBills] = useState<BillRow[]>([]);
  const [udharPending, setUdharPending] = useState(0);
  const [udharRecovered, setUdharRecovered] = useState(0);
  const [topUdhar, setTopUdhar] = useState<UdharTop[]>([]);

  const loadReports = useCallback(async (p: Period) => {
    setLoading(true);
    const now = new Date();
    const { start, end } = periodRange(p, now);

    try {
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const [billsRes, customersRes, txRes, recentRes] = await Promise.all([
        supabase
          .from("bills")
          .select("*")
          .eq("shop_id", SHOP_ID)
          .gte("created_at", startIso)
          .lte("created_at", endIso),
        supabase.from("customers").select("*").eq("shop_id", SHOP_ID),
        supabase
          .from("udhar_transactions")
          .select("*")
          .eq("shop_id", SHOP_ID)
          .gte("created_at", startIso),
        supabase
          .from("bills")
          .select("*")
          .eq("shop_id", SHOP_ID)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const periodBills = ((billsRes.data ?? []) as Record<string, unknown>[]).map(
        mapBillRow,
      );

      let totalSales = 0;
      let totalUdharDiya = 0;
      let cashReceived = 0;
      for (const b of periodBills) {
        totalSales += b.total;
        if (b.is_udhar) totalUdharDiya += b.total;
        else cashReceived += b.total;
      }
      setSummary({
        totalSales: Math.round(totalSales * 100) / 100,
        totalBills: periodBills.length,
        totalUdharDiya: Math.round(totalUdharDiya * 100) / 100,
        cashReceived: Math.round(cashReceived * 100) / 100,
      });

      const agg = new Map<string, { units: number; revenue: number }>();
      for (const b of periodBills) {
        for (const it of b.items) {
          const name = String(it.name ?? "Item").trim() || "Item";
          const qty = Math.max(0, Number(it.qty ?? 0));
          const price = Math.max(0, Number(it.price ?? 0));
          const cur = agg.get(name) ?? { units: 0, revenue: 0 };
          cur.units += qty;
          cur.revenue += qty * price;
          agg.set(name, cur);
        }
      }
      const best = [...agg.entries()]
        .map(([name, v]) => ({
          name,
          units: v.units,
          revenue: Math.round(v.revenue * 100) / 100,
        }))
        .sort((a, b) => b.units - a.units)
        .slice(0, 3);
      setBestSelling(best);

      const customerById = new Map<string, string>();
      ((customersRes.data ?? []) as Record<string, unknown>[]).forEach((data) => {
        customerById.set(
          String(data.id ?? ""),
          String(data.name ?? "").trim() || "Customer",
        );
      });

      const recentRows = (recentRes.data ?? []) as Record<string, unknown>[];
      const recent = recentRows.map(mapBillRow).map((b) => {
        const payType: PayType = b.is_udhar ? "udhar" : "cash";
        let customer = "Walk-in Customer";
        if (b.is_udhar) {
          if (b.customerName) customer = b.customerName;
          else if (b.customerId && customerById.has(b.customerId))
            customer = customerById.get(b.customerId)!;
          else customer = "Udhar Customer";
        }
        return {
          id: b.id,
          customer,
          itemsSummary: formatItemsSummary(b.items),
          total: b.total,
          payType,
          timeLabel: b.createdAt
            ? relativeTimeHindi(b.createdAt, now)
            : "—",
        };
      });
      setRecentBills(recent);

      let pending = 0;
      const tops: UdharTop[] = [];
      ((customersRes.data ?? []) as Record<string, unknown>[]).forEach((data) => {
        const amt = Number(data.total_udhar ?? 0);
        pending += amt;
        const name = String(data.name ?? "").trim() || "Customer";
        tops.push({ name, amount: amt });
      });
      tops.sort((a, b) => b.amount - a.amount);
      setUdharPending(Math.round(pending * 100) / 100);
      setTopUdhar(tops.slice(0, 2));

      const refYear = end.getFullYear();
      let recovered = 0;
      ((txRes.data ?? []) as Record<string, unknown>[]).forEach((data) => {
        const delta = Number(data.delta ?? 0);
        if (delta >= 0) return;
        const txDate = parseTxDate(data, refYear);
        if (!txDate || !inRange(txDate, start, end)) return;
        const pay = Number(data.amount ?? -delta);
        if (Number.isFinite(pay) && pay > 0) recovered += pay;
      });
      setUdharRecovered(Math.round(recovered * 100) / 100);
    } catch (e) {
      console.error(e);
      setSummary({
        totalSales: 0,
        totalBills: 0,
        totalUdharDiya: 0,
        cashReceived: 0,
      });
      setBestSelling([]);
      setRecentBills([]);
      setUdharPending(0);
      setUdharRecovered(0);
      setTopUdhar([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports(period);
  }, [period, loadReports]);

  const maxRevenue = useMemo(
    () =>
      bestSelling.reduce((m, b) => (b.revenue > m ? b.revenue : m), 0),
    [bestSelling],
  );

  const periodLabel =
    period === "today"
      ? "Aaj"
      : period === "week"
        ? "Is Hafte"
        : "Is Mahine";

  const shareWhatsApp = () => {
    const bestLines = bestSelling
      .map(
        (b, i) =>
          `${i + 1}) ${b.name}: ${b.units} units, ${formatRupee(b.revenue)}`,
      )
      .join("\n");
    const billsLines = recentBills
      .map(
        (r) =>
          `• ${r.customer} — ${r.itemsSummary} — ${formatRupee(r.total)} (${r.payType})`,
      )
      .join("\n");
    const udharTopLines = topUdhar
      .map((c) => `• ${c.name}: ${formatRupee(c.amount)}`)
      .join("\n");

    const text = [
      `ShopSaathi — Report (${periodLabel})`,
      "",
      `Total Sales: ${formatRupee(summary.totalSales)}`,
      `Total Bills: ${summary.totalBills}`,
      `Udhar Diya: ${formatRupee(summary.totalUdharDiya)}`,
      `Cash Received: ${formatRupee(summary.cashReceived)}`,
      "",
      "Top selling:",
      bestLines || "—",
      "",
      "Recent bills:",
      billsLines || "—",
      "",
      "Udhar:",
      `Pending: ${formatRupee(udharPending)}`,
      `Recovered (${periodLabel}): ${formatRupee(udharRecovered)}`,
      udharTopLines || "—",
      "",
      "Dhanyawad! 🙏",
    ].join("\n");

    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="flex flex-col gap-5 pb-28">
      <header>
        <h1 className="text-xl font-bold text-zinc-900">Reports / रिपोर्ट</h1>
        <p className="text-sm text-zinc-500">ShopSaathi — hisaab kitab</p>
      </header>

      <div
        className="flex rounded-2xl bg-zinc-100 p-1"
        role="tablist"
        aria-label="Date range"
      >
        {TABS.map((t) => {
          const active = period === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPeriod(t.id)}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center rounded-xl px-1 py-2 text-center transition ${
                active
                  ? "bg-white font-bold text-[#16a34a] shadow-sm ring-1 ring-zinc-200/80"
                  : "font-medium text-zinc-600 active:bg-zinc-200/60"
              }`}
            >
              <span className="text-sm leading-tight">{t.label}</span>
              <span className="text-[10px] leading-tight text-zinc-500">
                {t.labelHi}
              </span>
            </button>
          );
        })}
      </div>

      <section aria-label="Summary">
        <h2 className="sr-only">Summary cards</h2>
        <div className="grid grid-cols-2 gap-3">
          {loading
            ? [0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100"
                >
                  <div className="h-3 w-20 animate-pulse rounded bg-zinc-200" />
                  <div className="mt-2 h-7 w-24 animate-pulse rounded bg-zinc-200" />
                </div>
              ))
            : (
                <>
                  <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
                    <p className="text-xs font-semibold text-zinc-500">
                      Total Sales
                    </p>
                    <p className="mt-1 text-lg font-extrabold tabular-nums text-zinc-900">
                      {formatRupee(summary.totalSales)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
                    <p className="text-xs font-semibold text-zinc-500">
                      Total Bills
                    </p>
                    <p className="mt-1 text-lg font-extrabold tabular-nums text-[#16a34a]">
                      {summary.totalBills}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
                    <p className="text-xs font-semibold text-zinc-500">
                      Total Udhar Diya
                    </p>
                    <p className="mt-1 text-lg font-extrabold tabular-nums text-orange-600">
                      {formatRupee(summary.totalUdharDiya)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
                    <p className="text-xs font-semibold text-zinc-500">
                      Cash Received
                    </p>
                    <p className="mt-1 text-lg font-extrabold tabular-nums text-zinc-900">
                      {formatRupee(summary.cashReceived)}
                    </p>
                  </div>
                </>
              )}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold text-zinc-900">
          Sabse Zyada Bika 🏆
        </h2>
        {loading ? (
          <ul className="mt-3 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
              >
                <div className="flex gap-3">
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-zinc-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
                    <div className="h-3 w-full animate-pulse rounded bg-zinc-100" />
                    <div className="h-2 w-full animate-pulse rounded bg-zinc-100" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : bestSelling.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
            Is period mein koi item sell nahi hua
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {bestSelling.map((b, idx) => (
              <li
                key={`${b.name}-${idx}`}
                className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-lg font-black text-[#16a34a]">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-zinc-900">{b.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
                      <span>
                        Units:{" "}
                        <span className="font-semibold tabular-nums text-zinc-900">
                          {b.units}
                        </span>
                      </span>
                      <span>
                        Revenue:{" "}
                        <span className="font-semibold tabular-nums text-zinc-900">
                          {formatRupee(b.revenue)}
                        </span>
                      </span>
                    </div>
                    <BestBar value={b.revenue} max={maxRevenue} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-bold text-zinc-900">
          Haal ke Bills 🧾
        </h2>
        {loading ? (
          <ul className="mt-3 flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <li
                key={i}
                className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
              >
                <div className="flex justify-between gap-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
                  <div className="h-6 w-14 animate-pulse rounded-full bg-zinc-200" />
                </div>
                <div className="mt-2 h-3 w-full animate-pulse rounded bg-zinc-100" />
                <div className="mt-3 flex justify-between">
                  <div className="h-6 w-16 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
                </div>
              </li>
            ))}
          </ul>
        ) : recentBills.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
            Koi bill nahi — period badal kar dekho
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {recentBills.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-bold text-zinc-900">{r.customer}</p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      r.payType === "cash"
                        ? "bg-green-50 text-[#16a34a] ring-1 ring-green-100"
                        : "bg-orange-50 text-orange-700 ring-1 ring-orange-100"
                    }`}
                  >
                    {r.payType === "cash" ? "Cash" : "Udhar"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600">{r.itemsSummary}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-extrabold tabular-nums text-zinc-900">
                    {formatRupee(r.total)}
                  </p>
                  <p className="text-xs font-medium text-zinc-400">
                    {r.timeLabel}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-bold text-zinc-900">
          Udhar ka Hisaab 📒
        </h2>
        <div className="mt-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
                  <div className="mt-2 h-7 w-28 animate-pulse rounded bg-zinc-200" />
                </div>
                <div>
                  <div className="h-3 w-28 animate-pulse rounded bg-zinc-200" />
                  <div className="mt-2 h-7 w-28 animate-pulse rounded bg-zinc-200" />
                </div>
              </div>
              <div className="border-t border-zinc-100 pt-4">
                <div className="h-3 w-20 animate-pulse rounded bg-zinc-200" />
                <div className="mt-2 space-y-2">
                  <div className="h-10 w-full animate-pulse rounded-xl bg-zinc-100" />
                  <div className="h-10 w-full animate-pulse rounded-xl bg-zinc-100" />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Total pending
                  </p>
                  <p className="mt-1 text-xl font-extrabold tabular-nums text-red-600">
                    {formatRupee(udharPending)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Recovered (is period)
                  </p>
                  <p className="mt-1 text-xl font-extrabold tabular-nums text-[#16a34a]">
                    {formatRupee(udharRecovered)}
                  </p>
                </div>
              </div>
              <div className="mt-4 border-t border-zinc-100 pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Top udhar
                </p>
                {topUdhar.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">
                    Abhi koi customer nahi
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {topUdhar.map((c, idx) => (
                      <li
                        key={`${c.name}-${idx}`}
                        className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5"
                      >
                        <span className="font-semibold text-zinc-900">
                          {c.name}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-red-600">
                          {formatRupee(c.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <div className="pointer-events-none fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 flex justify-center px-4">
        <button
          type="button"
          onClick={shareWhatsApp}
          disabled={loading}
          className="pointer-events-auto min-h-14 w-full max-w-lg rounded-2xl bg-[#16a34a] text-base font-bold text-white shadow-lg active:bg-green-700 disabled:opacity-50"
        >
          WhatsApp pe Share Karo 📊
        </button>
      </div>
    </div>
  );
}
