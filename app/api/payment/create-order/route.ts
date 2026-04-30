import Razorpay from "razorpay";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  const { plan, period } = await req.json();

  const prices: Record<string, number> = {
    "basic-monthly": 19900,
    "basic-yearly": 179900,
    "pro-monthly": 39900,
    "pro-yearly": 349900,
    "business-monthly": 69900,
    "business-yearly": 599900,
  };

  const amount = prices[`${plan}-${period}`] || 19900;

  const order = await razorpay.orders.create({
    amount,
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
  });

  return NextResponse.json(order);
}
