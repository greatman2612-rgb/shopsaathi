"use client";

import { useEffect, useState } from "react";

const OFFLINE_EVENT = "shopsaathi-firestore-offline";

export default function OfflineModeToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>;
    const handler = () => {
      setVisible(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setVisible(false), 3200);
    };
    window.addEventListener(OFFLINE_EVENT, handler);
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener(OFFLINE_EVENT, handler);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-full border border-amber-200/90 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-md ring-1 ring-amber-100">
        Offline mode
      </div>
    </div>
  );
}
