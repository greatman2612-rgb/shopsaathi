import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isAuthPage = request.nextUrl.pathname === "/login";
  const isCallback = request.nextUrl.pathname.startsWith("/auth");
  const isOnboarding = request.nextUrl.pathname === "/onboarding";
  const isTestPage = request.nextUrl.pathname === "/test";

  if (!session && !isAuthPage && !isCallback && !isTestPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!session && isOnboarding) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session) {
    const { data: shop } = await supabase
      .from("shops")
      .select("id")
      .eq("id", session.user.id)
      .maybeSingle();
    const hasShop = Boolean(shop);
    if (!hasShop && !isOnboarding && !isAuthPage && !isTestPage) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    if (hasShop && isOnboarding) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
