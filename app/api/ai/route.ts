import Groq from "groq-sdk";
import { NextResponse } from "next/server";

const MODEL = "llama-3.3-70b-versatile";

function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in model output");
  }
  const slice = trimmed.slice(start, end + 1);
  return JSON.parse(slice) as unknown;
}

function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(body) as unknown;
}

async function runGroq(userPrompt: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.4,
  });
  const content = completion.choices[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("Empty model response");
  return content;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "suggest") {
      const query = String(body.query ?? "").trim();
      const shopType = String(body.shopType ?? "").trim();
      if (query.length < 2) {
        return NextResponse.json(
          { error: "query must be at least 2 characters" },
          { status: 400 },
        );
      }
      const prompt = `You are a billing assistant for Indian local shops. 
The shop could be any type - kirana, medical/pharmacy, 
restaurant, hardware, clothing, stationery, electronics, 
salon, or any other local business.

This is a ${shopType || "general"} shop. User typed: ${query}

Suggest 5 relevant products or services that match what they typed.
Be smart about context - if they type 'cro' suggest 'Crocin 500mg' 
(medical), if they type 'ham' suggest 'Hammer' (hardware) AND 
'Hamburger' (restaurant), if they type 'sham' suggest shampoo brands.

Return ONLY a JSON array, no explanation:
[
  {"name": "product name", "price": 0},
  ...
]

Set price to 0 if you are unsure - the shop owner will have 
their own prices. Return JSON only, nothing else.`;
      const raw = await runGroq(prompt);
      const parsed = extractJsonArray(raw);
      if (!Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "Invalid suggestions shape" },
          { status: 502 },
        );
      }
      const suggestions = parsed
        .slice(0, 5)
        .map((row) => {
          const r = row as Record<string, unknown>;
          const name = String(r.name ?? "").trim();
          const price = Number(r.price);
          if (!name || !Number.isFinite(price) || price < 0) return null;
          return { name, price: Math.round(price * 100) / 100 };
        })
        .filter((x): x is { name: string; price: number } => x !== null);
      return NextResponse.json({ suggestions });
    }

    if (action === "reminder") {
      const customerName = String(body.customerName ?? "").trim();
      const amount = Number(body.amount);
      const shopName = String(body.shopName ?? "Meri Dukan").trim() || "Meri Dukan";
      if (!customerName || !Number.isFinite(amount)) {
        return NextResponse.json(
          { error: "customerName and amount are required" },
          { status: 400 },
        );
      }
      const prompt = `Write a polite WhatsApp payment reminder in
Hindi for a small shop owner in India. Customer name: ${customerName},
Amount due: ₹${amount}, Shop name: ${shopName}.
Keep it under 3 lines, friendly tone, end with Dhanyawad.
Return only the message text, nothing else.`;
      const message = (await runGroq(prompt)).trim();
      return NextResponse.json({ message });
    }

    if (action === "insight") {
      const bills = body.bills;
      if (!Array.isArray(bills)) {
        return NextResponse.json(
          { error: "bills array is required" },
          { status: 400 },
        );
      }
      const prompt = `Analyze these bills from an Indian shop: ${JSON.stringify(bills)}.
Give exactly 3 insights in Hindi+English mixed language.
Format: JSON array [{"insight": string, "icon": emoji}].
Focus on: best selling item, busiest day, total revenue trend.
Return JSON only.`;
      const raw = await runGroq(prompt);
      let parsed: unknown;
      try {
        parsed = extractJsonArray(raw);
      } catch {
        parsed = extractJsonValue(raw);
      }
      if (!Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "Invalid insights shape" },
          { status: 502 },
        );
      }
      const insights = parsed
        .slice(0, 3)
        .map((row) => {
          const r = row as Record<string, unknown>;
          const insight = String(r.insight ?? "").trim();
          const icon = String(r.icon ?? "✨").trim() || "✨";
          if (!insight) return null;
          return { insight, icon };
        })
        .filter((x): x is { insight: string; icon: string } => x !== null);
      return NextResponse.json({ insights });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed" },
      { status: 500 },
    );
  }
}
