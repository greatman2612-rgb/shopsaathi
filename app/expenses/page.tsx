"use client";

import { useShopId } from "@/hooks/useShopId";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const CATEGORIES = [
  "Rent",
  "Electricity",
  "Staff Salary",
  "Purchase",
  "Transport",
  "Other",
] as const;

type ExpenseRow = {
  id: string;
  category: string;
  amount: number;
  note: string;
  expenseDate: string;
  createdAt: string;
};

function formatRupee(n: number) {
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mapRow(r: Record<string, unknown>): ExpenseRow {
  return {
    id: String(r.id ?? ""),
    category: String(r.category ?? ""),
    amount: Number(r.amount ?? 0),
    note: String(r.note ?? ""),
    expenseDate: String(r.expense_date ?? "").slice(0, 10),
    createdAt: String(r.created_at ?? ""),
  };
}

export default function ExpensesPage() {
  const { shopId, loading: shopIdLoading } = useShopId();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [dateStr, setDateStr] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("shop_id", shopId)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows(((data ?? []) as Record<string, unknown>[]).map(mapRow));
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    if (!shopIdLoading && !shopId) setLoading(false);
  }, [shopId, shopIdLoading]);

  useEffect(() => {
    if (!shopId) return;
    void load();
  }, [load, shopId]);

  const now = new Date();
  const currentMonth = monthKey(now);

  const monthTotal = useMemo(() => {
    return rows.reduce((s, r) => {
      const k = r.expenseDate.slice(0, 7);
      if (k === currentMonth) return s + r.amount;
      return s;
    }, 0);
  }, [rows, currentMonth]);

  const chartBars = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const k = r.expenseDate.slice(0, 7);
      if (k !== currentMonth) continue;
      const day = r.expenseDate.slice(8, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + r.amount);
    }
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const arr: { label: string; value: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const label = String(d);
      const key = String(d).padStart(2, "0");
      arr.push({ label, value: byDay.get(key) ?? 0 });
    }
    const max = Math.max(1, ...arr.map((x) => x.value));
    return { arr, max };
  }, [rows, currentMonth, now]);

  const totalAll = useMemo(
    () => rows.reduce((s, r) => s + r.amount, 0),
    [rows],
  );

  const save = async () => {
    if (!shopId) return;
    const amt = Math.round(parseFloat(amount.replace(/[^\d.]/g, "")) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("expenses").insert({
        shop_id: shopId,
        category,
        amount: amt,
        note: note.trim(),
        expense_date: dateStr,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      setAmount("");
      setNote("");
      setDateStr(new Date().toISOString().slice(0, 10));
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (shopIdLoading || (loading && !shopId)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-green-200 border-t-[#16a34a]" />
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Expenses / खर्च</h1>
          <p className="text-sm text-zinc-500">ShopSaathi — dukan ke kharch</p>
        </div>
        <Link
          href="/more"
          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-sm active:bg-zinc-50"
        >
          Settings / और
        </Link>
      </header>

      <section className="rounded-2xl border border-green-100 bg-green-50/70 p-4 ring-1 ring-green-100">
        <p className="text-xs font-bold uppercase tracking-wide text-green-800">
          Is mahine / This month
        </p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums text-[#16a34a]">
          {formatRupee(monthTotal)}
        </p>
        <p className="mt-3 text-xs font-semibold text-zinc-600">Roz ka kharch (bars)</p>
        <div className="mt-2 flex h-24 items-end gap-0.5 overflow-x-auto pb-1">
          {chartBars.arr.map((b) => (
            <div
              key={b.label}
              className="flex w-4 shrink-0 flex-col items-center justify-end gap-1"
              title={`${b.label}: ${formatRupee(b.value)}`}
            >
              <div
                className="w-full min-h-[2px] rounded-t bg-[#16a34a]/90"
                style={{
                  height: `${Math.max(2, Math.round((b.value / chartBars.max) * 72))}px`,
                }}
              />
              <span className="text-[8px] font-medium text-zinc-500">{b.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <h2 className="text-sm font-bold text-zinc-900">Naya kharch / New expense</h2>
        <label className="mt-3 block text-xs font-semibold text-zinc-600">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none focus:border-[#16a34a]"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-2 block text-xs font-semibold text-zinc-600">
          Amount (₹)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-base font-semibold tabular-nums outline-none focus:border-[#16a34a]"
            placeholder="0"
          />
        </label>
        <label className="mt-2 block text-xs font-semibold text-zinc-600">
          Note
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none focus:border-[#16a34a]"
            placeholder="Optional"
          />
        </label>
        <label className="mt-2 block text-xs font-semibold text-zinc-600">
          Date
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none focus:border-[#16a34a]"
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="mt-4 min-h-12 w-full rounded-2xl bg-[#16a34a] text-base font-bold text-white active:bg-green-700 disabled:opacity-50"
        >
          Save kharch
        </button>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">
            Sab kharch / Total spent
          </h2>
          <span className="text-sm font-extrabold text-zinc-900">{formatRupee(totalAll)}</span>
        </div>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading list…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
            Abhi koi kharch nahi — upar se add karo
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-900">{r.category}</p>
                    {r.note ? (
                      <p className="mt-0.5 text-sm text-zinc-600">{r.note}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-zinc-400">{r.expenseDate}</p>
                  </div>
                  <p className="shrink-0 text-lg font-extrabold tabular-nums text-[#16a34a]">
                    {formatRupee(r.amount)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
