import type { SupabaseClient } from "@supabase/supabase-js";

export function formatBillNumber(seq: number): string {
  const n = Math.max(1, Math.floor(seq));
  return `INV-${String(n).padStart(3, "0")}`;
}

/** Reads last_bill_number, increments shop counter, returns new label e.g. INV-001. */
export async function allocateNextBillNumber(
  client: SupabaseClient,
  shopId: string,
): Promise<string> {
  const { data, error } = await client
    .from("shops")
    .select("last_bill_number")
    .eq("id", shopId)
    .maybeSingle();
  if (error) throw error;
  const last = Math.max(
    0,
    Math.floor(
      Number(
        (data as { last_bill_number?: unknown } | null)?.last_bill_number ?? 0,
      ),
    ),
  );
  const next = last + 1;
  const { error: upErr } = await client
    .from("shops")
    .update({ last_bill_number: next })
    .eq("id", shopId);
  if (upErr) throw upErr;
  return formatBillNumber(next);
}
