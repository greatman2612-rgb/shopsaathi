"use client";

import { useShopId } from "@/hooks/useShopId";
import { usePlan } from "@/hooks/usePlan";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  paymentMode?: string;
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

function toYmdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    paymentMode:
      data.payment_mode != null
        ? String(data.payment_mode).toLowerCase().trim()
        : "cash",
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
  const { shopId, loading: shopIdLoading } = useShopId();
  const { limits } = usePlan();
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
  const [pl, setPl] = useState({
    revenue: 0,
    purchaseCost: 0,
    expenses: 0,
    grossProfit: 0,
    netProfit: 0,
  });
  const [payModes, setPayModes] = useState({
    cash: 0,
    upi: 0,
    card: 0,
    bank: 0,
  });

  const loadReports = useCallback(async (p: Period) => {
    if (!shopId) return;
    setLoading(true);
    const now = new Date();
    const { start, end } = periodRange(p, now);

    try {
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const startYmd = toYmdLocal(start);
      const endYmd = toYmdLocal(end);
      const [billsRes, customersRes, txRes, recentRes, purchasesRes, expensesRes] =
        await Promise.all([
        supabase
          .from("bills")
          .select("*")
          .eq("shop_id", shopId)
          .gte("created_at", startIso)
          .lte("created_at", endIso),
        supabase.from("customers").select("*").eq("shop_id", shopId),
        supabase
          .from("udhar_transactions")
          .select("*")
          .eq("shop_id", shopId)
          .gte("created_at", startIso),
        supabase
          .from("bills")
          .select("*")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("purchases")
          .select("total_cost,created_at")
          .eq("shop_id", shopId)
          .gte("created_at", startIso)
          .lte("created_at", endIso),
        supabase
          .from("expenses")
          .select("amount,expense_date")
          .eq("shop_id", shopId)
          .gte("expense_date", startYmd)
          .lte("expense_date", endYmd),
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

      let purchaseCost = 0;
      for (const row of (purchasesRes.data ?? []) as Record<string, unknown>[]) {
        purchaseCost += Number(row.total_cost ?? 0);
      }
      let expenseTotal = 0;
      for (const row of (expensesRes.data ?? []) as Record<string, unknown>[]) {
        expenseTotal += Number(row.amount ?? 0);
      }
      purchaseCost = Math.round(purchaseCost * 100) / 100;
      expenseTotal = Math.round(expenseTotal * 100) / 100;
      const revenue = Math.round(totalSales * 100) / 100;
      const grossProfit = Math.round((revenue - purchaseCost) * 100) / 100;
      const netProfit = Math.round((grossProfit - expenseTotal) * 100) / 100;
      setPl({
        revenue,
        purchaseCost,
        expenses: expenseTotal,
        grossProfit,
        netProfit,
      });

      let pcash = 0;
      let pupi = 0;
      let pcard = 0;
      let pbank = 0;
      for (const b of periodBills) {
        if (b.is_udhar) continue;
        const m = (b.paymentMode ?? "cash").toLowerCase();
        const tot = b.total;
        if (m === "upi") pupi += tot;
        else if (m === "card") pcard += tot;
        else if (m === "bank") pbank += tot;
        else pcash += tot;
      }
      setPayModes({
        cash: Math.round(pcash * 100) / 100,
        upi: Math.round(pupi * 100) / 100,
        card: Math.round(pcard * 100) / 100,
        bank: Math.round(pbank * 100) / 100,
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
      setPl({
        revenue: 0,
        purchaseCost: 0,
        expenses: 0,
        grossProfit: 0,
        netProfit: 0,
      });
      setPayModes({ cash: 0, upi: 0, card: 0, bank: 0 });
      setBestSelling([]);
      setRecentBills([]);
      setUdharPending(0);
      setUdharRecovered(0);
      setTopUdhar([]);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    if (!shopIdLoading && !shopId) setLoading(false);
  }, [shopId, shopIdLoading]);

  useEffect(() => {
    if (!shopId) return;
    void loadReports(period);
  }, [period, loadReports, shopId]);

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
  const noReportData =
    !loading &&
    summary.totalBills === 0 &&
    bestSelling.length === 0 &&
    recentBills.length === 0;

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

      {!limits.hasReports ? (
        <section className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-5 text-center shadow-sm">
          <p className="text-lg font-extrabold text-zinc-900">
            Reports feature Basic plan se available hai! 🔒
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-600">
            Upgrade karo ₹199/month mein.
          </p>
          <Link
            href="/more"
            className="mx-auto mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#16a34a] px-5 text-sm font-bold text-white shadow-md active:bg-green-700"
          >
            Upgrade Karo
          </Link>
        </section>
      ) : null}

      {limits.hasReports ? (
      <>
      {noReportData ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm font-medium text-zinc-600">
          Abhi koi data nahi hai. Bills banao toh reports yahan dikhenge!
        </p>
      ) : null}
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

      <section aria-label="Profit and loss">
        <h2 className="text-base font-bold text-zinc-900">
          Munafa / Nuksaan 💰
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          {periodLabel} — Total revenue, kharidi cost, kharch, aur net
        </p>
        {loading ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl bg-zinc-100"
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
                <p className="text-xs font-semibold text-zinc-500">
                  Total Revenue (bills)
                </p>
                <p className="mt-1 text-lg font-extrabold tabular-nums text-zinc-900">
                  {formatRupee(pl.revenue)}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
                <p className="text-xs font-semibold text-zinc-500">
                  Kharidi / Stock-in cost
                </p>
                <p className="mt-1 text-lg font-extrabold tabular-nums text-orange-700">
                  {formatRupee(pl.purchaseCost)}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
                <p className="text-xs font-semibold text-zinc-500">
                  Total Kharch (expenses)
                </p>
                <p className="mt-1 text-lg font-extrabold tabular-nums text-zinc-800">
                  {formatRupee(pl.expenses)}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-3 shadow-sm ring-1 ring-amber-100">
                <p className="text-xs font-semibold text-amber-900/80">
                  Gross profit
                </p>
                <p className="mt-1 text-lg font-extrabold tabular-nums text-amber-950">
                  {formatRupee(pl.grossProfit)}
                </p>
                <p className="mt-1 text-[10px] text-amber-900/70">
                  Revenue − purchase cost
                </p>
              </div>
            </div>
            <div
              className={`rounded-2xl border-2 p-4 shadow-sm ${
                pl.netProfit >= 0
                  ? "border-green-200 bg-green-50/90 ring-1 ring-green-100"
                  : "border-red-200 bg-red-50/90 ring-1 ring-red-100"
              }`}
            >
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-600">
                Net profit / loss
              </p>
              <p
                className={`mt-1 text-2xl font-black tabular-nums ${
                  pl.netProfit >= 0 ? "text-[#16a34a]" : "text-red-600"
                }`}
              >
                {formatRupee(pl.netProfit)}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Gross profit − expenses
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Cash bills — payment mode
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Sirf cash-type bills (udhar alag)
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex justify-between font-semibold text-zinc-800">
                  <span>💵 Cash</span>
                  <span className="tabular-nums">{formatRupee(payModes.cash)}</span>
                </li>
                <li className="flex justify-between font-semibold text-zinc-800">
                  <span>📱 UPI</span>
                  <span className="tabular-nums">{formatRupee(payModes.upi)}</span>
                </li>
                <li className="flex justify-between font-semibold text-zinc-800">
                  <span>💳 Card</span>
                  <span className="tabular-nums">{formatRupee(payModes.card)}</span>
                </li>
                <li className="flex justify-between font-semibold text-zinc-800">
                  <span>🏦 Bank</span>
                  <span className="tabular-nums">{formatRupee(payModes.bank)}</span>
                </li>
              </ul>
            </div>
          </div>
        )}
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
      </>
      ) : null}
    </div>
  );
}
