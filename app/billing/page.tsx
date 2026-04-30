"use client";

import { useShopId } from "@/hooks/useShopId";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  /** Full label as in inventory, e.g. "Parle-G 50g ₹5" */
  label: string;
  name: string;
  price: number;
};

const SAMPLE_PRODUCTS: Product[] = [
  { id: "p1", label: "Parle-G 50g ₹5", name: "Parle-G 50g", price: 5 },
  { id: "p2", label: "Tata Salt 1kg ₹22", name: "Tata Salt 1kg", price: 22 },
  { id: "p3", label: "Surf Excel ₹45", name: "Surf Excel", price: 45 },
  { id: "p4", label: "Maggi 70g ₹14", name: "Maggi 70g", price: 14 },
  { id: "p5", label: "Amul Butter 100g ₹55", name: "Amul Butter 100g", price: 55 },
  { id: "p6", label: "Colgate ₹40", name: "Colgate", price: 40 },
];

type BillLine = {
  productId: string;
  label: string;
  unitPrice: number;
  qty: number;
};

type PaymentKind = "cash" | "udhar";

function formatShortDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatRupee(n: number) {
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function lineItemName(label: string) {
  return label.replace(/\s*₹[\d.]+\s*$/u, "").trim() || label;
}

type AiSuggestion = { name: string; price: number };

function buildDbItems(snapshot: BillLine[]) {
  return snapshot.map((l) => ({
    name: lineItemName(l.label),
    price: l.unitPrice,
    qty: l.qty,
  }));
}

async function persistBill(opts: {
  shopId: string;
  isUdhar: boolean;
  linesSnapshot: BillLine[];
  grandTotal: number;
  gstApplied: boolean;
  customerName?: string;
  customerId?: string;
}) {
  const payload: Record<string, unknown> = {
    shop_id: opts.shopId,
    items: buildDbItems(opts.linesSnapshot),
    total: opts.grandTotal,
    is_udhar: opts.isUdhar,
    gst_applied: opts.gstApplied,
    created_at: new Date().toISOString(),
  };
  if (opts.isUdhar && opts.customerName) {
    payload.customer_name = opts.customerName;
    if (opts.customerId) payload.customer_id = opts.customerId;
  }
  const { error } = await supabase.from("bills").insert(payload);
  if (error) throw error;
}

export default function BillingPage() {
  const { shopId, loading: shopIdLoading } = useShopId();
  const [search, setSearch] = useState("");
  const [shopType, setShopType] = useState("general");
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
  const [lines, setLines] = useState<BillLine[]>([]);
  const [gstOn, setGstOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [udharModalOpen, setUdharModalOpen] = useState(false);
  const [udharCustomerName, setUdharCustomerName] = useState("");
  const [done, setDone] = useState<{
    payment: PaymentKind;
    lines: BillLine[];
    subtotal: number;
    gstAmount: number;
    total: number;
  } | null>(null);

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return [];
    return SAMPLE_PRODUCTS.filter(
      (p) =>
        normalize(p.name).includes(q) ||
        normalize(p.label).includes(q) ||
        normalize(p.label.replace(/₹\d+/, "")).includes(q),
    );
  }, [search]);

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("shop_type")
        .eq("id", shopId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("load shop type failed:", error);
        return;
      }
      const type = String((data as { shop_type?: unknown } | null)?.shop_type ?? "").trim();
      if (type) setShopType(type);
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    const q = search.trim();
    if (q.length < 2) {
      setAiSuggestions([]);
      setAiSuggestLoading(false);
      return;
    }

    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setAiSuggestLoading(true);
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "suggest", query: q, shopType }),
          signal: ac.signal,
        });
        if (!res.ok) throw new Error("suggest failed");
        const data = (await res.json()) as { suggestions?: AiSuggestion[] };
        const list = Array.isArray(data.suggestions) ? data.suggestions : [];
        const cleaned = list
          .filter(
            (s) =>
              s &&
              typeof s.name === "string" &&
              typeof s.price === "number" &&
              Number.isFinite(s.price),
          )
          .slice(0, 3);
        if (!ac.signal.aborted) setAiSuggestions(cleaned);
      } catch {
        if (!ac.signal.aborted) setAiSuggestions([]);
      } finally {
        if (!ac.signal.aborted) setAiSuggestLoading(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [search, shopType, shopId]);

  const addAiSuggestionToBill = useCallback((s: AiSuggestion) => {
    const name = s.name.trim().slice(0, 120);
    const price = Math.round(s.price * 100) / 100;
    if (!name || !Number.isFinite(price) || price < 0) return;
    const rupeePart = price % 1 === 0 ? price.toFixed(0) : price.toFixed(2);
    const id = `ai:${normalize(name)}:${price}`;
    const product: Product = {
      id,
      name,
      price,
      label: `${name} ₹${rupeePart}`,
    };
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: id,
          label: product.label,
          unitPrice: price,
          qty: 1,
        },
      ];
    });
    setSearch("");
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
    [lines],
  );

  const gstAmount = gstOn ? Math.round(subtotal * 0.18 * 100) / 100 : 0;
  const total = Math.round((subtotal + gstAmount) * 100) / 100;

  const addProduct = useCallback((p: Product) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.id,
          label: p.label,
          unitPrice: p.price,
          qty: 1,
        },
      ];
    });
    setSearch("");
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setLines((prev) => {
      if (qty < 1) return prev.filter((l) => l.productId !== productId);
      return prev.map((l) =>
        l.productId === productId ? { ...l, qty } : l,
      );
    });
  }, []);

  const removeLine = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const resetBill = useCallback(() => {
    setDone(null);
    setLines([]);
    setSearch("");
    setGstOn(false);
    setSaveError(null);
  }, []);

  const buildWhatsAppText = useCallback(
    (snapshot: BillLine[], grandTotal: number) => {
      const itemParts = snapshot.map((l) => {
        const nameOnly = lineItemName(l.label);
        return `${nameOnly} x${l.qty}`;
      });
      return [
        "ShopSaathi Bill",
        `Items: ${itemParts.join(", ")}`,
        `Total: ${formatRupee(grandTotal)}`,
        "Thank you!",
      ].join("\n");
    },
    [],
  );

  const openWhatsApp = useCallback(
    (snapshot: BillLine[], grandTotal: number) => {
      const text = buildWhatsAppText(snapshot, grandTotal);
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [buildWhatsAppText],
  );

  const saveCashBill = async () => {
    if (lines.length === 0 || !shopId) return;
    const g = gstOn ? Math.round(subtotal * 0.18 * 100) / 100 : 0;
    const t = Math.round((subtotal + g) * 100) / 100;
    const linesSnapshot = lines.map((l) => ({ ...l }));

    setSaving(true);
    setSaveError(null);
    try {
      await persistBill({
        shopId,
        isUdhar: false,
        linesSnapshot,
        grandTotal: t,
        gstApplied: gstOn,
      });
      setDone({
        payment: "cash",
        lines: linesSnapshot,
        subtotal,
        gstAmount: g,
        total: t,
      });
    } catch (e) {
      console.error(e);
      setSaveError("Save nahi ho paya — dubara try karo.");
    } finally {
      setSaving(false);
    }
  };

  const saveUdharBill = async (customerName: string) => {
    if (!shopId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const finalTotal = gstOn ? Math.round(subtotal * 1.18) : subtotal;
      const linesSnapshot = lines.map((l) => ({ ...l }));
      const billItems = linesSnapshot.map((i) => ({
        label: i.label,
        price: i.unitPrice,
        qty: i.qty,
      }));

      // Step 1: Check if customer exists
      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("*")
        .eq("shop_id", shopId)
        .ilike("name", customerName.trim());

      let customerId = "";

      if (existingCustomers && existingCustomers.length > 0) {
        // Customer exists - update their udhar
        const customer = existingCustomers[0] as Record<string, unknown>;
        customerId = String(customer.id ?? "");
        const newUdhar = Number(customer.total_udhar) + finalTotal;
        await supabase
          .from("customers")
          .update({
            total_udhar: newUdhar,
            last_date: new Date().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            }),
          })
          .eq("id", customerId);
      } else {
        // New customer - create them
        const { data: newCustomer } = await supabase
          .from("customers")
          .insert({
            shop_id: shopId,
            name: customerName.trim(),
            phone: "",
            total_udhar: finalTotal,
            last_date: new Date().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            }),
            created_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (newCustomer) customerId = String(newCustomer.id);
      }

      // Step 2: Save udhar transaction
      await supabase.from("udhar_transactions").insert({
        shop_id: shopId,
        customer_id: customerId,
        amount: finalTotal,
        type: "credit",
        note: "Bill udhar",
        created_at: new Date().toISOString(),
      });

      // Step 3: Save bill
      await supabase.from("bills").insert({
        shop_id: shopId,
        customer_id: customerId,
        customer_name: customerName.trim(),
        items: billItems.map((i) => ({
          name: i.label,
          price: i.price,
          qty: i.qty,
        })),
        total: finalTotal,
        is_udhar: true,
        gst_applied: gstOn,
        created_at: new Date().toISOString(),
      });

      setUdharModalOpen(false);
      setUdharCustomerName("");
      const g = gstOn ? Math.round(subtotal * 0.18 * 100) / 100 : 0;
      setDone({
        payment: "udhar",
        lines: linesSnapshot,
        subtotal,
        gstAmount: g,
        total: finalTotal,
      });
    } catch (e: any) {
      console.error("saveUdharBill error:", e);
      setSaveError("Save nahi ho paya - dubara try karo.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    const payLabel =
      done.payment === "cash" ? "Cash bill" : "Udhar mein daala gaya";

    return (
      <div className="flex flex-col gap-5 pb-6">
        <h1 className="text-lg font-bold text-zinc-900">Billing / बिलिंग</h1>

        <div
          className="rounded-2xl border border-green-100 bg-green-50/80 p-4 shadow-sm ring-1 ring-green-100"
          role="status"
        >
          <p className="text-center text-lg font-bold text-[#16a34a]">
            Ho gaya ✓
          </p>
          <p className="mt-1 text-center text-sm text-zinc-600">{payLabel}</p>

          <ul className="mt-4 space-y-2 border-t border-green-100/80 pt-3 text-sm text-zinc-800">
            {done.lines.map((l) => (
              <li
                key={l.productId}
                className="flex justify-between gap-2 leading-snug"
              >
                <span className="min-w-0 flex-1">
                  {l.label} × {l.qty}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatRupee(l.unitPrice * l.qty)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 space-y-1 border-t border-green-100/80 pt-3 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatRupee(done.subtotal)}</span>
            </div>
            {done.gstAmount > 0 ? (
              <div className="flex justify-between text-zinc-600">
                <span>GST 18%</span>
                <span className="tabular-nums">
                  {formatRupee(done.gstAmount)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold text-zinc-900">
              <span>Kul Total</span>
              <span className="tabular-nums text-[#16a34a]">
                {formatRupee(done.total)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => openWhatsApp(done.lines, done.total)}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-900 shadow-sm active:bg-zinc-50"
          >
            <span aria-hidden>📲</span>
            WhatsApp par bhejo
          </button>
          <button
            type="button"
            onClick={resetBill}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#16a34a] text-base font-bold text-white shadow-md active:bg-green-700"
          >
            Naya Bill
          </button>
        </div>
      </div>
    );
  }

  const canSubmit = lines.length > 0 && !saving;
  const showSuggestions = search.trim().length > 0 && filtered.length > 0;

  if (shopIdLoading) {
    return (
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
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-[calc(13rem+env(safe-area-inset-bottom))]">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Naya Bill</h1>
          <p className="text-sm text-zinc-500">ShopSaathi — fast billing</p>
        </div>
      </header>

      {saveError ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          role="alert"
        >
          {saveError}
        </p>
      ) : null}

      <div className="relative">
        <label className="sr-only" htmlFor="product-search">
          Product search
        </label>
        <input
          id="product-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Item ka naam likho..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-14 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-[#16a34a] focus:bg-white focus:ring-2 focus:ring-[#16a34a]/25"
        />
        {showSuggestions ? (
          <ul
            className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-zinc-200 bg-white py-1 shadow-lg"
            role="listbox"
          >
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  className="flex min-h-12 w-full items-center px-4 text-left text-base text-zinc-900 active:bg-green-50"
                  onClick={() => addProduct(p)}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {search.trim().length > 0 && filtered.length === 0 ? (
          <p className="mt-2 px-1 text-sm text-zinc-500">
            Koi item nahi mila — naam check karo
          </p>
        ) : null}
      </div>

      {search.trim().length >= 2 ? (
        <div className="rounded-2xl border border-green-100 bg-green-50/60 p-3 shadow-sm ring-1 ring-green-100/80">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#16a34a] ring-1 ring-green-200">
              ✨ AI
            </span>
            {aiSuggestLoading ? (
              <span className="flex items-center gap-1" aria-live="polite">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#16a34a] [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#16a34a] [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#16a34a]" />
              </span>
            ) : null}
          </div>
          {!aiSuggestLoading && aiSuggestions.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {aiSuggestions.map((s, idx) => (
                <li key={`${s.name}-${s.price}-${idx}`}>
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left text-sm font-medium text-zinc-900 ring-1 ring-zinc-100 active:bg-green-50"
                    onClick={() => addAiSuggestionToBill(s)}
                  >
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-[#16a34a]">
                      ₹{s.price % 1 === 0 ? s.price.toFixed(0) : s.price.toFixed(2)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="bill-items-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2
            id="bill-items-heading"
            className="text-sm font-semibold uppercase tracking-wide text-zinc-500"
          >
            Bill items
          </h2>
          <span className="text-xs text-zinc-400">{lines.length} lines</span>
        </div>

        {lines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-10 text-center text-sm text-zinc-500">
            Upar se item chuno — yahan list dikhegi
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map((l) => {
              const lineTotal = l.unitPrice * l.qty;
              return (
                <li
                  key={l.productId}
                  className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-base font-semibold leading-snug text-zinc-900">
                      {l.label}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeLine(l.productId)}
                      className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
                      aria-label="Remove item"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 rounded-full bg-zinc-100 p-1">
                      <button
                        type="button"
                        className="flex h-12 min-w-12 items-center justify-center rounded-full bg-white text-2xl font-semibold leading-none text-zinc-800 shadow-sm active:scale-95"
                        onClick={() => setQty(l.productId, l.qty - 1)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="min-w-10 px-1 text-center text-base font-bold tabular-nums text-zinc-900">
                        {l.qty}
                      </span>
                      <button
                        type="button"
                        className="flex h-12 min-w-12 items-center justify-center rounded-full bg-white text-2xl font-semibold leading-none text-zinc-800 shadow-sm active:scale-95"
                        onClick={() => setQty(l.productId, l.qty + 1)}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-500">
                        {formatRupee(l.unitPrice)} × {l.qty}
                      </p>
                      <p className="text-lg font-bold tabular-nums text-zinc-900">
                        {formatRupee(lineTotal)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div
        className="fixed left-0 right-0 z-40 mx-auto max-w-lg px-4"
        style={{
          bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3">
            <span className="text-base font-bold text-zinc-900">
              Kul Total:{" "}
              <span className="tabular-nums text-[#16a34a]">
                {formatRupee(total)}
              </span>
            </span>
            <label className="flex cursor-pointer items-center gap-2 rounded-full bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-800 active:bg-zinc-200">
              <input
                type="checkbox"
                checked={gstOn}
                onChange={(e) => setGstOn(e.target.checked)}
                disabled={saving}
                className="h-5 w-5 accent-[#16a34a]"
              />
              +18% GST
            </label>
          </div>
          {gstOn ? (
            <p className="mt-2 text-xs text-zinc-500">
              GST: {formatRupee(gstAmount)} · Without GST:{" "}
              {formatRupee(subtotal)}
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void saveCashBill()}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#16a34a] text-base font-bold text-white shadow-md active:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden>💵</span>
              {saving && !udharModalOpen ? "Saving…" : "Cash Bill Karo"}
            </button>
            <button
              type="button"
              disabled={lines.length === 0 || saving}
              onClick={() => {
                setSaveError(null);
                setUdharCustomerName("");
                setUdharModalOpen(true);
              }}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-base font-bold text-white shadow-md active:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden>📒</span>
              Udhar Mein Daalo
            </button>
          </div>
        </div>
      </div>

      {udharModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="udhar-customer-title"
        >
          <button
            type="button"
            className="min-h-12 flex-1"
            aria-label="Close"
            disabled={saving}
            onClick={() => {
              if (!saving) {
                setUdharModalOpen(false);
                setUdharCustomerName("");
              }
            }}
          />
          <div className="rounded-t-3xl bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-200" />
            <h2
              id="udhar-customer-title"
              className="text-lg font-bold text-zinc-900"
            >
              Customer ka naam
            </h2>
            <p className="text-sm text-zinc-500">Udhar bill ke liye</p>
            <label className="mt-4 block text-sm font-semibold text-zinc-700">
              Naam
              <input
                value={udharCustomerName}
                onChange={(e) => setUdharCustomerName(e.target.value)}
                className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
                placeholder="Jaise: Ramesh Verma"
                autoComplete="name"
                disabled={saving}
              />
            </label>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={!udharCustomerName.trim() || saving}
                onClick={() => void saveUdharBill(udharCustomerName)}
                className="min-h-14 w-full rounded-2xl bg-[#16a34a] text-base font-bold text-white active:bg-green-700 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save bill"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setUdharModalOpen(false);
                  setUdharCustomerName("");
                }}
                className="min-h-12 w-full rounded-2xl text-base font-semibold text-zinc-600 active:bg-zinc-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
