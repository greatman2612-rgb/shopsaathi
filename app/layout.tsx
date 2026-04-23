import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import BottomNav from "@/components/BottomNav";
import OfflineModeToast from "@/components/OfflineModeToast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ShopSaathi",
  description:
    "ShopSaathi — billing, GST, Udhar Khata, inventory, and WhatsApp for local shops in India.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh bg-white font-sans text-zinc-900">
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
          <OfflineModeToast />
          <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
