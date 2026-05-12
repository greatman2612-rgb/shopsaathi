"use client";

import { useShopId } from "@/hooks/useShopId";
import { usePlan } from "@/hooks/usePlan";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Product = { id: string; name: string; price: number; qty: number };

type PurchaseRow = {
  id: string;
  productName: string;
  qty: number;
  pricePerUnit: number;
  totalCost: number;
  supplierName: string;
  createdAt: string;
};

function formatRupee(n: number) {
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function mapPurchase(r: Record<string, unknown>): PurchaseRow {
  return {
    id: String(r.id ?? ""),
    productName: String(r.product_name ?? ""),
    qty: Math.floor(Number(r.qty ?? 0)),
    pricePerUnit: Number(r.price_per_unit ?? 0),
    totalCost: Number(r.total_cost ?? 0),
    supplierName: String(r.supplier_name ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

export default function PurchasePage() {
  const { shopId, loading: shopIdLoading } = useShopId();
  const { limits } = usePlan();
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [pricePer, setPricePer] = useState("");
  const [supplier, setSupplier] = useState("");
  const [dateStr, setDateStr] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [prRes, puRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, price, stock_qty")
          .eq("shop_id", shopId)
          .order("name", { ascending: true }),
        supabase
          .from("purchases")
          .select("*")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false }),
      ]);
      if (prRes.error) throw prRes.error;
      if (puRes.error) throw puRes.error;
      setProducts(
        ((prRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
          id: String(row.id ?? ""),
          name: String(row.name ?? ""),
          price: Number(row.price ?? 0),
          qty: Math.max(0, Math.floor(Number(row.stock_qty ?? 0))),
        })),
      );
      setPurchases(((puRes.data ?? []) as Record<string, unknown>[]).map(mapPurchase));
      const first = (prRes.data ?? [])[0] as { id?: string } | undefined;
      if (first?.id) setProductId((prev) => prev || String(first.id));
    } catch (e) {
      console.error(e);
      setProducts([]);
      setPurchases([]);
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

  const totalSpent = useMemo(
    () => purchases.reduce((s, p) => s + p.totalCost, 0),
    [purchases],
  );

  const save = async () => {
    if (!shopId || !limits.hasInventory) return;
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const q = Math.max(1, Math.floor(parseFloat(qty.replace(/[^\d.]/g, "")) || 0));
    const pp = Math.round(parseFloat(pricePer.replace(/[^\d.]/g, "")) * 100) / 100;
    if (!Number.isFinite(q) || q < 1 || !Number.isFinite(pp) || pp < 0) return;
    const total = Math.round(q * pp * 100) / 100;
    setSaving(true);
    try {
      const { error: insErr } = await supabase.from("purchases").insert({
        shop_id: shopId,
        product_id: p.id,
        product_name: p.name,
        qty: q,
        price_per_unit: pp,
        total_cost: total,
        supplier_name: supplier.trim(),
        created_at: new Date(`${dateStr}T12:00:00`).toISOString(),
      });
      if (insErr) throw insErr;
      const newStock = p.qty + q;
      const { error: upErr } = await supabase
        .from("products")
        .update({ stock_qty: newStock })
        .eq("id", p.id);
      if (upErr) throw upErr;
      setQty("");
      setPricePer("");
      setSupplier("");
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

  if (!limits.hasInventory) {
    return (
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-6 text-center shadow-sm">
        <p className="text-lg font-extrabold text-zinc-900">Stock / Kharidi — Pro plan</p>
        <p className="mt-2 text-sm text-zinc-600">Inventory ke saath hi khareed track hota hai.</p>
        <Link
          href="/more"
          className="mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#16a34a] px-5 text-sm font-bold text-white"
        >
          Upgrade
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Kharidi / Purchase</h1>
          <p className="text-sm text-zinc-500">Maal aaya — stock badhega</p>
        </div>
        <Link
          href="/more"
          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-sm"
        >
          Settings
        </Link>
      </header>

      <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <h2 className="text-sm font-bold text-zinc-900">Nayi kharidi</h2>
        <label className="mt-3 block text-xs font-semibold text-zinc-600">
          Product
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none focus:border-[#16a34a]"
          >
            {products.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} (stock: {x.qty})
              </option>
            ))}
          </select>
        </label>
        <label className="mt-2 block text-xs font-semibold text-zinc-600">
          Qty li / Purchased qty
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="numeric"
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-base font-semibold outline-none focus:border-[#16a34a]"
            placeholder="1"
          />
        </label>
        <label className="mt-2 block text-xs font-semibold text-zinc-600">
          Price per unit (₹) paid
          <input
            value={pricePer}
            onChange={(e) => setPricePer(e.target.value)}
            inputMode="decimal"
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none focus:border-[#16a34a]"
            placeholder="0"
          />
        </label>
        <label className="mt-2 block text-xs font-semibold text-zinc-600">
          Supplier (optional)
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none focus:border-[#16a34a]"
            placeholder="Name"
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
          disabled={saving || products.length === 0}
          onClick={() => void save()}
          className="mt-4 min-h-12 w-full rounded-2xl bg-[#16a34a] text-base font-bold text-white disabled:opacity-40"
        >
          Save &amp; stock badhao
        </button>
      </section>

      <section>
        <div className="mb-2 flex justify-between">
          <h2 className="text-sm font-bold uppercase text-zinc-500">Total kharidi</h2>
          <span className="text-sm font-extrabold">{formatRupee(totalSpent)}</span>
        </div>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : purchases.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
            Abhi koi entry nahi
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {purchases.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm"
              >
                <p className="font-bold text-zinc-900">{r.productName}</p>
                <p className="text-sm text-zinc-600">
                  {r.qty} × {formatRupee(r.pricePerUnit)} ={" "}
                  <span className="font-semibold text-[#16a34a]">
                    {formatRupee(r.totalCost)}
                  </span>
                </p>
                {r.supplierName ? (
                  <p className="text-xs text-zinc-500">Supplier: {r.supplierName}</p>
                ) : null}
                <p className="text-xs text-zinc-400">{r.createdAt.slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
