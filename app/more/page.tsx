"use client";

import { useLocale } from "@/contexts/LocaleContext";
import { useShopId } from "@/hooks/useShopId";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";

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
type PlanId = "free" | "basic" | "pro" | "business";

export default function MorePage() {
  const { locale, setLocale, t } = useLocale();
  const { shopId, loading } = useShopId();
  const [shopName, setShopName] = useState("Meri Dukan");
  const [shopType, setShopType] = useState<(typeof SHOP_TYPE_OPTIONS)[number]>(
    "Kirana/General",
  );
  const [ownerName, setOwnerName] = useState("Dukan Malik");
  const [phone, setPhone] = useState("98XXXXXXXX");
  const [shopAddress, setShopAddress] = useState("");
  const [upiId, setUpiId] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const [currentPlan, setCurrentPlan] = useState<PlanId>("free");
  const [processingPlan, setProcessingPlan] = useState<PlanId | null>(null);

  const avatarLetter = useMemo(() => {
    const c = shopName.trim().charAt(0);
    return c ? c.toUpperCase() : "?";
  }, [shopName]);

  const startEditProfile = () => setEditingProfile(true);

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("shops")
        .select("*")
        .eq("id", shopId)
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
        setShopAddress(String(row.shop_address ?? ""));
        setUpiId(String(row.upi_id ?? ""));
        const rawType = String(row.shop_type ?? "Kirana/General");
        setShopType(
          (SHOP_TYPE_OPTIONS as readonly string[]).includes(rawType)
            ? (rawType as (typeof SHOP_TYPE_OPTIONS)[number])
            : "Kirana/General",
        );
        const rawPlan = String(row.plan ?? "free").toLowerCase();
        if (rawPlan === "basic" || rawPlan === "pro" || rawPlan === "business")
          setCurrentPlan(rawPlan);
        else setCurrentPlan("free");
        return;
      }

      const { error: insertError } = await supabase.from("shops").insert({
        id: shopId,
        shop_name: "Meri Dukan",
        owner_name: "Dukan Malik",
        phone: "98XXXXXXXX",
        shop_type: "Kirana/General",
        shop_address: "",
        upi_id: "",
      });
      if (insertError) {
        console.error("create default shop failed:", insertError);
      }
      setCurrentPlan("free");
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const saveProfile = () => {
    if (!shopId) return;
    void (async () => {
      const { error } = await supabase.from("shops").upsert({
        id: shopId,
        shop_name: shopName,
        owner_name: ownerName,
        phone,
        shop_type: shopType,
        shop_address: shopAddress.trim(),
        upi_id: upiId.trim(),
      });
      if (error) {
        console.error("save shop profile failed:", error);
        return;
      }
      setEditingProfile(false);
    })();
  };

  const handleUpgrade = async (plan: PlanId) => {
    if (plan === "free" || !shopId || processingPlan) return;
    setProcessingPlan(plan);
    try {
      const res = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, period: billingPeriod }),
      });
      const order = await res.json();

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      document.body.appendChild(script);

      script.onload = () => {
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: "ShopSaathi",
          description: `${plan} Plan`,
          order_id: order.id,
          theme: { color: "#16a34a" },
          handler: async function (response: any) {
            const verifyRes = await fetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                shop_id: shopId,
                plan,
              }),
            });
            const result = await verifyRes.json();
            if (result.success) {
              setCurrentPlan(plan);
              alert("Plan upgrade ho gaya! 🎉");
            } else {
              alert("Verification fail ho gayi, support se contact karo");
            }
            setProcessingPlan(null);
          },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      };

      script.onerror = () => {
        setProcessingPlan(null);
        alert("Payment shuru nahi ho paya, dobara try karo");
      };
    } catch {
      setProcessingPlan(null);
      alert("Payment shuru nahi ho paya, dobara try karo");
    }
  };

  if (loading) {
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
    <div className="flex flex-col gap-5 pb-28">
      <header>
        <h1 className="text-xl font-bold text-zinc-900">More / और</h1>
        <p className="text-sm text-zinc-500">{"Settings & profile"}</p>
      </header>

      <section
        className="rounded-2xl border border-green-100 bg-green-50/50 p-4 shadow-sm ring-1 ring-green-100/80"
        aria-label="App language"
      >
        <p className="text-sm font-bold text-zinc-900">{t("languageHeading")}</p>
        <p className="mt-1 text-xs text-zinc-600">{t("languageHint")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setLocale("hi")}
            className={`min-h-12 rounded-2xl text-sm font-bold shadow-sm active:scale-[0.99] ${
              locale === "hi"
                ? "bg-[#16a34a] text-white ring-2 ring-green-300"
                : "border border-zinc-200 bg-white text-zinc-800"
            }`}
          >
            {t("langHindi")}
          </button>
          <button
            type="button"
            onClick={() => setLocale("en")}
            className={`min-h-12 rounded-2xl text-sm font-bold shadow-sm active:scale-[0.99] ${
              locale === "en"
                ? "bg-[#16a34a] text-white ring-2 ring-green-300"
                : "border border-zinc-200 bg-white text-zinc-800"
            }`}
          >
            {t("langEnglish")}
          </button>
        </div>
      </section>

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
            <label className="mt-2 block">
              <span className="text-xs font-medium text-zinc-500">
                Pata / Address (bill print)
              </span>
              <textarea
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                readOnly={!editingProfile}
                rows={2}
                className={`mt-1 min-h-[3rem] w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none ${
                  editingProfile
                    ? "border-[#16a34a] bg-white ring-2 ring-[#16a34a]/20"
                    : "cursor-default border-transparent bg-zinc-50 text-zinc-800"
                }`}
                placeholder="Shop ka full address"
              />
            </label>
            <label className="mt-2 block">
              <span className="text-xs font-medium text-zinc-500">
                UPI ID (UPI QR bill par)
              </span>
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                readOnly={!editingProfile}
                inputMode="email"
                className={`mt-1 min-h-12 w-full rounded-xl border px-3 text-base outline-none ${
                  editingProfile
                    ? "border-[#16a34a] bg-white ring-2 ring-[#16a34a]/20"
                    : "cursor-default border-transparent bg-zinc-50 text-zinc-800"
                }`}
                placeholder="dukan@upi"
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
            {currentPlan} Plan
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

        <div className="mt-4 space-y-3 rounded-2xl border border-green-100 bg-green-50/40 p-3">
          <div className="mx-auto flex w-full max-w-xs rounded-full bg-white p-1 ring-1 ring-zinc-200">
            <button
              type="button"
              onClick={() => setBillingPeriod("monthly")}
              className={`min-h-10 flex-1 rounded-full px-3 text-xs font-bold uppercase tracking-wide transition ${
                billingPeriod === "monthly"
                  ? "bg-[#16a34a] text-white"
                  : "text-zinc-600"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod("yearly")}
              className={`min-h-10 flex-1 rounded-full px-3 text-xs font-bold uppercase tracking-wide transition ${
                billingPeriod === "yearly"
                  ? "bg-[#16a34a] text-white"
                  : "text-zinc-600"
              }`}
            >
              Yearly
            </button>
          </div>

          <div
            className={`rounded-2xl bg-white p-3 shadow-sm ${
              currentPlan === "basic"
                ? "border border-green-200 ring-2 ring-green-200"
                : "border border-white ring-1 ring-zinc-100"
            }`}
          >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-zinc-900">Basic Plan</p>
                <p className="text-sm font-extrabold text-[#16a34a]">
                  {billingPeriod === "monthly" ? "₹199/month" : "₹1,799/year"}
                </p>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                <li>• Unlimited bills</li>
                <li>• Udhar tracking + reminders</li>
                <li>• WhatsApp bill share</li>
                {billingPeriod === "yearly" ? <li>• Save ₹589 on yearly</li> : null}
              </ul>
              {currentPlan === "basic" ? (
                <div className="mt-3 inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                  Current Plan ✓
                </div>
              ) : (
                <button
                  type="button"
                  disabled={processingPlan !== null}
                  onClick={() => void handleUpgrade("basic")}
                  className="mt-3 min-h-11 w-full rounded-xl bg-[#16a34a] text-sm font-bold text-white disabled:opacity-40"
                >
                  {processingPlan === "basic" ? "Processing..." : "Upgrade Karo"}
                </button>
              )}
            </div>

            <div
              className={`rounded-2xl bg-white p-3 shadow-sm ${
                currentPlan === "pro"
                  ? "border border-green-200 ring-2 ring-green-200"
                  : "border border-white ring-1 ring-zinc-100"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-zinc-900">Pro Plan</p>
                <span className="rounded-full bg-[#16a34a] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  Most Popular
                </span>
              </div>
              <p className="mt-1 text-sm font-extrabold text-[#16a34a]">
                {billingPeriod === "monthly" ? "₹399/month" : "₹3,499/year"}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                <li>• Everything in Basic</li>
                <li>• AI smart suggestions</li>
                <li>• Inventory management</li>
                <li>• Reports & insights</li>
                {billingPeriod === "yearly" ? <li>• Save ₹1,289 on yearly</li> : null}
              </ul>
              {currentPlan === "pro" ? (
                <div className="mt-3 inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                  Current Plan ✓
                </div>
              ) : (
                <button
                  type="button"
                  disabled={processingPlan !== null}
                  onClick={() => void handleUpgrade("pro")}
                  className="mt-3 min-h-11 w-full rounded-xl bg-[#16a34a] text-sm font-bold text-white disabled:opacity-40"
                >
                  {processingPlan === "pro" ? "Processing..." : "Upgrade Karo"}
                </button>
              )}
            </div>

            <div
              className={`rounded-2xl bg-white p-3 shadow-sm ${
                currentPlan === "business"
                  ? "border border-green-200 ring-2 ring-green-200"
                  : "border border-white ring-1 ring-zinc-100"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-zinc-900">Business Plan</p>
                <p className="text-sm font-extrabold text-[#16a34a]">
                  {billingPeriod === "monthly" ? "₹699/month" : "₹5,999/year"}
                </p>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                <li>• Everything in Pro</li>
                <li>• Multiple staff login</li>
                <li>• Priority WhatsApp support</li>
                {billingPeriod === "yearly" ? <li>• Save ₹2,389 on yearly</li> : null}
              </ul>
              {currentPlan === "business" ? (
                <div className="mt-3 inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                  Current Plan ✓
                </div>
              ) : (
                <button
                  type="button"
                  disabled={processingPlan !== null}
                  onClick={() => void handleUpgrade("business")}
                  className="mt-3 min-h-11 w-full rounded-xl bg-[#16a34a] text-sm font-bold text-white disabled:opacity-40"
                >
                  {processingPlan === "business"
                    ? "Processing..."
                    : "Upgrade Karo"}
                </button>
              )}
            </div>
          </div>
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
          void (async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          })();
        }}
      >
        Logout
      </button>
    </div>
  );
}
