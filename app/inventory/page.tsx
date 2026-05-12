"use client";

import { useLocale } from "@/contexts/LocaleContext";
import { useShopId } from "@/hooks/useShopId";
import { usePlan } from "@/hooks/usePlan";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  price: number;
  qty: number;
  category: string;
};

const INVENTORY_CATEGORY_OPTIONS = [
  "Grocery",
  "Medical",
  "Electronics",
  "Clothing",
  "Other",
] as const;

const CORE_CATEGORIES = new Set([
  "Grocery",
  "Medical",
  "Electronics",
  "Clothing",
]);

function productMatchesCategoryTab(p: Product, tab: string) {
  if (tab === "All") return true;
  const c = p.category.trim();
  if (tab === "Other") return !CORE_CATEGORIES.has(c);
  return c === tab;
}

function formatRupee(n: number) {
  return `₹${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

function normalize(s: string) {
  return s.trim().toLowerCase();
}

function stockTextClass(qty: number) {
  if (qty >= 10) return "text-[#16a34a]";
  if (qty >= 5) return "text-orange-600";
  return "text-red-600";
}

function mapProductRow(data: Record<string, unknown>): Product {
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? ""),
    price: Number(data.price ?? 0),
    qty: Math.max(0, Math.floor(Number(data.stock_qty ?? 0))),
    category: String(data.category ?? "General"),
  };
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export default function InventoryPage() {
  const { t } = useLocale();
  const { shopId, loading: shopIdLoading } = useShopId();
  const { limits } = usePlan();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);
  const [stockBumpBusy, setStockBumpBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addCategory, setAddCategory] = useState<string>(
    INVENTORY_CATEGORY_OPTIONS[0],
  );
  const [categoryTab, setCategoryTab] = useState<string>("All");

  const loadProducts = useCallback(
    async (silent = false) => {
      if (!shopId) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("shop_id", shopId);
        if (error) throw error;
        const list = (data ?? []).map((row) =>
          mapProductRow(row as Record<string, unknown>),
        );
        list.sort((a, b) => a.name.localeCompare(b.name, "en"));
        setProducts(list);
      } catch (e) {
        console.error(e);
        setError("Firestore se load nahi ho paya — dubara try karo.");
        setProducts([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [shopId],
  );

  useEffect(() => {
    if (!shopIdLoading && !shopId) setLoading(false);
  }, [shopId, shopIdLoading]);

  useEffect(() => {
    if (!shopId) return;
    void loadProducts(false);
  }, [loadProducts, shopId]);

  const kamStockCount = useMemo(
    () => products.filter((p) => p.qty < 5).length,
    [products],
  );

  const tabCounts = useMemo(() => {
    const tabs = ["All", ...INVENTORY_CATEGORY_OPTIONS] as const;
    const out: Record<string, number> = {};
    for (const tab of tabs) {
      out[tab] = products.filter((p) =>
        productMatchesCategoryTab(p, tab),
      ).length;
    }
    return out;
  }, [products]);

  const filtered = useMemo(() => {
    const byCat = products.filter((p) =>
      productMatchesCategoryTab(p, categoryTab),
    );
    const q = normalize(search);
    if (!q) return byCat;
    return byCat.filter((p) => normalize(p.name).includes(q));
  }, [products, search, categoryTab]);

  const openEdit = (p: Product) => {
    setEditId(p.id);
    setEditName(p.name);
    setEditPrice(String(p.price));
    setEditQty(String(p.qty));
    setEditCategory(p.category);
  };

  const closeEdit = () => {
    setEditId(null);
    setEditName("");
    setEditPrice("");
    setEditQty("");
    setEditCategory("");
  };

  const bumpEditQty = async (delta: number) => {
    if (!editId || !shopId) return;
    const n = parseInt(editQty, 10);
    const base = Number.isFinite(n) ? n : 0;
    const newQty = Math.max(0, base + delta);

    setStockBumpBusy(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          stock_qty: newQty,
        })
        .eq("id", editId);
      if (error) throw error;
      setEditQty(String(newQty));
      setProducts((prev) =>
        prev.map((p) => (p.id === editId ? { ...p, qty: newQty } : p)),
      );
    } catch (e) {
      console.error(e);
      setError("Stock update fail — dubara try karo.");
    } finally {
      setStockBumpBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editId || !shopId) return;
    const name = editName.trim();
    const price = Math.round(parseFloat(editPrice) * 100) / 100;
    const qty = Math.max(0, Math.floor(parseFloat(editQty)));
    const category =
      editCategory.trim() &&
      (INVENTORY_CATEGORY_OPTIONS as readonly string[]).includes(
        editCategory.trim(),
      )
        ? editCategory.trim()
        : "Other";
    if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty))
      return;

    setSavingEdit(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          name,
          price,
          stock_qty: qty,
          category,
        })
        .eq("id", editId);
      if (error) throw error;
      await loadProducts(true);
      closeEdit();
    } catch (e) {
      console.error(e);
      setError("Save fail — dubara try karo.");
    } finally {
      setSavingEdit(false);
    }
  };

  const saveAdd = async () => {
    if (!shopId) return;
    const name = addName.trim();
    const price = Math.round(parseFloat(addPrice) * 100) / 100;
    const qty = Math.max(0, Math.floor(parseFloat(addQty)));
    const category =
      addCategory.trim() &&
      (INVENTORY_CATEGORY_OPTIONS as readonly string[]).includes(
        addCategory.trim(),
      )
        ? addCategory.trim()
        : "Other";
    if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty))
      return;

    setSavingAdd(true);
    setError(null);
    try {
      const { error } = await supabase.from("products").insert({
        shop_id: shopId,
        name,
        price,
        stock_qty: qty,
        category,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      await loadProducts(true);
      setAddName("");
      setAddPrice("");
      setAddQty("");
      setAddCategory(INVENTORY_CATEGORY_OPTIONS[0]);
      setAddOpen(false);
    } catch (e) {
      console.error(e);
      setError("Product save fail — dubara try karo.");
    } finally {
      setSavingAdd(false);
    }
  };

  return (
    <div className="relative flex flex-col gap-4 pb-28">
      <header>
        <h1 className="text-xl font-bold text-zinc-900">{t("invHeading")}</h1>
        <p className="text-sm text-zinc-500">{t("invSub")}</p>
      </header>

      {!limits.hasInventory ? (
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-5 text-center shadow-sm">
          <p className="text-lg font-extrabold text-zinc-900">
            Inventory feature Pro plan mein available hai! 🔒
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-600">
            Upgrade karo ₹399/month mein.
          </p>
          <Link
            href="/more"
            className="mx-auto mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#16a34a] px-5 text-sm font-bold text-white shadow-md active:bg-green-700"
          >
            Upgrade Karo
          </Link>
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {limits.hasInventory && loading ? (
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
      ) : limits.hasInventory ? (
        <>
          <section className="grid grid-cols-2 gap-3" aria-label="Summary">
            <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t("invTotalItems")}
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-zinc-900">
                {products.length}
              </p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-800/90">
                {t("invLowStock")}
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-red-600">
                {kamStockCount}
              </p>
              <p className="mt-0.5 text-[10px] font-medium text-orange-800/80">
                {t("invLowHint")}
              </p>
            </div>
          </section>

          <div
            className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Category filter"
          >
            {(["All", ...INVENTORY_CATEGORY_OPTIONS] as const).map((tab) => {
              const active = categoryTab === tab;
              const count = tabCounts[tab] ?? 0;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategoryTab(tab)}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold transition ${
                    active
                      ? "bg-[#16a34a] text-white shadow-sm"
                      : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/80"
                  }`}
                >
                  {tab === "All" ? "All" : tab}{" "}
                  <span
                    className={
                      active ? "text-white/90" : "text-zinc-500"
                    }
                  >
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          <label className="sr-only" htmlFor="inv-search">
            Product search
          </label>
          <input
            id="inv-search"
            type="search"
            placeholder={t("invSearchPh")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-14 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#16a34a] focus:bg-white focus:ring-2 focus:ring-[#16a34a]/25"
          />

          <section aria-label="Products" className="flex flex-col gap-3">
            {products.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
                <p className="text-3xl" aria-hidden>
                  📦
                </p>
                <p className="mt-2 font-semibold text-zinc-700">
                  Koi product nahi hai abhi.
                </p>
                <p className="mt-1">+ button se apne products add karo!</p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
                {products.length === 0
                  ? "Koi product nahi hai abhi."
                  : "Is category mein koi product nahi — aur tab try karo."}
              </p>
            ) : (
              filtered.map((p) => {
                const low = p.qty < 5;
                return (
                  <article
                    key={p.id}
                    className="flex gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-lg font-bold leading-snug text-zinc-900">
                          {p.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100"
                          aria-label={`Edit ${p.name}`}
                        >
                          <PencilIcon />
                        </button>
                      </div>
                      <p className="mt-1 text-xs font-medium text-zinc-500">
                        {p.category}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                            {t("invStock")}
                          </p>
                          <p
                            className={`text-xl font-extrabold tabular-nums ${stockTextClass(
                              p.qty,
                            )}`}
                          >
                            {p.qty}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                            {t("invPrice")}
                          </p>
                          <p className="text-lg font-bold tabular-nums text-zinc-900">
                            {formatRupee(p.price)}
                          </p>
                        </div>
                      </div>
                      {low ? (
                        <span className="mt-3 inline-flex items-center rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-800 ring-1 ring-orange-200/80">
                          ⚠️ {t("invLowBadge")}
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </section>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-[#16a34a] text-3xl font-light leading-none text-white shadow-lg ring-4 ring-white/80 active:scale-95"
            aria-label="Add new product"
          >
            +
          </button>

          {editId ? (
            <div
              className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-product-title"
            >
              <button
                type="button"
                className="min-h-12 flex-1"
                aria-label="Close"
                onClick={closeEdit}
              />
              <div className="max-h-[88dvh] overflow-auto rounded-t-3xl bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl">
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-200" />
                <h2
                  id="edit-product-title"
                  className="text-lg font-bold text-zinc-900"
                >
                  {t("invEditTitle")}
                </h2>
                <p className="text-sm text-zinc-500">{t("invEditSub")}</p>

                <label className="mt-4 block text-sm font-semibold text-zinc-700">
                  Name
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={savingEdit}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
                  />
                </label>
                <label className="mt-3 block text-sm font-semibold text-zinc-700">
                  Price (₹)
                  <input
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    disabled={savingEdit}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
                    inputMode="decimal"
                  />
                </label>
                <label className="mt-3 block text-sm font-semibold text-zinc-700">
                  {t("invQty")}
                  <input
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    disabled={savingEdit}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base font-semibold tabular-nums outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
                    inputMode="numeric"
                  />
                </label>
                <label className="mt-3 block text-sm font-semibold text-zinc-700">
                  Category
                  <select
                    value={
                      (INVENTORY_CATEGORY_OPTIONS as readonly string[]).includes(
                        editCategory,
                      )
                        ? editCategory
                        : "Other"
                    }
                    onChange={(e) => setEditCategory(e.target.value)}
                    disabled={savingEdit}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
                  >
                    {INVENTORY_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  {t("decreaseStock")}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[-1, -5, -10].map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={savingEdit || stockBumpBusy}
                      onClick={() => void bumpEditQty(d)}
                      className="min-h-12 rounded-2xl border border-zinc-200 text-sm font-bold text-zinc-800 hover:bg-red-50 active:bg-red-100 disabled:opacity-40"
                    >
                      {d}
                    </button>
                  ))}
                </div>

                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  {t("increaseStock")}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[5, 10, 20].map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={savingEdit || stockBumpBusy}
                      onClick={() => void bumpEditQty(d)}
                      className="min-h-12 rounded-2xl border border-zinc-200 text-sm font-bold text-zinc-800 hover:bg-green-50 active:bg-green-100 disabled:opacity-40"
                    >
                      +{d}
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => void saveEdit()}
                    className="min-h-14 w-full rounded-2xl bg-[#16a34a] text-base font-bold text-white active:bg-green-700 disabled:opacity-40"
                  >
                    {savingEdit ? t("saving") : t("invSave")}
                  </button>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={closeEdit}
                    className="min-h-12 w-full rounded-2xl text-base font-semibold text-zinc-600 active:bg-zinc-100 disabled:opacity-40"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {addOpen ? (
            <div
              className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/45"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-product-title"
            >
              <button
                type="button"
                className="min-h-12 flex-1"
                aria-label="Close"
                onClick={() => setAddOpen(false)}
              />
              <div className="max-h-[88dvh] overflow-auto rounded-t-3xl bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl">
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-200" />
                <h2
                  id="add-product-title"
                  className="text-lg font-bold text-zinc-900"
                >
                  {t("invAddTitle")}
                </h2>
                <p className="text-sm text-zinc-500">{t("invAddSub")}</p>

                <label className="mt-4 block text-sm font-semibold text-zinc-700">
                  Product Name
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    disabled={savingAdd}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
                    placeholder="e.g. Parle-G 50g"
                  />
                </label>
                <label className="mt-3 block text-sm font-semibold text-zinc-700">
                  Price (₹)
                  <input
                    value={addPrice}
                    onChange={(e) => setAddPrice(e.target.value)}
                    disabled={savingAdd}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
                    inputMode="decimal"
                  />
                </label>
                <label className="mt-3 block text-sm font-semibold text-zinc-700">
                  Starting Quantity
                  <input
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    disabled={savingAdd}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
                    inputMode="numeric"
                  />
                </label>
                <label className="mt-3 block text-sm font-semibold text-zinc-700">
                  Category
                  <select
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value)}
                    disabled={savingAdd}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
                  >
                    {INVENTORY_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-5 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void saveAdd()}
                    disabled={
                      savingAdd ||
                      !addName.trim() ||
                      !Number.isFinite(parseFloat(addPrice)) ||
                      parseFloat(addPrice) < 0 ||
                      !Number.isFinite(parseFloat(addQty))
                    }
                    className="min-h-14 w-full rounded-2xl bg-[#16a34a] text-base font-bold text-white active:bg-green-700 disabled:opacity-40"
                  >
                    {savingAdd ? t("saving") : t("invSaveProduct")}
                  </button>
                  <button
                    type="button"
                    disabled={savingAdd}
                    onClick={() => setAddOpen(false)}
                    className="min-h-12 w-full rounded-2xl text-base font-semibold text-zinc-600 active:bg-zinc-100 disabled:opacity-40"
                  >
                    {t("invClose")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
