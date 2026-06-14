import { NextResponse } from "next/server";
import { calculateBalances } from "@/lib/balances";

export async function GET() {
  try {
    const data = await calculateBalances();
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error: any) {
    console.error("Error calculating balances:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate balances" },
      { status: 500 }
    );
  }
}
