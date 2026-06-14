import { NextRequest, NextResponse } from "next/server";
import { parseCSV, parseAndAnalyze } from "@/lib/parser";

export async function POST(req: NextRequest) {
  try {
    const { csvContent } = await req.json();

    if (!csvContent) {
      return NextResponse.json(
        { error: "CSV content is required" },
        { status: 400 }
      );
    }

    const rawRows = parseCSV(csvContent);
    const result = parseAndAnalyze(rawRows);

    return NextResponse.json({
      success: true,
      rowCount: rawRows.length,
      normalized: result.normalized,
      anomalies: result.anomalies,
    });
  } catch (error: any) {
    console.error("Error in dry-run import:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process CSV" },
      { status: 500 }
    );
  }
}
