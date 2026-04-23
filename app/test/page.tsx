"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TestPage() {
  const [status, setStatus] = useState("Testing...");
  const [error, setError] = useState("");

  useEffect(() => {
    async function test() {
      try {
        const { data, error } = await supabase.from("customers").select("count");

        if (error) {
          setError(JSON.stringify(error, null, 2));
          setStatus("FAILED");
        } else {
          void data;
          setStatus("SUCCESS! Supabase connected!");
        }
      } catch (e: any) {
        setError(e.message);
        setStatus("FAILED");
      }
    }
    void test();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>{status}</h1>
      {error && <pre style={{ color: "red" }}>{error}</pre>}
    </div>
  );
}
