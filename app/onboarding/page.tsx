"use client";

import { supabase } from "@/lib/supabase";
import { useState } from "react";

const SHOP_TYPES = [
  "Kirana",
  "Medical",
  "Restaurant",
  "Hardware",
  "Clothing",
  "Stationery",
  "Electronics",
  "Salon",
  "Other",
] as const;

export default function OnboardingPage() {
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopType, setShopType] = useState<(typeof SHOP_TYPES)[number]>("Kirana");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const saveShop = async () => {
    if (!shopName.trim() || !ownerName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase.from("shops").upsert(
        {
          id: session.user.id,
          shop_name: shopName,
          owner_name: ownerName,
          phone: phone,
          shop_type: shopType,
          plan: "free",
          created_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (error) {
        console.error("Onboarding error:", error);
        setError("Save nahi hua: " + error.message);
        return;
      }

      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save nahi hua");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center px-2">
      <div className="rounded-3xl border border-green-100 bg-white p-5 shadow-sm ring-1 ring-green-100/80">
        <h1 className="text-2xl font-extrabold text-[#16a34a]">Shop Setup</h1>
        <p className="mt-1 text-sm text-zinc-500">Pehli baar setup kar lete hain</p>

        <label className="mt-4 block text-sm font-semibold text-zinc-700">
          Shop ka naam
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-700">
          Malik ka naam
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-700">
          Phone number
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-700">
          Shop type
          <select
            value={shopType}
            onChange={(e) => setShopType(e.target.value as (typeof SHOP_TYPES)[number])}
            className="mt-1 min-h-12 w-full rounded-xl border border-zinc-200 px-3 outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/20"
          >
            {SHOP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {error ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void saveShop()}
          disabled={!shopName.trim() || !ownerName.trim() || saving}
          className="mt-5 min-h-12 w-full rounded-2xl bg-[#16a34a] font-bold text-white disabled:opacity-40"
        >
          {saving ? "Save ho raha..." : "Save"}
        </button>
      </div>
    </div>
  );
}
