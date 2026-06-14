import { NextRequest, NextResponse } from "next/server";
import { getMemberLedger } from "@/lib/balances";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const resolvedParams = await params;
    const name = decodeURIComponent(resolvedParams.name);
    const ledger = await getMemberLedger(name);

    return NextResponse.json({
      success: true,
      memberName: name,
      ledger,
    });
  } catch (error: any) {
    console.error(`Error fetching ledger for ${error}:`, error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch ledger" },
      { status: 500 }
    );
  }
}
