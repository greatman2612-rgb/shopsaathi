"use client";

import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

const SHOP_ID = "shop001";

type Product = {
  id: string;
  name: string;
  price: number;
  qty: number;
  category: string;
};

const SEED_PRODUCTS: Omit<Product, "id">[] = [
  { name: "Parle-G 50g", price: 5, qty: 24, category: "Biscuit" },
  { name: "Tata Salt 1kg", price: 22, qty: 3, category: "Grocery" },
  { name: "Surf Excel 200g", price: 45, qty: 8, category: "Detergent" },
  { name: "Maggi 70g", price: 14, qty: 2, category: "Noodles" },
  { name: "Amul Butter 100g", price: 55, qty: 12, category: "Dairy" },
  { name: "Colgate 100g", price: 40, qty: 4, category: "Toothpaste" },
  { name: "Britannia Bread", price: 35, qty: 6, category: "Bakery" },
  { name: "Dettol Soap", price: 38, qty: 1, category: "Soap" },
];

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
  const [addCategory, setAddCategory] = useState("");

  const loadProducts = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        let { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("shop_id", SHOP_ID);
        if (error) throw error;
        if ((data ?? []).length === 0) {
          for (const p of SEED_PRODUCTS) {
            const { error: insError } = await supabase.from("products").insert({
              shop_id: SHOP_ID,
              name: p.name,
              price: p.price,
              stock_qty: p.qty,
              category: p.category,
              created_at: new Date().toISOString(),
            });
            if (insError) break;
          }
          const r2 = await supabase
            .from("products")
            .select("*")
            .eq("shop_id", SHOP_ID);
          data = r2.data ?? [];
        }
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
    [],
  );

  useEffect(() => {
    void loadProducts(false);
  }, [loadProducts]);

  const kamStockCount = useMemo(
    () => products.filter((p) => p.qty < 5).length,
    [products],
  );

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return products;
    return products.filter((p) => normalize(p.name).includes(q));
  }, [products, search]);

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
    if (!editId) return;
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
    if (!editId) return;
    const name = editName.trim();
    const price = Math.round(parseFloat(editPrice) * 100) / 100;
    const qty = Math.max(0, Math.floor(parseFloat(editQty)));
    const category = editCategory.trim() || "General";
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
    const name = addName.trim();
    const price = Math.round(parseFloat(addPrice) * 100) / 100;
    const qty = Math.max(0, Math.floor(parseFloat(addQty)));
    const category = addCategory.trim() || "General";
    if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty))
      return;

    setSavingAdd(true);
    setError(null);
    try {
      const { error } = await supabase.from("products").insert({
          shop_id: SHOP_ID,
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
      setAddCategory("");
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
        <h1 className="text-xl font-bold text-zinc-900">Inventory / स्टॉक</h1>
        <p className="text-sm text-zinc-500">ShopSaathi — maal ka hisaab</p>
      </header>

      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

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
          <section className="grid grid-cols-2 gap-3" aria-label="Summary">
            <div className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Kul Items
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-zinc-900">
                {products.length}
              </p>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-800/90">
                Kam Stock
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-red-600">
                {kamStockCount}
              </p>
              <p className="mt-0.5 text-[10px] font-medium text-orange-800/80">
                qty &lt; 5
              </p>
            </div>
          </section>

          <label className="sr-only" htmlFor="inv-search">
            Product search
          </label>
          <input
            id="inv-search"
            type="search"
            placeholder="Product dhundo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-14 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-base text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#16a34a] focus:bg-white focus:ring-2 focus:ring-[#16a34a]/25"
          />

          <section aria-label="Products" className="flex flex-col gap-3">
            {filtered.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
                Koi product nahi mila
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
                            Stock
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
                            Price / unit
                          </p>
                          <p className="text-lg font-bold tabular-nums text-zinc-900">
                            {formatRupee(p.price)}
                          </p>
                        </div>
                      </div>
                      {low ? (
                        <span className="mt-3 inline-flex items-center rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-800 ring-1 ring-orange-200/80">
                          ⚠️ Kam Stock
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
                  Product edit
                </h2>
                <p className="text-sm text-zinc-500">Naam, daam, stock update</p>

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
                  Quantity
                  <input
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    disabled={savingEdit}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base font-semibold tabular-nums outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
                    inputMode="numeric"
                  />
                </label>

                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  + Stock Badhao
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
                    {savingEdit ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={closeEdit}
                    className="min-h-12 w-full rounded-2xl text-base font-semibold text-zinc-600 active:bg-zinc-100 disabled:opacity-40"
                  >
                    Cancel
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
                  Naya product
                </h2>
                <p className="text-sm text-zinc-500">Naam, price, qty, category</p>

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
                  <input
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value)}
                    disabled={savingAdd}
                    className="mt-1 min-h-14 w-full rounded-2xl border border-zinc-200 px-4 text-base outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20 disabled:opacity-50"
                    placeholder="Grocery, Dairy..."
                  />
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
                    {savingAdd ? "Saving…" : "Save product"}
                  </button>
                  <button
                    type="button"
                    disabled={savingAdd}
                    onClick={() => setAddOpen(false)}
                    className="min-h-12 w-full rounded-2xl text-base font-semibold text-zinc-600 active:bg-zinc-100 disabled:opacity-40"
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
