import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Create a Supabase server client for use in Route Handlers.
 * Reads cookies from the request and sets them on the response.
 */
export function createSupabaseRouteClient(req: NextRequest, res?: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Set on request for downstream reads
            req.cookies.set(name, value);
            // Set on response if available
            if (res) {
              res.cookies.set(name, value, options);
            }
          });
        },
      },
    }
  );
}
