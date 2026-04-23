"use client";

import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/** Placeholder support number — replace with real ShopSaathi WhatsApp */
const SUPPORT_WA = "https://wa.me/919000000000";
const SHOP_TYPE_OPTIONS = [
  "Kirana/General",
  "Medical/Pharmacy",
  "Restaurant/Dhaba",
  "Hardware",
  "Clothing",
  "Stationery",
  "Electronics",
  "Salon",
  "Other",
] as const;
const SHOP_ID = "shop001";

export default function MorePage() {
  const [shopName, setShopName] = useState("Meri Dukan");
  const [shopType, setShopType] = useState<(typeof SHOP_TYPE_OPTIONS)[number]>(
    "Kirana/General",
  );
  const [ownerName, setOwnerName] = useState("Dukan Malik");
  const [phone, setPhone] = useState("98XXXXXXXX");
  const [editingProfile, setEditingProfile] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );

  const avatarLetter = useMemo(() => {
    const c = shopName.trim().charAt(0);
    return c ? c.toUpperCase() : "?";
  }, [shopName]);

  const startEditProfile = () => setEditingProfile(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("*")
        .eq("id", SHOP_ID)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("load shop profile failed:", error);
        return;
      }
      if (data) {
        const row = data as Record<string, unknown>;
        setShopName(String(row.shop_name ?? "Meri Dukan"));
        setOwnerName(String(row.owner_name ?? "Dukan Malik"));
        setPhone(String(row.phone ?? "98XXXXXXXX"));
        const rawType = String(row.shop_type ?? "Kirana/General");
        setShopType(
          (SHOP_TYPE_OPTIONS as readonly string[]).includes(rawType)
            ? (rawType as (typeof SHOP_TYPE_OPTIONS)[number])
            : "Kirana/General",
        );
        return;
      }

      const { error: insertError } = await supabase.from("shops").insert({
        id: SHOP_ID,
        shop_name: "Meri Dukan",
        owner_name: "Dukan Malik",
        phone: "98XXXXXXXX",
        shop_type: "Kirana/General",
      });
      if (insertError) {
        console.error("create default shop failed:", insertError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveProfile = () => {
    void (async () => {
      const { error } = await supabase.from("shops").upsert({
        id: SHOP_ID,
        shop_name: shopName,
        owner_name: ownerName,
        phone,
        shop_type: shopType,
      });
      if (error) {
        console.error("save shop profile failed:", error);
        return;
      }
      setEditingProfile(false);
    })();
  };

  return (
    <div className="flex flex-col gap-5 pb-28">
      <header>
        <h1 className="text-xl font-bold text-zinc-900">More / और</h1>
        <p className="text-sm text-zinc-500">{"Settings & profile"}</p>
      </header>

      <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <div className="flex items-start gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-2xl font-black text-white shadow-inner ring-4 ring-green-50"
            aria-hidden
          >
            {avatarLetter}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Shop profile
            </p>
            <label className="mt-2 block">
              <span className="text-xs font-medium text-zinc-500">Dukan ka naam</span>
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                readOnly={!editingProfile}
                className={`mt-1 min-h-12 w-full rounded-xl border px-3 text-base font-semibold outline-none ${
                  editingProfile
                    ? "border-[#16a34a] bg-white ring-2 ring-[#16a34a]/20"
                    : "cursor-default border-transparent bg-zinc-50 text-zinc-900"
                }`}
              />
            </label>
            <label className="mt-2 block">
              <span className="text-xs font-medium text-zinc-500">Malik ka naam</span>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                readOnly={!editingProfile}
                className={`mt-1 min-h-12 w-full rounded-xl border px-3 text-base outline-none ${
                  editingProfile
                    ? "border-[#16a34a] bg-white ring-2 ring-[#16a34a]/20"
                    : "cursor-default border-transparent bg-zinc-50 text-zinc-800"
                }`}
              />
            </label>
            <label className="mt-2 block">
              <span className="text-xs font-medium text-zinc-500">Shop Type</span>
              <select
                value={shopType}
                onChange={(e) =>
                  setShopType(e.target.value as (typeof SHOP_TYPE_OPTIONS)[number])
                }
                disabled={!editingProfile}
                className={`mt-1 min-h-12 w-full rounded-xl border px-3 text-base outline-none ${
                  editingProfile
                    ? "border-[#16a34a] bg-white ring-2 ring-[#16a34a]/20"
                    : "cursor-default border-transparent bg-zinc-50 text-zinc-800"
                }`}
              >
                {SHOP_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 block">
              <span className="text-xs font-medium text-zinc-500">Phone</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                readOnly={!editingProfile}
                inputMode="tel"
                className={`mt-1 min-h-12 w-full rounded-xl border px-3 text-base tabular-nums outline-none ${
                  editingProfile
                    ? "border-[#16a34a] bg-white ring-2 ring-[#16a34a]/20"
                    : "cursor-default border-transparent bg-zinc-50 text-zinc-800"
                }`}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!editingProfile ? (
            <button
              type="button"
              onClick={startEditProfile}
              className="min-h-12 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-800 shadow-sm active:bg-zinc-50 sm:flex-none"
            >
              Profile Edit Karo
            </button>
          ) : (
            <button
              type="button"
              onClick={saveProfile}
              className="min-h-12 flex-1 rounded-2xl bg-[#16a34a] px-4 text-sm font-bold text-white shadow-md active:bg-green-700 sm:flex-none"
            >
              Save
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-zinc-900">Subscription</h2>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-zinc-600 ring-1 ring-zinc-200/80">
            FREE Plan
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">Abhi free plan chal raha hai</p>

        <ul className="mt-4 space-y-2 text-sm text-zinc-800">
          <li className="flex gap-2">
            <span className="text-[#16a34a]" aria-hidden>
              ✅
            </span>
            <span>30 bills/month</span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#16a34a]" aria-hidden>
              ✅
            </span>
            <span>Udhar tracking</span>
          </li>
          <li className="flex gap-2">
            <span className="text-red-500" aria-hidden>
              ❌
            </span>
            <span>Unlimited bills</span>
          </li>
          <li className="flex gap-2">
            <span className="text-red-500" aria-hidden>
              ❌
            </span>
            <span>Inventory alerts</span>
          </li>
          <li className="flex gap-2">
            <span className="text-red-500" aria-hidden>
              ❌
            </span>
            <span>AI reminders</span>
          </li>
        </ul>

        <button
          type="button"
          onClick={() => setPlansOpen((o) => !o)}
          className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#16a34a] to-green-600 px-4 text-sm font-bold text-white shadow-md active:opacity-90"
        >
          Upgrade Karo 🚀
        </button>

        {plansOpen ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-green-100 bg-green-50/40 p-3">
            <div className="mx-auto flex w-full max-w-xs rounded-full bg-white p-1 ring-1 ring-zinc-200">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`min-h-10 flex-1 rounded-full px-3 text-xs font-bold uppercase tracking-wide transition ${
                  billingCycle === "monthly"
                    ? "bg-[#16a34a] text-white"
                    : "text-zinc-600"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={`min-h-10 flex-1 rounded-full px-3 text-xs font-bold uppercase tracking-wide transition ${
                  billingCycle === "yearly"
                    ? "bg-[#16a34a] text-white"
                    : "text-zinc-600"
                }`}
              >
                Yearly
              </button>
            </div>

            <div className="rounded-2xl border border-white bg-white p-3 shadow-sm ring-1 ring-zinc-100">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-zinc-900">Free Plan</p>
                <p className="text-sm font-extrabold text-[#16a34a]">
                  ₹0/{billingCycle === "monthly" ? "month" : "year"}
                </p>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                <li>• 30 bills/month</li>
                <li>• Basic udhar tracking</li>
                <li>• WhatsApp bill share</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-white bg-white p-3 shadow-sm ring-1 ring-zinc-100">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-zinc-900">Basic Plan</p>
                <p className="text-sm font-extrabold text-[#16a34a]">
                  {billingCycle === "monthly" ? "₹199/month" : "₹1,799/year"}
                </p>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                <li>• Unlimited bills</li>
                <li>• Udhar tracking + reminders</li>
                <li>• WhatsApp bill share</li>
                {billingCycle === "yearly" ? <li>• Save ₹589 on yearly</li> : null}
              </ul>
            </div>

            <div className="rounded-2xl border border-green-200 bg-white p-3 shadow-sm ring-2 ring-green-200">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-zinc-900">Pro Plan</p>
                <span className="rounded-full bg-[#16a34a] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  Most Popular
                </span>
              </div>
              <p className="mt-1 text-sm font-extrabold text-[#16a34a]">
                {billingCycle === "monthly" ? "₹399/month" : "₹3,499/year"}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                <li>• Everything in Basic</li>
                <li>• AI smart suggestions</li>
                <li>• Inventory management</li>
                <li>• Reports & insights</li>
                {billingCycle === "yearly" ? <li>• Save ₹1,289 on yearly</li> : null}
              </ul>
            </div>

            <div className="rounded-2xl border border-white bg-white p-3 shadow-sm ring-1 ring-zinc-100">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-zinc-900">Business Plan</p>
                <p className="text-sm font-extrabold text-[#16a34a]">
                  {billingCycle === "monthly" ? "₹699/month" : "₹5,999/year"}
                </p>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                <li>• Everything in Pro</li>
                <li>• Multiple staff login</li>
                <li>• Priority WhatsApp support</li>
                {billingCycle === "yearly" ? <li>• Save ₹2,389 on yearly</li> : null}
              </ul>
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-500">
          Quick links
        </h2>
        <nav className="flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm ring-1 ring-zinc-100">
          <Link
            href="/reports"
            className="flex min-h-14 items-center gap-3 border-b border-zinc-100 px-4 text-base font-semibold text-zinc-900 active:bg-zinc-50"
          >
            <span aria-hidden>📊</span>
            Aaj ki Report
          </Link>
          <Link
            href="/udhar"
            className="flex min-h-14 items-center gap-3 border-b border-zinc-100 px-4 text-base font-semibold text-zinc-900 active:bg-zinc-50"
          >
            <span aria-hidden>📒</span>
            Udhar List
          </Link>
          <Link
            href="/inventory"
            className="flex min-h-14 items-center gap-3 border-b border-zinc-100 px-4 text-base font-semibold text-zinc-900 active:bg-zinc-50"
          >
            <span aria-hidden>📦</span>
            Low Stock Items
          </Link>
          <a
            href={SUPPORT_WA}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-14 items-center gap-3 border-b border-zinc-100 px-4 text-base font-semibold text-zinc-900 active:bg-zinc-50"
          >
            <span aria-hidden>💬</span>
            {"Help & Support"}
          </a>
          <button
            type="button"
            className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-base font-semibold text-zinc-900 active:bg-zinc-50"
            onClick={() => {
              /* dummy rate action */
            }}
          >
            <span aria-hidden>⭐</span>
            App ko Rate Karo
          </button>
        </nav>
      </section>

      <section className="rounded-2xl border border-zinc-100 bg-zinc-50/80 px-4 py-4 text-center ring-1 ring-zinc-100">
        <p className="text-xs font-semibold text-zinc-500">Version 1.0.0</p>
        <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-700">
          ShopSaathi - Aapki Dukan ka Digital Saathi
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Made with ❤️ for Korba shops
        </p>
      </section>

      <button
        type="button"
        className="min-h-14 w-full rounded-2xl border-2 border-red-500 bg-white text-base font-bold text-red-600 shadow-sm active:bg-red-50"
        onClick={() => {
          /* logout placeholder */
        }}
      >
        Logout
      </button>
    </div>
  );
}
