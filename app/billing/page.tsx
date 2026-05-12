"use client";

import { useLocale } from "@/contexts/LocaleContext";
import { useShopId } from "@/hooks/useShopId";
import { usePlan } from "@/hooks/usePlan";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { allocateNextBillNumber } from "@/lib/allocateBillNumber";
import { buildUpiQrImageUrl } from "@/lib/upiQr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Product = {
  id: string;
  /** Full label as in inventory, e.g. "Parle-G 50g ₹5" */
  label: string;
  name: string;
  price: number;
};

type BillLine = {
  productId: string;
  label: string;
  unitPrice: number;
  qty: number;
};

type PaymentKind = "cash" | "udhar";
type CashPaymentMode = "cash" | "upi" | "card" | "bank";

type DoneBillState = {
  payment: PaymentKind;
  isEstimate: boolean;
  billNumber: string | null;
  lines: BillLine[];
  subtotal: number;
  discountAmount: number;
  afterDiscount: number;
  gstAmount: number;
  total: number;
  gstApplied: boolean;
  paymentMode: string | null;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  upiId: string | null;
};

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

function labelWithPrice(name: string, unitPrice: number) {
  const p = Math.round(unitPrice * 100) / 100;
  const rupeePart = p % 1 === 0 ? p.toFixed(0) : p.toFixed(2);
  return `${name.trim()} ₹${rupeePart}`;
}

function newAiLineId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `ai:${crypto.randomUUID()}`;
  }
  return `ai:${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newManualLineId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `manual:${crypto.randomUUID()}`;
  }
  return `manual:${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type AiSuggestion = { name: string; price: number };

/** Max catalogue rows before showing “add new” footer (more matches exist off-screen). */
const SEARCH_RESULTS_CAP = 12;

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
  billNumber: string;
  paymentMode?: string | null;
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
    bill_number: opts.billNumber,
  };
  if (opts.paymentMode != null && opts.paymentMode !== "")
    payload.payment_mode = opts.paymentMode;
  if (opts.isUdhar && opts.customerName) {
    payload.customer_name = opts.customerName;
    if (opts.customerId) payload.customer_id = opts.customerId;
  }
  const { error } = await supabase.from("bills").insert(payload);
  if (error) throw error;
}

export default function BillingPage() {
  const { t } = useLocale();
  const { shopId, loading: shopIdLoading } = useShopId();
  const { plan, limits, billsThisMonth, canMakeBill } = usePlan();
  const [products, setProducts] = useState<Product[]>([]);
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
  const [done, setDone] = useState<DoneBillState | null>(null);
  const [cashPaymentModalOpen, setCashPaymentModalOpen] = useState(false);
  const [cashModalIntent, setCashModalIntent] = useState<"new" | "convert">("new");
  const estimateConvertRef = useRef<DoneBillState | null>(null);
  const [discountInput, setDiscountInput] = useState("");
  const [rateEditor, setRateEditor] = useState<{
    productId: string;
    draft: string;
  } | null>(null);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQty, setCustomQty] = useState("1");

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return [];
    return products.filter(
      (p) =>
        normalize(p.name).includes(q) ||
        normalize(p.label).includes(q) ||
        normalize(p.label.replace(/₹\d+/, "")).includes(q),
    );
  }, [search, products]);

  const visibleProducts = useMemo(
    () => filtered.slice(0, SEARCH_RESULTS_CAP),
    [filtered],
  );
  const hasHiddenMatches = filtered.length > SEARCH_RESULTS_CAP;

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
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("shop_id", shopId)
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("load billing products failed:", error);
        setProducts([]);
        return;
      }
      const mapped = ((data as Record<string, unknown>[] | null) ?? []).map((row) => {
        const id = String(row.id ?? "");
        const name = String(row.name ?? "").trim();
        const price = Number(row.price ?? 0);
        const displayPrice = price % 1 === 0 ? price.toFixed(0) : price.toFixed(2);
        return {
          id,
          name,
          price,
          label: `${name} ₹${displayPrice}`,
        };
      });
      setProducts(
        mapped.filter(
          (p) => p.id && p.name && Number.isFinite(p.price) && p.price >= 0,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  useEffect(() => {
    if (!shopId || !limits.hasAI) return;
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
  }, [search, shopType, shopId, limits.hasAI]);

  const addCustomLineToBill = useCallback(() => {
    const name = customName.trim().slice(0, 120);
    const price = Math.round(parseFloat(customPrice.replace(/[^\d.]/g, "")) * 100) / 100;
    const qty = Math.max(1, Math.floor(parseFloat(customQty.replace(/[^\d.]/g, "")) || 1));
    if (!name || !Number.isFinite(price) || price < 0) return;
    const id = newManualLineId();
    const label = labelWithPrice(name, price);
    setLines((prev) => [
      ...prev,
      {
        productId: id,
        label,
        unitPrice: price,
        qty,
      },
    ]);
    setCustomItemOpen(false);
    setCustomName("");
    setCustomPrice("");
    setCustomQty("1");
    setSearch("");
  }, [customName, customPrice, customQty]);

  const openQuickAddSheet = useCallback(() => {
    const q = search.trim().slice(0, 120);
    if (!q) return;
    setCustomName(q);
    setCustomPrice("");
    setCustomQty("1");
    setCustomItemOpen(true);
    setSaveError(null);
  }, [search]);

  const addAiSuggestionToBill = useCallback((s: AiSuggestion) => {
    const name = s.name.trim().slice(0, 120);
    const price = Math.round(s.price * 100) / 100;
    if (!name || !Number.isFinite(price) || price < 0) return;
    const id = newAiLineId();
    const label = labelWithPrice(name, price);
    setLines((prev) => [
      ...prev,
      {
        productId: id,
        label,
        unitPrice: price,
        qty: 1,
      },
    ]);
    setSearch("");
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
    [lines],
  );

  const parsedDiscount = useMemo(() => {
    const raw = discountInput.replace(/[^\d.]/g, "");
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100) / 100;
  }, [discountInput]);

  const discountAmount = useMemo(
    () => Math.min(parsedDiscount, subtotal),
    [parsedDiscount, subtotal],
  );

  const afterDiscount = useMemo(
    () => Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100),
    [subtotal, discountAmount],
  );

  const gstAmount = gstOn
    ? Math.round(afterDiscount * 0.18 * 100) / 100
    : 0;
  const total = Math.round((afterDiscount + gstAmount) * 100) / 100;

  const updateLineUnitPrice = useCallback((productId: string, unitPrice: number) => {
    const p = Math.round(unitPrice * 100) / 100;
    if (!Number.isFinite(p) || p < 0) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const name = lineItemName(l.label);
        return { ...l, unitPrice: p, label: labelWithPrice(name, p) };
      }),
    );
  }, []);

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
    setDiscountInput("");
    setRateEditor(null);
    setCustomItemOpen(false);
    setCustomName("");
    setCustomPrice("");
    setCustomQty("1");
    setCashPaymentModalOpen(false);
    setCashModalIntent("new");
    estimateConvertRef.current = null;
  }, []);

  const buildWhatsAppText = useCallback(
    (opts: {
      snapshot: BillLine[];
      grandTotal: number;
      discountRupee?: number;
      billNumber?: string | null;
      upiId?: string | null;
      isEstimate?: boolean;
    }) => {
      const {
        snapshot,
        grandTotal,
        discountRupee,
        billNumber,
        upiId,
        isEstimate,
      } = opts;
      const itemParts = snapshot.map((l) => {
        const nameOnly = lineItemName(l.label);
        return `${nameOnly} x${l.qty}`;
      });
      const head = isEstimate
        ? "ShopSaathi Estimate (not a bill)"
        : "ShopSaathi Bill";
      const linesOut = [head];
      if (billNumber) linesOut.push(`Bill No: ${billNumber}`);
      linesOut.push(`Items: ${itemParts.join(", ")}`);
      if (discountRupee != null && discountRupee > 0) {
        linesOut.push(`Discount: ${formatRupee(discountRupee)}`);
      }
      linesOut.push(`Total: ${formatRupee(grandTotal)}`);
      if (upiId && upiId.trim()) linesOut.push(`UPI: ${upiId.trim()}`);
      linesOut.push("Thank you!");
      return linesOut.join("\n");
    },
    [],
  );

  const openWhatsApp = useCallback(
    (opts: {
      snapshot: BillLine[];
      grandTotal: number;
      discountRupee?: number;
      billNumber?: string | null;
      upiId?: string | null;
      isEstimate?: boolean;
    }) => {
      const text = buildWhatsAppText(opts);
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [buildWhatsAppText],
  );

  const fetchShopMeta = useCallback(async () => {
    if (!shopId) return null;
    const { data } = await supabase
      .from("shops")
      .select("upi_id, shop_name, phone, shop_address")
      .eq("id", shopId)
      .maybeSingle();
    const row = data as Record<string, unknown> | null;
    return {
      shopName: String(row?.shop_name ?? "Shop"),
      shopPhone: String(row?.phone ?? ""),
      shopAddress: String(row?.shop_address ?? ""),
      upiId: String(row?.upi_id ?? "").trim() || null,
    };
  }, [shopId]);

  const showEstimateSuccess = useCallback(async () => {
    if (lines.length === 0 || !shopId) return;
    const meta = await fetchShopMeta();
    if (!meta) return;
    const linesSnapshot = lines.map((l) => ({ ...l }));
    setDone({
      isEstimate: true,
      billNumber: null,
      payment: "cash",
      paymentMode: null,
      lines: linesSnapshot,
      subtotal,
      discountAmount,
      afterDiscount,
      gstAmount,
      total,
      gstApplied: gstOn,
      ...meta,
    });
  }, [
    lines,
    shopId,
    subtotal,
    discountAmount,
    afterDiscount,
    gstAmount,
    total,
    gstOn,
    fetchShopMeta,
  ]);

  const startCashBillFlow = useCallback(() => {
    setSaveError(null);
    setCashModalIntent("new");
    setCashPaymentModalOpen(true);
  }, []);

  const confirmCashPayment = useCallback(
    async (mode: CashPaymentMode) => {
      if (lines.length === 0 || !shopId) return;
      const linesSnapshot = lines.map((l) => ({ ...l }));
      setSaving(true);
      setSaveError(null);
      try {
        const billNumber = await allocateNextBillNumber(supabase, shopId);
        await persistBill({
          shopId,
          isUdhar: false,
          linesSnapshot,
          grandTotal: total,
          gstApplied: gstOn,
          billNumber,
          paymentMode: mode,
        });
        const meta = await fetchShopMeta();
        setCashPaymentModalOpen(false);
        setDone({
          isEstimate: false,
          billNumber,
          payment: "cash",
          paymentMode: mode,
          lines: linesSnapshot,
          subtotal,
          discountAmount,
          afterDiscount,
          gstAmount,
          total,
          gstApplied: gstOn,
          shopName: meta?.shopName ?? "Shop",
          shopPhone: meta?.shopPhone ?? "",
          shopAddress: meta?.shopAddress ?? "",
          upiId: meta?.upiId ?? null,
        });
      } catch (e) {
        console.error(e);
        setSaveError(t("saveFailed"));
      } finally {
        setSaving(false);
      }
    },
    [
      lines,
      shopId,
      total,
      gstOn,
      subtotal,
      discountAmount,
      afterDiscount,
      gstAmount,
      fetchShopMeta,
      t,
    ],
  );

  const startConvertEstimateFlow = useCallback(() => {
    if (!done?.isEstimate) return;
    estimateConvertRef.current = done;
    setCashModalIntent("convert");
    setCashPaymentModalOpen(true);
  }, [done]);

  const confirmConvertEstimate = useCallback(
    async (mode: CashPaymentMode) => {
      const snap = estimateConvertRef.current;
      if (!snap || !shopId) return;
      setSaving(true);
      setSaveError(null);
      try {
        const billNumber = await allocateNextBillNumber(supabase, shopId);
        await persistBill({
          shopId,
          isUdhar: false,
          linesSnapshot: snap.lines,
          grandTotal: snap.total,
          gstApplied: snap.gstApplied,
          billNumber,
          paymentMode: mode,
        });
        const meta = await fetchShopMeta();
        estimateConvertRef.current = null;
        setCashPaymentModalOpen(false);
        setDone({
          ...snap,
          isEstimate: false,
          billNumber,
          paymentMode: mode,
          shopName: meta?.shopName ?? snap.shopName,
          shopPhone: meta?.shopPhone ?? snap.shopPhone,
          shopAddress: meta?.shopAddress ?? snap.shopAddress,
          upiId: meta?.upiId ?? snap.upiId,
        });
      } catch (e) {
        console.error(e);
        setSaveError(t("saveFailed"));
      } finally {
        setSaving(false);
      }
    },
    [shopId, fetchShopMeta, t],
  );

  const saveUdharBill = async (customerName: string) => {
    if (!shopId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const linesSnapshot = lines.map((l) => ({ ...l }));
      const billTotal = total;
      const billItems = linesSnapshot.map((i) => ({
        label: i.label,
        price: i.unitPrice,
        qty: i.qty,
      }));

      const billNumber = await allocateNextBillNumber(supabase, shopId);

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
        const newUdhar = Number(customer.total_udhar) + billTotal;
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
            total_udhar: billTotal,
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
        amount: billTotal,
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
        total: billTotal,
        is_udhar: true,
        gst_applied: gstOn,
        created_at: new Date().toISOString(),
        bill_number: billNumber,
        payment_mode: "udhar",
      });

      const meta = await fetchShopMeta();
      setUdharModalOpen(false);
      setUdharCustomerName("");
      setDone({
        payment: "udhar",
        isEstimate: false,
        billNumber,
        lines: linesSnapshot,
        subtotal,
        discountAmount,
        afterDiscount,
        gstAmount,
        total: billTotal,
        gstApplied: gstOn,
        paymentMode: "udhar",
        shopName: meta?.shopName ?? "Shop",
        shopPhone: meta?.shopPhone ?? "",
        shopAddress: meta?.shopAddress ?? "",
        upiId: meta?.upiId ?? null,
      });
    } catch (e: any) {
      console.error("saveUdharBill error:", e);
      setSaveError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    const payLabel = done.isEstimate
      ? "Estimate (bill save nahi hua)"
      : done.payment === "cash"
        ? t("doneCash")
        : t("doneUdhar");
    const paymentBadge =
      done.payment === "cash" && done.paymentMode
        ? {
            cash: "💵 Cash",
            upi: "📱 UPI",
            card: "💳 Card",
            bank: "🏦 Bank",
          }[done.paymentMode] ?? done.paymentMode
        : null;
    const qrUrl =
      done.upiId && done.upiId.trim()
        ? buildUpiQrImageUrl(
            done.upiId.trim(),
            done.total,
            done.isEstimate ? "ShopSaathi Estimate" : "ShopSaathi Bill",
          )
        : null;
    const billDate = formatShortDate(new Date());

    return (
      <>
        <div className="no-print flex flex-col gap-5 pb-6">
        <h1 className="text-lg font-bold text-zinc-900">{t("billingSlash")}</h1>

        <div
          className="relative overflow-hidden rounded-2xl border border-green-100 bg-green-50/80 p-4 shadow-sm ring-1 ring-green-100"
          role="status"
        >
          {done.isEstimate ? (
            <p
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-4xl font-black uppercase tracking-widest text-zinc-400/25"
              aria-hidden
            >
              ESTIMATE
            </p>
          ) : null}
          <p className="text-center text-lg font-bold text-[#16a34a]">
            {t("doneTitle")}
          </p>
          <p className="mt-1 text-center text-sm text-zinc-600">{payLabel}</p>
          {done.billNumber ? (
            <p className="mt-2 text-center text-sm font-bold text-zinc-800">
              Bill No: {done.billNumber}
            </p>
          ) : null}
          {paymentBadge ? (
            <p className="mt-1 text-center text-xs font-semibold text-zinc-600">
              Payment: {paymentBadge}
            </p>
          ) : null}

          <ul className="relative z-[1] mt-4 space-y-2 border-t border-green-100/80 pt-3 text-sm text-zinc-800">
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

          <div className="relative z-[1] mt-3 space-y-1 border-t border-green-100/80 pt-3 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>{t("subtotal")}</span>
              <span className="tabular-nums">{formatRupee(done.subtotal)}</span>
            </div>
            {done.discountAmount > 0 ? (
              <div className="flex justify-between text-zinc-600">
                <span>{t("discountLine")}</span>
                <span className="tabular-nums">−{formatRupee(done.discountAmount)}</span>
              </div>
            ) : null}
            {done.discountAmount > 0 ? (
              <div className="flex justify-between text-zinc-500 text-xs">
                <span>{t("afterDiscount")}</span>
                <span className="tabular-nums">{formatRupee(done.afterDiscount)}</span>
              </div>
            ) : null}
            {done.gstAmount > 0 ? (
              <div className="flex justify-between text-zinc-600">
                <span>{t("gstLine")}</span>
                <span className="tabular-nums">
                  {formatRupee(done.gstAmount)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold text-zinc-900">
              <span>{t("finalTotal")}</span>
              <span className="tabular-nums text-[#16a34a]">
                {formatRupee(done.total)}
              </span>
            </div>
          </div>

          {qrUrl ? (
            <div className="relative z-[1] mt-4 flex flex-col items-center border-t border-green-100/80 pt-4">
              <img
                src={qrUrl}
                alt="UPI QR"
                width={150}
                height={150}
                className="rounded-xl border border-zinc-200 bg-white p-1"
              />
              <p className="mt-2 text-center text-sm font-semibold text-zinc-700">
                UPI se payment karo
              </p>
              {done.upiId ? (
                <p className="text-xs text-zinc-500">{done.upiId}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          {done.isEstimate ? (
            <button
              type="button"
              onClick={() => startConvertEstimateFlow()}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#16a34a] bg-white text-base font-bold text-[#16a34a] shadow-sm active:bg-green-50"
            >
              Convert to Bill
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              openWhatsApp({
                snapshot: done.lines,
                grandTotal: done.total,
                discountRupee: done.discountAmount,
                billNumber: done.billNumber,
                upiId: done.upiId,
                isEstimate: done.isEstimate,
              })
            }
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-900 shadow-sm active:bg-zinc-50"
          >
            <span aria-hidden>📲</span>
            {t("whatsappShare")}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-900 shadow-sm active:bg-zinc-50"
          >
            PDF Download karo
          </button>
          <button
            type="button"
            onClick={resetBill}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#16a34a] text-base font-bold text-white shadow-md active:bg-green-700"
          >
            {t("newBill")}
          </button>
        </div>
        </div>

        <div id="printable-bill" className="printable-bill">
          <div className="bill-print-header">
            <h2 className="text-xl font-bold">{done.shopName}</h2>
            {done.shopAddress ? <p className="text-sm">{done.shopAddress}</p> : null}
            <p className="text-sm">Phone: {done.shopPhone || "—"}</p>
            <p className="mt-2 text-sm">
              {done.isEstimate ? "ESTIMATE" : "TAX INVOICE"} ·{" "}
              {done.billNumber ?? "—"} · {billDate}
            </p>
          </div>
          <table className="bill-print-table mt-4 w-full text-left text-sm">
            <thead>
              <tr>
                <th className="border-b py-1">Item</th>
                <th className="border-b py-1">Qty</th>
                <th className="border-b py-1">Rate</th>
                <th className="border-b py-1 text-right">Amt</th>
              </tr>
            </thead>
            <tbody>
              {done.lines.map((l) => (
                <tr key={l.productId}>
                  <td className="py-1 pr-2">{lineItemName(l.label)}</td>
                  <td className="py-1">{l.qty}</td>
                  <td className="py-1">{formatRupee(l.unitPrice)}</td>
                  <td className="py-1 text-right tabular-nums">
                    {formatRupee(l.unitPrice * l.qty)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 space-y-1 text-sm">
            <p>Subtotal: {formatRupee(done.subtotal)}</p>
            {done.discountAmount > 0 ? (
              <p>Discount: −{formatRupee(done.discountAmount)}</p>
            ) : null}
            {done.gstAmount > 0 ? <p>GST 18%: {formatRupee(done.gstAmount)}</p> : null}
            <p className="text-lg font-bold">Total: {formatRupee(done.total)}</p>
          </div>
          {qrUrl ? (
            <div className="mt-4 text-center">
              <img src={qrUrl} alt="" width={120} height={120} className="mx-auto" />
              <p className="text-xs">UPI: {done.upiId}</p>
            </div>
          ) : null}
          <p className="mt-6 text-center text-sm">Thank you!</p>
        </div>
      </>
    );
  }

  const canSubmit = lines.length > 0 && !saving;
  const searchTrim = search.trim();
  const showSearchDropdown = searchTrim.length > 0;
  const quickAddDisplay =
    searchTrim.length > 60 ? `${searchTrim.slice(0, 57)}…` : searchTrim;

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
        <p className="text-sm font-medium text-zinc-500">{t("loading")}</p>
      </div>
    );
  }

  if (!canMakeBill) {
    return (
      <div className="flex min-h-[75dvh] flex-col items-center justify-center gap-4 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-6 text-center shadow-sm">
        <p className="text-lg font-extrabold text-red-700">
          {t("planLimitTitle")}
        </p>
        <p className="text-sm font-medium leading-relaxed text-orange-900/80">
          {t("planLimitBody")}
        </p>
        <Link
          href="/more"
          className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#16a34a] px-5 text-sm font-bold text-white shadow-md active:bg-green-700"
        >
          {t("upgrade")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-[calc(17rem+env(safe-area-inset-bottom))]">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">{t("billingHeading")}</h1>
          <p className="text-sm text-zinc-500">{t("billingSub")}</p>
        </div>
      </header>

      {plan === "free" ? (
        <div
          className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
            billsThisMonth > 20
              ? "border-orange-300 bg-orange-50 text-orange-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {t("freePlanBanner")} {billsThisMonth}/30 {t("billsUsedSuffix")}
        </div>
      ) : null}

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
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-14 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-[#16a34a] focus:bg-white focus:ring-2 focus:ring-[#16a34a]/25"
        />
        {showSearchDropdown ? (
          <ul
            className="absolute z-20 mt-1 flex max-h-72 w-full flex-col overflow-auto rounded-2xl border border-zinc-200 bg-white py-1 shadow-lg"
            role="listbox"
            aria-label="Search results"
          >
            {filtered.length === 0 ? (
              <li>
                <button
                  type="button"
                  role="option"
                  className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-base text-zinc-900 active:bg-green-50"
                  onClick={() => openQuickAddSheet()}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-lg font-bold leading-none text-[#16a34a] ring-1 ring-green-200"
                    aria-hidden
                  >
                    +
                  </span>
                  <span className="min-w-0 flex-1 leading-snug text-zinc-900">
                    <span className="font-medium text-zinc-800">
                      {'"'}{quickAddDisplay}{'"'}
                    </span>{" "}
                    <span className="text-zinc-600">{t("searchAddBillSuffix")}</span>
                  </span>
                </button>
              </li>
            ) : (
              <>
                {visibleProducts.map((p) => (
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
                {hasHiddenMatches ? (
                  <li className="sticky bottom-0 border-t border-zinc-100 bg-white">
                    <button
                      type="button"
                      className="flex min-h-12 w-full items-center px-4 text-left text-sm font-semibold text-[#16a34a] active:bg-green-50"
                      onClick={() => openQuickAddSheet()}
                    >
                      {t("searchNotFoundAddFooter")}
                    </button>
                  </li>
                ) : null}
              </>
            )}
          </ul>
        ) : null}
        {search.trim().length === 0 && products.length === 0 ? (
          <p className="mt-2 px-1 text-sm text-zinc-500">{t("emptyInventoryHint")}</p>
        ) : null}
      </div>

      {limits.hasAI && search.trim().length >= 2 ? (
        <div className="rounded-2xl border border-green-100 bg-green-50/60 p-3 shadow-sm ring-1 ring-green-100/80">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#16a34a] ring-1 ring-green-200">
              ✨ {t("aiBadge")}
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
            {t("billItems")}
          </h2>
          <span className="text-xs text-zinc-400">
            {lines.length} {t("linesCount")}
          </span>
        </div>

        {lines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-10 text-center text-sm text-zinc-500">
            {t("emptyCart")}
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
                      aria-label={t("removeItem")}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setRateEditor({
                          productId: l.productId,
                          draft: String(l.unitPrice),
                        })
                      }
                      className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-800 active:bg-green-50"
                    >
                      {t("editRate")}
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 rounded-full bg-zinc-100 p-1">
                      <button
                        type="button"
                        className="flex h-12 min-w-12 items-center justify-center rounded-full bg-white text-2xl font-semibold leading-none text-zinc-800 shadow-sm active:scale-95"
                        onClick={() => setQty(l.productId, l.qty - 1)}
                        aria-label={t("decreaseQty")}
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
                        aria-label={t("increaseQty")}
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
              {t("grandTotal")}:{" "}
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
              {t("gstCheckbox")}
            </label>
          </div>
          {gstOn ? (
            <p className="mt-2 text-xs text-zinc-500">
              {t("gstBreakdown")}: {formatRupee(gstAmount)} · {t("afterDiscount")}:{" "}
              {formatRupee(afterDiscount)}
            </p>
          ) : null}

          <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-zinc-500">
            {t("discountLabel")}
            <input
              type="text"
              inputMode="decimal"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              disabled={saving}
              placeholder="0"
              className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-base font-semibold tabular-nums outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
            />
          </label>
          <p className="mt-1 text-[11px] text-zinc-400">{t("discountHint")}</p>
          {discountAmount > 0 ? (
            <p className="mt-1 text-xs font-medium text-zinc-600">
              {t("afterDiscount")}: {formatRupee(afterDiscount)}
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => startCashBillFlow()}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#16a34a] text-base font-bold text-white shadow-md active:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden>💵</span>
              {saving && cashPaymentModalOpen ? t("saving") : t("cashBill")}
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
              {t("udharBill")}
            </button>
            <button
              type="button"
              disabled={!canSubmit || saving}
              onClick={() => void showEstimateSuccess()}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#16a34a] bg-white text-base font-bold text-[#16a34a] shadow-sm active:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden>📋</span>
              Estimate Banao
            </button>
          </div>
        </div>
      </div>

      {cashPaymentModalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cash-payment-title"
        >
          <button
            type="button"
            className="min-h-12 flex-1"
            aria-label="Close"
            disabled={saving}
            onClick={() => {
              if (!saving) {
                setCashPaymentModalOpen(false);
                setCashModalIntent("new");
              }
            }}
          />
          <div className="rounded-t-3xl bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-200" />
            <h2
              id="cash-payment-title"
              className="text-lg font-bold text-zinc-900"
            >
              Payment mode chuno
            </h2>
            <p className="text-sm text-zinc-500">
              Cash bill ke liye — kaise pay hua?
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(
                [
                  ["cash", "💵 Cash"],
                  ["upi", "📱 UPI"],
                  ["card", "💳 Card"],
                  ["bank", "🏦 Bank Transfer"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void (cashModalIntent === "convert"
                      ? confirmConvertEstimate(mode)
                      : confirmCashPayment(mode))
                  }
                  className="min-h-14 rounded-2xl border-2 border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-800 active:bg-green-50 disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setCashPaymentModalOpen(false);
                setCashModalIntent("new");
              }}
              className="mt-3 min-h-12 w-full rounded-2xl text-base font-semibold text-zinc-600 active:bg-zinc-100"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}

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
              {t("udharCustomerTitle")}
            </h2>
            <p className="text-sm text-zinc-500">{t("udharCustomerSub")}</p>
            <label className="mt-4 block text-sm font-semibold text-zinc-700">
              {t("nameLabel")}
              <input
                value={udharCustomerName}
                onChange={(e) => setUdharCustomerName(e.target.value)}
                className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
                placeholder={t("udharPlaceholder")}
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
                {saving ? t("saving") : t("saveBill")}
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
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rateEditor ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rate-editor-title"
        >
          <button
            type="button"
            className="min-h-12 flex-1"
            aria-label={t("cancel")}
            disabled={saving}
            onClick={() => setRateEditor(null)}
          />
          <div className="rounded-t-3xl bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-200" />
            <h2 id="rate-editor-title" className="text-lg font-bold text-zinc-900">
              {t("rateSheetTitle")}
            </h2>
            <input
              value={rateEditor.draft}
              onChange={(e) =>
                setRateEditor((prev) =>
                  prev ? { ...prev, draft: e.target.value } : prev,
                )
              }
              className="mt-3 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base font-semibold tabular-nums outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
              inputMode="decimal"
              autoFocus
            />
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className="min-h-14 w-full rounded-2xl bg-[#16a34a] text-base font-bold text-white active:bg-green-700"
                onClick={() => {
                  const raw = rateEditor.draft.replace(/[^\d.]/g, "");
                  const n = parseFloat(raw);
                  if (Number.isFinite(n) && n >= 0) {
                    updateLineUnitPrice(rateEditor.productId, n);
                  }
                  setRateEditor(null);
                }}
              >
                {t("rateSave")}
              </button>
              <button
                type="button"
                className="min-h-12 w-full rounded-2xl text-base font-semibold text-zinc-600 active:bg-zinc-100"
                onClick={() => setRateEditor(null)}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {customItemOpen ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-item-title"
        >
          <button
            type="button"
            className="min-h-12 flex-1"
            aria-label={t("cancel")}
            disabled={saving}
            onClick={() => {
              if (!saving) setCustomItemOpen(false);
            }}
          />
          <div className="max-h-[90dvh] overflow-auto rounded-t-3xl bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-200" />
            <h2 id="custom-item-title" className="text-lg font-bold text-zinc-900">
              {t("customItemTitle")}
            </h2>
            <p className="text-sm text-zinc-500">{t("customItemSubtitle")}</p>

            <label className="mt-4 block text-sm font-semibold text-zinc-700">
              {t("customItemName")}
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
                placeholder={t("searchPlaceholder")}
                autoComplete="off"
                disabled={saving}
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-zinc-700">
              {t("customItemPrice")}
              <input
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base font-semibold tabular-nums outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
                inputMode="decimal"
                placeholder="0"
                disabled={saving}
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-zinc-700">
              {t("customItemQty")}
              <input
                value={customQty}
                onChange={(e) => setCustomQty(e.target.value)}
                className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base font-semibold tabular-nums outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
                inputMode="numeric"
                placeholder="1"
                disabled={saving}
              />
            </label>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={
                  saving ||
                  !customName.trim() ||
                  !Number.isFinite(
                    Math.round(
                      parseFloat(customPrice.replace(/[^\d.]/g, "")) * 100,
                    ) / 100,
                  ) ||
                  Math.round(parseFloat(customPrice.replace(/[^\d.]/g, "")) * 100) /
                    100 <
                    0
                }
                onClick={() => addCustomLineToBill()}
                className="min-h-14 w-full rounded-2xl bg-[#16a34a] text-base font-bold text-white active:bg-green-700 disabled:opacity-40"
              >
                {t("customItemAdd")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setCustomItemOpen(false)}
                className="min-h-12 w-full rounded-2xl text-base font-semibold text-zinc-600 active:bg-zinc-100"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
