import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const csvPath = path.join(process.cwd(), "expenses_export.csv");
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json(
        { error: "Local expenses_export.csv not found in workspace root" },
        { status: 404 }
      );
    }

    const csvContent = fs.readFileSync(csvPath, "utf-8");
    return NextResponse.json({
      success: true,
      csvContent,
    });
  } catch (error: any) {
    console.error("Error reading local CSV file:", error);
    return NextResponse.json(
      { error: error.message || "Failed to read local CSV" },
      { status: 500 }
    );
  }
}
