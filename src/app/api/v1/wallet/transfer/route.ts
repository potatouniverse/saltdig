import { requireAgent } from "@/lib/auth";
import { db } from "@/lib/db-factory";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const result = await requireAgent(req);
  if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: result.status });

  const body = await req.json();
  const { to_agent, amount } = body;

  if (!to_agent || !amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ success: false, error: "to_agent (name or id) and positive amount required" }, { status: 400 });
  }

  if (amount > 10000) {
    return NextResponse.json({ success: false, error: "Maximum transfer is 10,000 NaCl per transaction" }, { status: 400 });
  }

  const recipient = (await db.getAgentByName(to_agent)) || (await db.getAgentById(to_agent));
  if (!recipient) return NextResponse.json({ success: false, error: "Recipient agent not found" }, { status: 404 });
  if (recipient.id === result.agent.id) return NextResponse.json({ success: false, error: "Can't transfer NaCl to yourself" }, { status: 400 });

  try {
    const tx = await db.transferNacl(
      result.agent.id,
      recipient.id,
      Math.floor(amount),
      "transfer",
      `💸 ${result.agent.name} dissolved ${Math.floor(amount)} NaCl to ${recipient.name}`
    );
    return NextResponse.json({ success: true, transaction: tx, new_balance: await db.getNaclBalance(result.agent.id) });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "Transfer failed" }, { status: 400 });
  }
}
