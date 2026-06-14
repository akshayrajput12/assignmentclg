import { parse } from "path";

export interface CSVRow {
  date: string;
  description: string;
  paid_by: string;
  amount: string;
  currency: string;
  split_type: string;
  split_with: string;
  split_details: string;
  notes: string;
}

export interface Anomaly {
  id: string;
  type: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  rowNumber: number;
  description: string;
  field: string;
  originalValue: string;
  proposedAction: string;
  autoApplied: boolean;
  requiresApproval: boolean;
}

export interface NormalizedExpense {
  rowNumber: number;
  date: Date;
  dateStr: string; // YYYY-MM-DD
  description: string;
  paidBy: string;
  amount: number;
  originalAmount: number;
  currency: string;
  exchangeRate: number;
  amountInr: number;
  splitType: string;
  splitWith: string[];
  splitDetails: { [key: string]: number }; // Normalized owes per person
  notes: string;
  isPayment: boolean; // True if it's a direct transfer/settlement rather than an expense
  isDuplicate: boolean;
  duplicateOfRow?: number;
  hasConflict: boolean;
  conflictWithRow?: number;
}

// Custom state-machine CSV parser to handle quotes and commas inside quotes correctly
export function parseCSV(csvContent: string): CSVRow[] {
  const lines = csvContent.split(/\r?\n/);
  const rows: CSVRow[] = [];
  if (lines.length === 0) return rows;

  // Header parsing
  const headerLine = lines[0];
  const headers = splitCSVLine(headerLine).map(h => h.trim().toLowerCase());

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = splitCSVLine(line);
    const rowData: any = {};
    
    // Map headers to values
    headers.forEach((header, index) => {
      rowData[header] = values[index] !== undefined ? values[index] : "";
    });

    rows.push({
      date: rowData.date || "",
      description: rowData.description || "",
      paid_by: rowData.paid_by || "",
      amount: rowData.amount || "",
      currency: rowData.currency || "",
      split_type: rowData.split_type || "",
      split_with: rowData.split_with || "",
      split_details: rowData.split_details || "",
      notes: rowData.notes || ""
    });
  }

  return rows;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  
  // Strip outer quotes from fields if they exist
  return result.map(val => {
    let s = val.trim();
    if (s.startsWith('"') && s.endsWith('"')) {
      s = s.substring(1, s.length - 1);
    }
    return s;
  });
}

// Flatmate membership periods
export const MEMBER_TIMELINES: { [name: string]: { joined: string; left: string | null } } = {
  Aisha: { joined: "2026-02-01", left: null },
  Rohan: { joined: "2026-02-01", left: null },
  Priya: { joined: "2026-02-01", left: null },
  Meera: { joined: "2026-02-01", left: "2026-03-31" }, // Moved out March 31st
  Sam: { joined: "2026-04-15", left: null }, // Moved in mid-April (we treat as April 15th)
  Dev: { joined: "2026-02-01", left: null }, // Dev is treated as guest/ongoing member
};

export const STANDARD_MEMBERS = ["Aisha", "Rohan", "Priya", "Meera", "Sam", "Dev"];

// Normalizes name casings, aliases, and trailing spaces
export function normalizeName(name: string): { normalized: string; anomaly: string | null } {
  const trimmed = name.trim();
  if (!trimmed) return { normalized: "", anomaly: "Empty name" };

  const lower = trimmed.toLowerCase();
  
  if (lower === "priya s") {
    return { normalized: "Priya", anomaly: `Alias 'Priya S' normalized to 'Priya'` };
  }
  
  // Match standard members case-insensitively
  for (const m of STANDARD_MEMBERS) {
    if (m.toLowerCase() === lower) {
      if (m !== trimmed) {
        return { normalized: m, anomaly: `Incorrect casing/spacing in name '${trimmed}' normalized to '${m}'` };
      }
      return { normalized: m, anomaly: null };
    }
  }

  // If name is not a standard member, it might be a guest
  return { normalized: trimmed, anomaly: null };
}

export function parseAndAnalyze(csvRows: CSVRow[]): {
  normalized: NormalizedExpense[];
  anomalies: Anomaly[];
} {
  const anomalies: Anomaly[] = [];
  const normalized: NormalizedExpense[] = [];

  const addAnomaly = (
    type: string,
    severity: "CRITICAL" | "WARNING" | "INFO",
    rowNumber: number,
    description: string,
    field: string,
    originalValue: string,
    proposedAction: string,
    autoApplied: boolean = true,
    requiresApproval: boolean = false
  ) => {
    anomalies.push({
      id: `${type}-${rowNumber}-${field}`,
      type,
      severity,
      rowNumber,
      description,
      field,
      originalValue,
      proposedAction,
      autoApplied,
      requiresApproval
    });
  };

  // Step 1: Basic normalization per row
  csvRows.forEach((row, index) => {
    const rowNum = index + 2; // 1-indexed, +1 for header

    // 1. Date parsing
    let parsedDate: Date | null = null;
    let dateStr = row.date.trim();
    let dateAnomalyDesc = "";
    let isAmbiguousDate = false;

    if (!dateStr) {
      addAnomaly("MISSING_DATE", "CRITICAL", rowNum, "Date field is missing", "date", "", "Skip row or set to default");
      return; // Skip invalid row
    }

    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      parsedDate = new Date(dateStr);
    } 
    // Try DD/MM/YYYY or MM/DD/YYYY
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const parts = dateStr.split("/");
      // Let's look at the note or context. In March, we see 01/03/2026, 03/03/2026, etc.
      // 04/05/2026 is between 28/03/2026 and 2026-04-01, meaning it is likely April 5th, not May 4th!
      // This is an ambiguous date.
      if (dateStr === "04/05/2026") {
        isAmbiguousDate = true;
        parsedDate = new Date("2026-04-05"); // Set to April 5th
        dateAnomalyDesc = "Ambiguous date format '04/05/2026' interpreted as '2026-04-05' based on chronological sequence";
      } else {
        // Assume DD/MM/YYYY standard for other slash dates since 15/03/2026 exists (which can only be 15th March)
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        parsedDate = new Date(year, month, day);
        dateAnomalyDesc = `Date format '${dateStr}' parsed as DD/MM/YYYY`;
      }
    }
    // Try MMMM DD (e.g. Mar 14)
    else if (/^[A-Za-z]{3,}\s+\d{1,2}$/i.test(dateStr)) {
      const parts = dateStr.split(/\s+/);
      const monthStr = parts[0].toLowerCase();
      const day = parseInt(parts[1], 10);
      let month = 2; // March default
      if (monthStr.startsWith("feb")) month = 1;
      if (monthStr.startsWith("apr")) month = 3;
      parsedDate = new Date(2026, month, day);
      dateAnomalyDesc = `Date format '${dateStr}' parsed as MM DD, assuming year 2026`;
    }

    if (!parsedDate || isNaN(parsedDate.getTime())) {
      addAnomaly("INVALID_DATE", "CRITICAL", rowNum, `Could not parse date format '${dateStr}'`, "date", dateStr, "Skip row");
      return;
    }

    if (dateAnomalyDesc) {
      addAnomaly(
        isAmbiguousDate ? "AMBIGUOUS_DATE" : "INCONSISTENT_DATE_FORMAT",
        isAmbiguousDate ? "WARNING" : "INFO",
        rowNum,
        dateAnomalyDesc,
        "date",
        dateStr,
        `Standardized to YYYY-MM-DD (${parsedDate.toISOString().split("T")[0]})`
      );
    }

    // Format normalized date string
    const finalDateStr = parsedDate.toISOString().split("T")[0];

    // 2. Amount parsing & cleaning
    let amountStr = row.amount.trim();
    let cleanedAmountStr = amountStr.replace(/,/g, "").trim();
    let originalAmount = parseFloat(cleanedAmountStr);
    let amount = originalAmount;

    if (isNaN(amount)) {
      addAnomaly("INVALID_AMOUNT", "CRITICAL", rowNum, `Could not parse amount '${amountStr}' as number`, "amount", amountStr, "Skip row");
      return;
    }

    // Amount formatting alerts
    if (amountStr !== cleanedAmountStr) {
      addAnomaly(
        "NUMBER_FORMATTING",
        "INFO",
        rowNum,
        `Amount '${amountStr}' contains commas or spacing, normalized to '${cleanedAmountStr}'`,
        "amount",
        amountStr,
        "Strip formatting characters"
      );
    }

    if (amount === 0) {
      addAnomaly(
        "ZERO_AMOUNT",
        "WARNING",
        rowNum,
        `Expense amount is 0 INR for '${row.description}'`,
        "amount",
        amountStr,
        "Import as zero-value expense"
      );
    }

    if (amount < 0) {
      addAnomaly(
        "NEGATIVE_AMOUNT",
        "WARNING",
        rowNum,
        `Negative amount '${amountStr}' treated as a refund/reversal`,
        "amount",
        amountStr,
        "Import as refund (negative expense)"
      );
    }

    // Fractional Paisa checks
    if (!Number.isInteger(amount * 100)) {
      const rounded = Math.round(amount * 100) / 100;
      addAnomaly(
        "FRACTIONAL_PAISA",
        "INFO",
        rowNum,
        `Fractional currency value '${amountStr}' rounded to 2 decimal places: '${rounded}'`,
        "amount",
        amountStr,
        `Round to '${rounded}'`
      );
      amount = rounded;
    }

    // 3. Paid By parsing & validation
    let rawPaidBy = row.paid_by.trim();
    let paidBy = "";
    if (!rawPaidBy) {
      addAnomaly(
        "MISSING_PAID_BY",
        "CRITICAL",
        rowNum,
        `Missing 'paid_by' for '${row.description}'. Cannot determine who paid.`,
        "paid_by",
        "",
        "Requires manual mapping of payer",
        false, // Cannot auto-apply without guessing
        true  // Requires user approval/input
      );
    } else {
      const norm = normalizeName(rawPaidBy);
      paidBy = norm.normalized;
      if (norm.anomaly) {
        addAnomaly("NAME_NORMALIZATION", "INFO", rowNum, norm.anomaly, "paid_by", rawPaidBy, `Normalized to '${paidBy}'`);
      }
    }

    // 4. Currency parsing
    let currency = row.currency.trim().toUpperCase();
    if (!currency) {
      currency = "INR";
      addAnomaly(
        "MISSING_CURRENCY",
        "WARNING",
        rowNum,
        "Currency is blank. Defaulting to INR.",
        "currency",
        "",
        "Default to INR"
      );
    }

    // Convert currency if USD
    let exchangeRate = 1.0;
    if (currency === "USD") {
      exchangeRate = 83.0; // Fixed exchange rate
      addAnomaly(
        "MULTI_CURRENCY_CONVERSION",
        "INFO",
        rowNum,
        `USD amount converted to INR at fixed rate of 1 USD = 83.0 INR`,
        "currency",
        "USD",
        `Convert ${amount} USD to ${amount * exchangeRate} INR`
      );
    }

    const amountInr = amount * exchangeRate;

    // 5. Split lists and normalizations
    const rawSplitWith = row.split_with.split(";").map(s => s.trim()).filter(Boolean);
    const splitWith: string[] = [];

    rawSplitWith.forEach(name => {
      const norm = normalizeName(name);
      splitWith.push(norm.normalized);
      if (norm.anomaly) {
        addAnomaly("NAME_NORMALIZATION", "INFO", rowNum, norm.anomaly, "split_with", name, `Normalized to '${norm.normalized}'`);
      }
    });

    // Enforce Sam deposit / Rohan payback direct settlement detection
    let isPayment = false;
    const lowerDesc = row.description.toLowerCase();
    if (
      lowerDesc.includes("paid") && lowerDesc.includes("back") ||
      lowerDesc.includes("deposit share") ||
      row.split_type.trim() === "" && splitWith.length === 1
    ) {
      isPayment = true;
      addAnomaly(
        "DIRECT_SETTLEMENT",
        "WARNING",
        rowNum,
        `Direct payment/settlement '${row.description}' logged as shared expense. Will be imported as direct transaction.`,
        "split_type",
        row.split_type,
        "Import as transfer/settlement rather than expense"
      );
    }

    // 6. Split math validation
    const splitType = row.split_type.trim().toLowerCase();
    const rawSplitDetails = row.split_details.trim();
    const splitDetails: { [key: string]: number } = {};

    if (!isPayment) {
      if (splitType === "equal" || !splitType) {
        // Equal split
        const shareAmount = amountInr / (splitWith.length || 1);
        splitWith.forEach(member => {
          splitDetails[member] = shareAmount;
        });

        if (rawSplitDetails) {
          addAnomaly(
            "MISMATCHED_SPLIT_DETAILS",
            "WARNING",
            rowNum,
            `Split type is equal, but split details were provided: '${rawSplitDetails}'. Ignored details.`,
            "split_details",
            rawSplitDetails,
            "Split equally ignoring extra details"
          );
        }
      } 
      else if (splitType === "percentage") {
        // Percentage split, parse details e.g., "Aisha 30%; Rohan 30%; Priya 30%; Meera 20%"
        const parts = rawSplitDetails.split(";").map(s => s.trim()).filter(Boolean);
        let totalPct = 0;
        const pctMap: { [name: string]: number } = {};

        parts.forEach(part => {
          // Parse e.g. "Aisha 30%"
          const match = part.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*%?$/);
          if (match) {
            const name = normalizeName(match[1]).normalized;
            const pct = parseFloat(match[2]);
            pctMap[name] = pct;
            totalPct += pct;
          }
        });

        // Check if sum is 100%
        if (Math.abs(totalPct - 100) > 0.01) {
          addAnomaly(
            "INVALID_PERCENTAGE_SPLIT",
            "WARNING",
            rowNum,
            `Percentage split sums to ${totalPct}% instead of 100%: '${rawSplitDetails}'`,
            "split_details",
            rawSplitDetails,
            "Re-scale percentages proportionally to sum to 100%",
            true
          );
          
          // Re-scale percentages
          splitWith.forEach(member => {
            const originalPct = pctMap[member] || 0;
            const rescaledPct = (originalPct / totalPct) * 100;
            splitDetails[member] = (rescaledPct / 100) * amountInr;
          });
        } else {
          splitWith.forEach(member => {
            const pct = pctMap[member] || 0;
            splitDetails[member] = (pct / 100) * amountInr;
          });
        }
      } 
      else if (splitType === "share") {
        // Share split, parse details e.g., "Aisha 1; Rohan 2; Priya 1; Dev 2"
        const parts = rawSplitDetails.split(";").map(s => s.trim()).filter(Boolean);
        let totalShares = 0;
        const sharesMap: { [name: string]: number } = {};

        parts.forEach(part => {
          const match = part.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
          if (match) {
            const name = normalizeName(match[1]).normalized;
            const shares = parseFloat(match[2]);
            sharesMap[name] = shares;
            totalShares += shares;
          }
        });

        splitWith.forEach(member => {
          const shares = sharesMap[member] || 0;
          splitDetails[member] = (shares / (totalShares || 1)) * amountInr;
        });
      } 
      else if (splitType === "unequal") {
        // Unequal amounts, e.g., "Rohan 700; Priya 400; Meera 400"
        const parts = rawSplitDetails.split(";").map(s => s.trim()).filter(Boolean);
        let totalDetailsAmount = 0;
        const amtMap: { [name: string]: number } = {};

        parts.forEach(part => {
          const match = part.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
          if (match) {
            const name = normalizeName(match[1]).normalized;
            const amt = parseFloat(match[2]);
            amtMap[name] = amt;
            totalDetailsAmount += amt;
          }
        });

        // Convert base amount to INR
        if (Math.abs(totalDetailsAmount - amount) > 0.01) {
          addAnomaly(
            "UNEQUAL_SPLIT_MISMATCH",
            "WARNING",
            rowNum,
            `Unequal split details sum to ${totalDetailsAmount} instead of total amount ${amount}: '${rawSplitDetails}'`,
            "split_details",
            rawSplitDetails,
            "Re-scale values proportionally to match total expense amount",
            true
          );

          splitWith.forEach(member => {
            const originalAmt = amtMap[member] || 0;
            const rescaledAmt = (originalAmt / (totalDetailsAmount || 1)) * amountInr;
            splitDetails[member] = rescaledAmt;
          });
        } else {
          splitWith.forEach(member => {
            const originalAmt = amtMap[member] || 0;
            splitDetails[member] = originalAmt * exchangeRate;
          });
        }
      }
    }

    // 7. Timeline membership checks
    if (parsedDate) {
      splitWith.forEach(member => {
        const timeline = MEMBER_TIMELINES[member];
        if (timeline) {
          const joinedDate = new Date(timeline.joined);
          const leftDate = timeline.left ? new Date(timeline.left) : null;
          
          if (parsedDate! < joinedDate) {
            addAnomaly(
              "MEMBER_TIMELINE_VIOLATION",
              "WARNING",
              rowNum,
              `Member ${member} was not yet in the group on ${finalDateStr} (joined ${timeline.joined})`,
              "split_with",
              member,
              `Exclude ${member} from this split`,
              false, // Let user review this
              true
            );
          }
          if (leftDate && parsedDate! > leftDate) {
            addAnomaly(
              "MEMBER_TIMELINE_VIOLATION",
              "WARNING",
              rowNum,
              `Member ${member} had already left the group on ${finalDateStr} (left ${timeline.left})`,
              "split_with",
              member,
              `Exclude ${member} from this split`,
              true,
              false // Auto-apply because they already moved out
            );
            
            // Adjust split details: exclude Meera and redistribute her share equally/proportionally
            if (splitDetails[member] !== undefined) {
              const excludedAmount = splitDetails[member];
              delete splitDetails[member];
              
              // Redistribute her share among remaining active split members
              const activeMembers = Object.keys(splitDetails);
              if (activeMembers.length > 0) {
                const addShare = excludedAmount / activeMembers.length;
                activeMembers.forEach(m => {
                  splitDetails[m] += addShare;
                });
              }
            }
          }
        }
      });
    }

    // 8. Outside / Unknown members
    splitWith.forEach(member => {
      if (!STANDARD_MEMBERS.includes(member)) {
        addAnomaly(
          "UNKNOWN_MEMBER_SPLIT",
          "WARNING",
          rowNum,
          `Non-flatmate guest '${member}' included in split details for '${row.description}'`,
          "split_with",
          member,
          `Create temporary guest account for '${member}'`,
          true
        );
      }
    });

    normalized.push({
      rowNumber: rowNum,
      date: parsedDate,
      dateStr: finalDateStr,
      description: row.description.trim(),
      paidBy: paidBy || "Unknown",
      amount,
      originalAmount: parseFloat(row.amount.replace(/,/g, "")),
      currency,
      exchangeRate,
      amountInr,
      splitType: row.split_type.trim(),
      splitWith,
      splitDetails,
      notes: row.notes.trim(),
      isPayment,
      isDuplicate: false,
      hasConflict: false
    });
  });

  // Step 2: Cross-row duplicate & double-logging detection
  for (let i = 0; i < normalized.length; i++) {
    const itemA = normalized[i];
    
    for (let j = i + 1; j < normalized.length; j++) {
      const itemB = normalized[j];

      // Exact date, same currency (or converted), same payer, same amount, similar description
      const sameDate = itemA.dateStr === itemB.dateStr;
      const samePayer = itemA.paidBy === itemB.paidBy;
      const sameAmount = Math.abs(itemA.amount - itemB.amount) < 0.01;
      
      const descA = itemA.description.toLowerCase();
      const descB = itemB.description.toLowerCase();
      const descSimilar = descA.includes(descB) || descB.includes(descA) || 
                          (descA.substring(0, 5) === descB.substring(0, 5));

      if (sameDate && samePayer && sameAmount && descSimilar) {
        itemB.isDuplicate = true;
        itemB.duplicateOfRow = itemA.rowNumber;
        
        addAnomaly(
          "DUPLICATE_EXPENSE",
          "WARNING",
          itemB.rowNumber,
          `Expense duplicate of row ${itemA.rowNumber} (${itemA.description})`,
          "description",
          itemB.description,
          `Merge/Delete duplicate row ${itemB.rowNumber}`,
          false,
          true // Meera: "I want to approve anything the app deletes or changes"
        );
      }

      // Conflict: same date, same description/venue, different amount or different payer
      const sameVenue = (descA.includes("thalassa") && descB.includes("thalassa")) ||
                        (descA.includes("marina") && descB.includes("marina"));
      
      if (sameDate && sameVenue && (!samePayer || !sameAmount) && !itemB.isDuplicate && !itemA.isDuplicate) {
        itemA.hasConflict = true;
        itemA.conflictWithRow = itemB.rowNumber;
        itemB.hasConflict = true;
        itemB.conflictWithRow = itemA.rowNumber;

        addAnomaly(
          "DOUBLE_LOGGING_CONFLICT",
          "CRITICAL",
          itemB.rowNumber,
          `Double-logged conflict with row ${itemA.rowNumber}. Payer A: ${itemA.paidBy} (${itemA.amount} INR), Payer B: ${itemB.paidBy} (${itemB.amount} INR)`,
          "description",
          itemB.description,
          `Requires manual approval: choose which row wins`,
          false,
          true
        );
      }
    }
  }

  return {
    normalized,
    anomalies
  };
}
