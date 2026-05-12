"use client";

import { useShopId } from "@/hooks/useShopId";
import { usePlan } from "@/hooks/usePlan";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

const SHOP_DISPLAY_NAME = "Meri Dukan";

type Customer = {
  id: string;
  name: string;
  phone: string;
  udhar: number;
  lastDate: string;
};

type LedgerEntry = {
  id: string;
  atLabel: string;
  type: string;
  amount: number;
  note: string;
  balanceAfter: number;
};

function formatLedgerTs(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRupee(n: number) {
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function buildReminderMessage(name: string, amount: number) {
  return `Namaste ${name} ji, aapka ShopSaathi se ${formatRupee(amount)} udhar baaki hai.\nKripya jald se jald dena. Dhanyawad! 🙏`;
}

export default function UdharPage() {
  const { shopId, loading: shopIdLoading } = useShopId();
  const { limits } = usePlan();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentForId, setPaymentForId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newUdhar, setNewUdhar] = useState("");
  const [reminderGeneratingId, setReminderGeneratingId] = useState<string | null>(
    null,
  );
  const [ledgerByCustomer, setLedgerByCustomer] = useState<
    Record<string, LedgerEntry[]>
  >({});
  const [ledgerLoadingId, setLedgerLoadingId] = useState<string | null>(null);
  const [udharBillCount, setUdharBillCount] = useState<Record<string, number>>(
    {},
  );
  const [ledgerRefresh, setLedgerRefresh] = useState(0);

  const loadCustomers = useCallback(async (silent = false) => {
    if (!shopId) return;
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("loadCustomers error:", error);
        setCustomers([]);
        return;
      }

      const list = ((data as Record<string, unknown>[] | null) || []).map(
        (c) => ({
          id: String(c.id ?? ""),
          name: String(c.name ?? ""),
          phone: String(c.phone ?? ""),
          udhar: Number(c.total_udhar) || 0,
          lastDate: String(c.last_date ?? ""),
        }),
      );

      setCustomers(list);
    } catch (e) {
      console.error("loadCustomers catch:", e);
      setCustomers([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    if (!shopIdLoading && !shopId) setLoading(false);
  }, [shopId, shopIdLoading]);

  useEffect(() => {
    if (!shopId) return;
    void loadCustomers(false);
  }, [loadCustomers, shopId]);

  useEffect(() => {
    if (!shopId || !expandedId) return;
    let cancelled = false;
    setLedgerLoadingId(expandedId);
    void (async () => {
      try {
        const [txRes, billsRes] = await Promise.all([
          supabase
            .from("udhar_transactions")
            .select("*")
            .eq("shop_id", shopId)
            .eq("customer_id", expandedId)
            .order("created_at", { ascending: true }),
          supabase
            .from("bills")
            .select("*", { count: "exact", head: true })
            .eq("shop_id", shopId)
            .eq("customer_id", expandedId)
            .eq("is_udhar", true),
        ]);
        if (cancelled) return;
        const rows = (txRes.data ?? []) as Record<string, unknown>[];
        let bal = 0;
        const entries: LedgerEntry[] = rows.map((row) => {
          const type = String(row.type ?? "").toLowerCase();
          const amt = Number(row.amount ?? 0);
          if (type === "payment") bal -= amt;
          else bal += amt;
          const created = String(row.created_at ?? "");
          return {
            id: String(row.id ?? ""),
            atLabel: formatLedgerTs(created),
            type,
            amount: amt,
            note: String(row.note ?? ""),
            balanceAfter: Math.round(bal * 100) / 100,
          };
        });
        setLedgerByCustomer((prev) => ({ ...prev, [expandedId]: entries }));
        setUdharBillCount((prev) => ({
          ...prev,
          [expandedId]: billsRes.count ?? 0,
        }));
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setLedgerByCustomer((prev) => ({ ...prev, [expandedId]: [] }));
        }
      } finally {
        if (!cancelled) setLedgerLoadingId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId, expandedId, ledgerRefresh]);

  const totalUdhar = useMemo(
    () => customers.reduce((s, c) => s + c.udhar, 0),
    [customers],
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return customers;
    return customers.filter((c) => normalize(c.name).includes(q));
  }, [customers, query]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    setPaymentForId(null);
    setPaymentAmount("");
  };

  const openPayment = (id: string, currentUdhar: number) => {
    setPaymentForId(id);
    setPaymentAmount(String(currentUdhar));
  };

  const applyPayment = async (customerId: string) => {
    if (!shopId) return;
    const raw = paymentAmount.replace(/[^\d.]/g, "");
    const paymentAmountNum = Math.round(parseFloat(raw) * 100) / 100;
    if (!Number.isFinite(paymentAmountNum) || paymentAmountNum <= 0) return;

    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;

    const pay = Math.min(paymentAmountNum, customer.udhar);
    if (pay <= 0) return;

    try {
      // Update customer udhar
      const { error: updateError } = await supabase
        .from("customers")
        .update({
          total_udhar: Math.max(0, customer.udhar - pay),
          last_date: new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          }),
        })
        .eq("id", customer.id);

      if (updateError) throw updateError;

      // Save transaction
      const { error: txError } = await supabase.from("udhar_transactions").insert({
        shop_id: shopId,
        customer_id: customer.id,
        amount: pay,
        type: "payment",
        note: "Payment liya",
        created_at: new Date().toISOString(),
      });

      if (txError) throw txError;

      await loadCustomers(true);
      setLedgerRefresh((x) => x + 1);
    } catch (e) {
      console.error(e);
    }

    setPaymentForId(null);
    setPaymentAmount("");
  };

  const sendReminder = async (c: Customer) => {
    setReminderGeneratingId(c.id);
    let text = buildReminderMessage(c.name, c.udhar);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reminder",
          customerName: c.name,
          amount: c.udhar,
          shopName: SHOP_DISPLAY_NAME,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { message?: string };
        if (data.message && typeof data.message === "string" && data.message.trim())
          text = data.message.trim();
      }
    } catch {
      /* fallback to hardcoded message */
    } finally {
      setReminderGeneratingId(null);
    }
    const digits = c.phone.replace(/\D/g, "");
    const url =
      digits.length >= 10
        ? `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareLedger = (c: Customer) => {
    const rows = ledgerByCustomer[c.id] ?? [];
    const n = udharBillCount[c.id] ?? 0;
    const lines = rows.map((e) => {
      const label =
        e.type === "payment"
          ? "Payment"
          : e.type === "credit"
            ? "Credit / Udhar"
            : e.type;
      return `${e.atLabel} | ${label} | ${formatRupee(e.amount)} | balance ${formatRupee(e.balanceAfter)}${e.note ? ` | ${e.note}` : ""}`;
    });
    const text = [
      `ShopSaathi — Ledger: ${c.name}`,
      `Udhar bills (count): ${n}`,
      `Abhi baaki: ${formatRupee(c.udhar)}`,
      "",
      "Puri history:",
      lines.length ? lines.join("\n") : "—",
      "",
      "Dhanyawad.",
    ].join("\n");
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const saveNewCustomer = async () => {
    if (!shopId) return;
    const name = newName.trim();
    const phone = newPhone.trim();
    if (!name || phone.replace(/\D/g, "").length < 10) return;

    try {
      const { data: newCust, error } = await supabase
        .from("customers")
        .insert({
          shop_id: shopId,
          name: newName.trim(),
          phone: newPhone.trim(),
          total_udhar: Number(newUdhar) || 0,
          last_date: new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          }),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      void newCust;

      await loadCustomers(true);
    } catch (e) {
      console.error(e);
    }

    setNewName("");
    setNewPhone("");
    setNewUdhar("");
    setAddOpen(false);
  };

  return (
    <div className="relative flex flex-col gap-4 pb-28">
      <header>
        <h1 className="text-xl font-bold text-zinc-900">Udhar Khata</h1>
        <p className="text-sm text-zinc-500">ShopSaathi — credit hisaab</p>
      </header>

      {loading ? (
        <div
          className="flex flex-col items-center justify-center gap-3 py-24"
          role="status"
          aria-live="polite"
        >
          <div
            className="h-12 w-12 animate-spin rounded-full border-4 border-green-200 border-t-[#16a34a]"
            aria-hidden
          />
          <p className="text-sm font-medium text-zinc-500">Loading…</p>
        </div>
      ) : (
        <>
          <label className="sr-only" htmlFor="udhar-search">
            Customer search
          </label>
          <input
            id="udhar-search"
            type="search"
            placeholder="Customer ka naam dhundo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-14 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#16a34a] focus:bg-white focus:ring-2 focus:ring-[#16a34a]/25"
          />

          <section
            className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-4 shadow-sm"
            aria-live="polite"
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-800/90">
              Sabka joda
            </p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-red-600">
              Kul Udhar: {formatRupee(totalUdhar)}
            </p>
            <p className="mt-1 text-xs text-orange-900/70">
              Jaldi wasool karein — tap card for details
            </p>
          </section>

          <section aria-label="Customers" className="flex flex-col gap-3">
            {filtered.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
                Koi customer nahi mila
              </p>
            ) : (
              filtered.map((c) => {
                const open = expandedId === c.id;
                return (
                  <article
                    key={c.id}
                    className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm ring-1 ring-zinc-100"
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(c.id)}
                      className="flex w-full min-h-[4.5rem] items-start gap-3 p-4 text-left active:bg-zinc-50"
                      aria-expanded={open}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold text-zinc-900">{c.name}</p>
                        <p className="mt-0.5 text-sm text-zinc-500">{c.phone}</p>
                        <p className="mt-1 text-xs text-zinc-400">
                          Last: {c.lastDate}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-extrabold tabular-nums text-red-600">
                          {formatRupee(c.udhar)}
                        </p>
                        <p className="text-xs font-medium text-red-500/80">
                          baaki
                        </p>
                      </div>
                      <span
                        className="mt-1 shrink-0 text-zinc-400"
                        aria-hidden
                      >
                        {open ? "▲" : "▼"}
                      </span>
                    </button>

                    {open ? (
                      <div className="border-t border-zinc-100 bg-zinc-50/80 px-4 pb-4 pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                            Poora ledger
                          </h3>
                          <p className="text-xs font-semibold text-zinc-600">
                            Udhar bills:{" "}
                            <span className="tabular-nums text-zinc-900">
                              {udharBillCount[c.id] ?? "—"}
                            </span>
                          </p>
                        </div>
                        {ledgerLoadingId === c.id ? (
                          <p className="mt-3 text-center text-sm text-zinc-500">
                            Loading history…
                          </p>
                        ) : (
                          <div className="mt-2 overflow-x-auto rounded-xl ring-1 ring-zinc-200/80">
                            <table className="w-full min-w-[280px] text-left text-xs">
                              <thead className="bg-zinc-100/90 text-[10px] font-bold uppercase text-zinc-500">
                                <tr>
                                  <th className="px-2 py-2">Date</th>
                                  <th className="px-2 py-2">Type</th>
                                  <th className="px-2 py-2 text-right">Amt</th>
                                  <th className="px-2 py-2 text-right">Balance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(ledgerByCustomer[c.id] ?? []).length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={4}
                                      className="px-2 py-4 text-center text-zinc-500"
                                    >
                                      Koi transaction nahi
                                    </td>
                                  </tr>
                                ) : (
                                  (ledgerByCustomer[c.id] ?? []).map((e) => (
                                    <tr
                                      key={e.id}
                                      className="border-t border-zinc-100 bg-white"
                                    >
                                      <td className="px-2 py-2 align-top text-zinc-700">
                                        <div>{e.atLabel}</div>
                                        {e.note ? (
                                          <div className="mt-0.5 max-w-[8rem] text-[10px] leading-snug text-zinc-500">
                                            {e.note}
                                          </div>
                                        ) : null}
                                      </td>
                                      <td className="px-2 py-2 align-top font-semibold capitalize text-zinc-800">
                                        {e.type === "payment"
                                          ? "Payment"
                                          : e.type === "credit"
                                            ? "Credit"
                                            : e.type}
                                      </td>
                                      <td className="px-2 py-2 align-top text-right font-bold tabular-nums text-zinc-900">
                                        {formatRupee(e.amount)}
                                      </td>
                                      <td className="px-2 py-2 align-top text-right font-bold tabular-nums text-red-700">
                                        {formatRupee(e.balanceAfter)}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <button
                          type="button"
                          className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-[#16a34a] bg-white text-sm font-bold text-[#16a34a] active:bg-green-50"
                          onClick={() => shareLedger(c)}
                        >
                          Download / Share Ledger (WhatsApp)
                        </button>

                        {paymentForId === c.id ? (
                          <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                            <p className="text-sm font-semibold text-zinc-800">
                              Kitna payment mila?
                            </p>
                            <input
                              type="tel"
                              inputMode="decimal"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-base font-semibold tabular-nums outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
                              placeholder="Amount"
                            />
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                className="min-h-12 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-800 active:bg-zinc-100"
                                onClick={() => {
                                  setPaymentAmount(String(c.udhar));
                                }}
                              >
                                Poora: {formatRupee(c.udhar)}
                              </button>
                              <button
                                type="button"
                                className="min-h-12 rounded-xl bg-[#16a34a] text-sm font-bold text-white active:bg-green-700"
                                onClick={() => void applyPayment(c.id)}
                              >
                                Save
                              </button>
                            </div>
                            <button
                              type="button"
                              className="mt-2 w-full min-h-11 text-sm font-medium text-zinc-500"
                              onClick={() => {
                                setPaymentForId(null);
                                setPaymentAmount("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              disabled={c.udhar <= 0}
                              className="flex min-h-14 flex-1 items-center justify-center rounded-2xl bg-[#16a34a] text-base font-bold text-white shadow-sm active:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => openPayment(c.id, c.udhar)}
                            >
                              Payment Liya
                            </button>
                            <button
                              type="button"
                              disabled={
                                c.udhar <= 0 ||
                                reminderGeneratingId === c.id ||
                                !limits.hasWhatsappReminder
                              }
                              title={
                                !limits.hasWhatsappReminder
                                  ? "WhatsApp reminder Basic plan mein available hai"
                                  : undefined
                              }
                              className="flex min-h-14 flex-1 items-center justify-center rounded-2xl bg-orange-500 text-base font-bold text-white shadow-sm active:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => void sendReminder(c)}
                            >
                              {reminderGeneratingId === c.id
                                ? "Generating..."
                                : "WhatsApp Reminder"}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </section>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-40 flex h-16 w-16 items-center justify-center rounded-full bg-[#16a34a] text-3xl font-light leading-none text-white shadow-lg ring-4 ring-white/80 active:scale-95"
            aria-label="Add new customer"
          >
            +
          </button>

          {addOpen ? (
            <div
              className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45 p-0"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-customer-title"
            >
              <button
                type="button"
                className="min-h-12 flex-1"
                aria-label="Close"
                onClick={() => setAddOpen(false)}
              />
              <div className="max-h-[85dvh] overflow-auto rounded-t-3xl bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl">
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-200" />
                <h2
                  id="add-customer-title"
                  className="text-lg font-bold text-zinc-900"
                >
                  Naya customer
                </h2>
                <p className="text-sm text-zinc-500">
                  Name, phone, shuruati udhar
                </p>

                <label className="mt-4 block text-sm font-semibold text-zinc-700">
                  Naam
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
                    placeholder="Full name"
                    autoComplete="name"
                  />
                </label>
                <label className="mt-3 block text-sm font-semibold text-zinc-700">
                  Phone
                  <input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
                    placeholder="10 digit number"
                    inputMode="numeric"
                    autoComplete="tel"
                  />
                </label>
                <label className="mt-3 block text-sm font-semibold text-zinc-700">
                  Shuruati udhar (optional)
                  <input
                    value={newUdhar}
                    onChange={(e) => setNewUdhar(e.target.value)}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
                    placeholder="0"
                    inputMode="decimal"
                  />
                </label>

                <div className="mt-5 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void saveNewCustomer()}
                    disabled={
                      !newName.trim() ||
                      newPhone.replace(/\D/g, "").length < 10
                    }
                    className="min-h-14 w-full rounded-2xl bg-[#16a34a] text-base font-bold text-white active:bg-green-700 disabled:opacity-40"
                  >
                    Save customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="min-h-12 w-full rounded-2xl text-base font-semibold text-zinc-600 active:bg-zinc-100"
                  >
                    Band karo
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
