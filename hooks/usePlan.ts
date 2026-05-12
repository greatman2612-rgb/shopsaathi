"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PLAN_LIMITS, type PlanKey } from "@/lib/planLimits";

type PlanLimits = (typeof PLAN_LIMITS)[PlanKey];

export function usePlan() {
  const [plan, setPlan] = useState<PlanKey>("free");
  const [limits, setLimits] = useState<PlanLimits>(PLAN_LIMITS.free);
  const [billsThisMonth, setBillsThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: shop } = await supabase
        .from("shops")
        .select("plan")
        .eq("id", session.user.id)
        .single();

      const rawPlan = String(shop?.plan ?? "free").toLowerCase();
      const currentPlan: PlanKey =
        rawPlan === "basic" || rawPlan === "pro" || rawPlan === "business"
          ? rawPlan
          : "free";
      setPlan(currentPlan);
      setLimits(PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from("bills")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", session.user.id)
        .gte("created_at", startOfMonth.toISOString());

      setBillsThisMonth(count || 0);
      setLoading(false);
    }
    void load();
  }, []);

  const canMakeBill =
    limits.maxBillsPerMonth === Infinity || billsThisMonth < limits.maxBillsPerMonth;

  return { plan, limits, billsThisMonth, canMakeBill, loading };
}
