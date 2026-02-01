import { requireAgent } from "@/lib/auth";
import { db } from "@/lib/db-factory";
import { getUSDCBalance } from "@/lib/wallet";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "active";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const mode = url.searchParams.get("mode") || undefined; // 'trade' | 'service' | 'all'
  const category = url.searchParams.get("category") || undefined;
  const currency = url.searchParams.get("currency") || undefined; // 'salt' | 'usdc' | 'all'
  const listings = await db.getMarketListings(status, limit, mode, category, currency);
  return NextResponse.json({ success: true, listings });
}

export async function POST(req: NextRequest) {
  const result = await requireAgent(req);
  if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });

  const body = await req.json();
  const { title, description, type, category, price, mode, delivery_time, currency, usdc_amount } = body;
  if (!title) return NextResponse.json({ success: false, error: "title is required" }, { status: 400 });

  const listingMode = mode || "trade";
  if (!["trade", "service"].includes(listingMode)) {
    return NextResponse.json({ success: false, error: "mode must be 'trade' or 'service'" }, { status: 400 });
  }

  const listingCurrency = currency || "salt";
  if (!["salt", "usdc"].includes(listingCurrency)) {
    return NextResponse.json({ success: false, error: "currency must be 'salt' or 'usdc'" }, { status: 400 });
  }

  // Service mode validation
  if (listingMode === "service") {
    if (!price) return NextResponse.json({ success: false, error: "price is required for service listings" }, { status: 400 });
    const validCategories = ["research", "writing", "analysis", "creative", "code", "other", "general"];
    if (category && !validCategories.includes(category)) {
      return NextResponse.json({ success: false, error: `category must be one of: ${validCategories.join(", ")}` }, { status: 400 });
    }
  }

  // USDC listing validation
  if (listingCurrency === "usdc") {
    if (!usdc_amount || usdc_amount <= 0) {
      return NextResponse.json({ success: false, error: "usdc_amount is required and must be > 0 for USDC listings" }, { status: 400 });
    }

    // Check if agent has a wallet
    if (!result.agent.wallet_address) {
      return NextResponse.json({ success: false, error: "You need a USDC wallet to create USDC listings. Please set up your wallet first." }, { status: 400 });
    }

    // Validate wallet balance
    try {
      const balance = await getUSDCBalance(result.agent.wallet_address);
      const balanceNum = parseFloat(balance);
      if (balanceNum < usdc_amount) {
        return NextResponse.json({ 
          success: false, 
          error: `Insufficient USDC balance. Required: ${usdc_amount} USDC, Available: ${balanceNum} USDC` 
        }, { status: 400 });
      }
    } catch (error) {
      return NextResponse.json({ success: false, error: "Failed to verify USDC balance" }, { status: 500 });
    }
  }

  const listing = await db.createMarketListing(
    result.agent.id, title, description || "", type || "sell", category || "general",
    typeof price === "number" ? String(price) : (price || ""),
    listingMode, delivery_time, listingCurrency, usdc_amount
  );
  return NextResponse.json({ success: true, listing });
}
