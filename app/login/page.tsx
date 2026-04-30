"use client";

import { supabase } from "@/lib/supabase";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const signInWithGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/auth/callback",
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google login nahi hua");
      setLoading(false);
    } finally {
      // Browser redirects on success; keep loading state
    }
  };

  return (
    <div className="mx-auto flex min-h-[85dvh] max-w-md flex-col justify-center px-4">
      <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-sm ring-1 ring-green-100/80">
        <p className="text-center text-4xl font-extrabold tracking-tight text-[#16a34a]">
          ShopSaathi
        </p>
        <p className="mt-2 text-center text-sm font-medium text-zinc-600">
          Aapki Dukan ka Digital Saathi
        </p>
        <p className="mt-1 text-center text-sm text-zinc-500">
          Apne Google account se login karo
        </p>

        {error ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={loading}
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 font-bold text-zinc-800 shadow-sm disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12S17.4 12 24 12c3 0 5.8 1.1 8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 8 3l5.7-5.7C34.1 6.1 29.3 4 24 4c-7.7 0-14.4 4.3-17.7 10.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3c-2.1 1.6-4.7 2.5-7.3 2.5-5.3 0-9.7-3.3-11.4-8l-6.5 5C9.4 39.5 16.1 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4 5.5l.1-.1 6.3 5.3C37.2 38.3 44 33 44 24c0-1.3-.1-2.4-.4-3.5z"
            />
          </svg>
          {loading ? "Redirect ho raha..." : "Google se Login Karo"}
        </button>
      </div>
    </div>
  );
}
