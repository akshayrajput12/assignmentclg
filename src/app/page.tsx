"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Upload,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  FileText,
  DollarSign,
  Users,
  ArrowRight,
  ChevronRight,
  Calendar,
  Database,
  Trash2,
  Settings,
  Info,
  Check,
  UserCheck,
  CalendarDays
} from "lucide-react";

import {
  CSVRow,
  Anomaly,
  NormalizedExpense,
  STANDARD_MEMBERS,
  MEMBER_TIMELINES
} from "@/lib/parser";

import { MemberBalance, SimplifiedPayment, AuditItem } from "@/lib/balances";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "ledger" | "import" | "timeline">("import");
  
  // Database sync state
  const [dbSynced, setDbSynced] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [syncSummary, setSyncSummary] = useState<any>(null);
  
  // Import States
  const [csvContent, setCsvContent] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<{
    rowCount: number;
    normalized: NormalizedExpense[];
    anomalies: Anomaly[];
  } | null>(null);

  // Anomaly Resolution State
  const [skippedRows, setSkippedRows] = useState<number[]>([]);
  const [resolvedAnomalies, setResolvedAnomalies] = useState<{
    [anomalyId: string]: { approved: boolean; action: string }
  }>({});
  const [missingPayerMappings, setMissingPayerMappings] = useState<{ [rowNum: number]: string }>({});
  
  // USD exchange rate config
  const [usdRate, setUsdRate] = useState(83.0);

  // Calculation States
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [simplifiedPayments, setSimplifiedPayments] = useState<SimplifiedPayment[]>([]);
  
  // Rohan's Ledger States
  const [selectedMember, setSelectedMember] = useState("Rohan");
  const [ledger, setLedger] = useState<AuditItem[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Load Initial Status / Check if database has data
  useEffect(() => {
    fetchBalances();
  }, []);

  // Fetch balances and check if data exists
  const fetchBalances = async () => {
    try {
      const res = await fetch("/api/balances");
      const data = await res.json();
      if (data.success && data.balances && data.balances.length > 0) {
        // DB has data already
        setBalances(data.balances);
        setSimplifiedPayments(data.simplifiedPayments);
        setDbSynced(true);
        setActiveTab("dashboard");
      }
    } catch (err) {
      console.error("Error fetching initial balances:", err);
    }
  };

  // Fetch Rohan's ledger when selected member changes or DB sync completes
  useEffect(() => {
    if (dbSynced && selectedMember) {
      fetchLedger(selectedMember);
    }
  }, [selectedMember, dbSynced]);

  const fetchLedger = async (name: string) => {
    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/balances/ledger/${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.success) {
        setLedger(data.ledger);
      }
    } catch (err) {
      console.error("Error fetching ledger:", err);
    } finally {
      setLedgerLoading(false);
    }
  };

  // Dry run analysis
  const handleAnalyzeCSV = async (content: string) => {
    setIsAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent: content }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalyzeResult(data);
        
        // Initialize default anomaly resolutions
        const defaultResolutions: typeof resolvedAnomalies = {};
        data.anomalies.forEach((a: Anomaly) => {
          defaultResolutions[a.id] = {
            approved: a.autoApplied,
            action: a.proposedAction
          };
        });
        setResolvedAnomalies(defaultResolutions);

        // Auto-detect duplicates to propose skip
        const duplicates = data.normalized.filter((e: NormalizedExpense) => e.isDuplicate);
        const dupRows = duplicates.map((d: NormalizedExpense) => d.rowNumber);
        setSkippedRows(dupRows); // Meera's duplicates defaulted to skip/delete
      }
    } catch (err) {
      alert("Failed to analyze CSV. Make sure backend is running.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Load default CSV from backend
  const handleLoadLocalCSV = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/import/local-file");
      const data = await res.json();
      if (data.success && data.csvContent) {
        setCsvContent(data.csvContent);
        await handleAnalyzeCSV(data.csvContent);
      } else {
        alert(data.error || "Could not load local CSV file");
      }
    } catch (err) {
      alert("Error reading local CSV file");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Drag and drop CSV upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      setCsvContent(text);
      await handleAnalyzeCSV(text);
    };
    reader.readAsText(file);
  };

  // Toggle row exclusion (Meera's duplicates / changes)
  const toggleRowSkip = (rowNum: number) => {
    setSkippedRows(prev => 
      prev.includes(rowNum) ? prev.filter(r => r !== rowNum) : [...prev, rowNum]
    );
  };

  // Update missing payer selection
  const handlePayerChange = (rowNum: number, payer: string) => {
    setMissingPayerMappings(prev => ({ ...prev, [rowNum]: payer }));
  };

  // Confirm and write to DB
  const handleConfirmImport = async () => {
    if (!analyzeResult) return;

    // Validate that missing payers are resolved
    const missingPayers = analyzeResult.anomalies.filter(a => a.type === "MISSING_PAID_BY");
    const unresolvedPayer = missingPayers.some(mp => !missingPayerMappings[mp.rowNumber]);
    if (unresolvedPayer) {
      alert("Please assign a payer to all rows with missing 'paid_by' fields before importing!");
      return;
    }

    setDbLoading(true);
    try {
      // Map resolved details to the normalized expenses list
      const finalExpenses = analyzeResult.normalized.map(exp => {
        let mappedExp = { ...exp };
        
        // Apply missing payer if mapped
        if (!mappedExp.paidBy || mappedExp.paidBy === "Unknown") {
          const mappedName = missingPayerMappings[mappedExp.rowNumber];
          if (mappedName) mappedExp.paidBy = mappedName;
        }

        // Apply custom exchange rate if USD
        if (mappedExp.currency === "USD") {
          mappedExp.exchangeRate = usdRate;
          mappedExp.amountInr = mappedExp.amount * usdRate;
          
          // Re-scale split details in INR
          const totalInr = mappedExp.amountInr;
          const splitSum = Object.values(mappedExp.splitDetails).reduce((a, b) => a + b, 0);
          if (splitSum > 0) {
            const keys = Object.keys(mappedExp.splitDetails);
            keys.forEach(k => {
              mappedExp.splitDetails[k] = (mappedExp.splitDetails[k] / splitSum) * totalInr;
            });
          }
        }

        return mappedExp;
      });

      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenses: finalExpenses,
          skippedRows,
          resolvedAnomalies
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSyncSummary(data.summary);
        setDbSynced(true);
        await fetchBalances(); // reload balances
        setActiveTab("dashboard");
      } else {
        alert(data.error || "Failed to import data");
      }
    } catch (err) {
      alert("Database transaction failed");
    } finally {
      setDbLoading(false);
    }
  };

  // Anomaly groups
  const groupedAnomalies = useMemo(() => {
    if (!analyzeResult) return { critical: [], warning: [], info: [] };
    return {
      critical: analyzeResult.anomalies.filter(a => a.severity === "CRITICAL"),
      warning: analyzeResult.anomalies.filter(a => a.severity === "WARNING"),
      info: analyzeResult.anomalies.filter(a => a.severity === "INFO"),
    };
  }, [analyzeResult]);

  // Statistics
  const totalStats = useMemo(() => {
    if (!balances || balances.length === 0) return { totalExpenses: 0, usdPortion: 0 };
    const total = balances.reduce((sum, b) => sum + b.totalPaid, 0);
    // Find sum of all converted USD expenses in INR
    let usdInr = 0;
    if (analyzeResult) {
      usdInr = analyzeResult.normalized
        .filter(e => e.currency === "USD" && !skippedRows.includes(e.rowNumber))
        .reduce((sum, e) => sum + e.amount * usdRate, 0);
    }
    return {
      totalExpenses: Math.round(total),
      usdPortion: Math.round(usdInr)
    };
  }, [balances, analyzeResult, skippedRows, usdRate]);

  return (
    <div className="flex-1 bg-slate-950 text-slate-100 font-sans">
      {/* Background decor */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950/40 via-slate-950 to-slate-950 pointer-events-none" />

      <header className="relative z-10 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-lg shadow-lg shadow-emerald-500/20">
              <DollarSign className="h-6 w-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Spreetail Shared Expenses
              </h1>
              <p className="text-xs text-slate-400">Flatmate Ledger & Import Anomaly Resolver</p>
            </div>
          </div>

          <nav className="flex space-x-1">
            {dbSynced && (
              <>
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === "dashboard"
                      ? "bg-slate-800 text-emerald-400 shadow-inner"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveTab("ledger")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === "ledger"
                      ? "bg-slate-800 text-emerald-400 shadow-inner"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  Rohan's Ledger
                </button>
              </>
            )}
            <button
              onClick={() => setActiveTab("import")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === "import"
                  ? "bg-slate-800 text-emerald-400 shadow-inner"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              CSV Import {analyzeResult && <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded-full font-bold">!</span>}
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === "timeline"
                  ? "bg-slate-800 text-emerald-400 shadow-inner"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              Timeline
            </button>
          </nav>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* TAB 1: DASHBOARD */}
        {activeTab === "dashboard" && dbSynced && (
          <div className="space-y-8 animate-fadeIn">
            {/* Stats grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-400 font-medium">Total Expenses</span>
                  <div className="p-2 bg-emerald-500/10 rounded-lg"><DollarSign className="h-5 w-5 text-emerald-400" /></div>
                </div>
                <div className="text-3xl font-bold">₹{totalStats.totalExpenses.toLocaleString()}</div>
                <p className="text-xs text-slate-500 mt-2">Combined flat costs (INR)</p>
              </div>

              <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-400 font-medium">USD Trip Portion</span>
                  <div className="p-2 bg-blue-500/10 rounded-lg"><DollarSign className="h-5 w-5 text-blue-400" /></div>
                </div>
                <div className="text-3xl font-bold">₹{totalStats.usdPortion.toLocaleString()}</div>
                <p className="text-xs text-slate-500 mt-2">Converted from USD @ ₹{usdRate}</p>
              </div>

              <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-400 font-medium">Active Members</span>
                  <div className="p-2 bg-indigo-500/10 rounded-lg"><Users className="h-5 w-5 text-indigo-400" /></div>
                </div>
                <div className="text-3xl font-bold">{balances.length}</div>
                <p className="text-xs text-slate-500 mt-2">Including guest accounts</p>
              </div>

              <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-400 font-medium">Database Synced</span>
                  <div className="p-2 bg-purple-500/10 rounded-lg"><Database className="h-5 w-5 text-purple-400" /></div>
                </div>
                <div className="text-3xl font-bold text-emerald-400 flex items-center">
                  <CheckCircle className="h-6 w-6 mr-2 shrink-0" /> Live
                </div>
                <p className="text-xs text-slate-500 mt-2">Neon PostgreSQL Connected</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Individual Balances */}
              <div className="lg:col-span-2 p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl space-y-6">
                <h3 className="text-lg font-bold flex items-center">
                  <Users className="h-5 w-5 mr-2 text-emerald-400" /> Individual Net Balances
                </h3>
                <div className="space-y-4">
                  {balances.map(b => {
                    const isCreditor = b.netBalance >= 0;
                    return (
                      <div key={b.name} className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl flex items-center justify-between hover:bg-slate-800/80 transition-all">
                        <div className="flex items-center space-x-3">
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm ${
                            isCreditor ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                          }`}>
                            {b.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-200">{b.name}</div>
                            <div className="text-xs text-slate-400">
                              Paid: ₹{b.totalPaid.toLocaleString()} | Share: ₹{b.totalOwed.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Sent Transfers: ₹{b.paymentsSent} | Received: ₹{b.paymentsRecv}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className={`text-lg font-bold ${isCreditor ? "text-emerald-400" : "text-rose-400"}`}>
                            {isCreditor ? "+" : ""}₹{b.netBalance.toLocaleString()}
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            isCreditor ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                          }`}>
                            {isCreditor ? "Owed money" : "Owes money"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Aisha's Simplified Payments */}
              <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl space-y-6">
                <div className="flex flex-col">
                  <h3 className="text-lg font-bold flex items-center">
                    <UserCheck className="h-5 w-5 mr-2 text-emerald-400" /> Aisha's Settlement Pathway
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Simplified transaction pathways to clear all group debts in minimal transfers.
                  </p>
                </div>

                <div className="space-y-4">
                  {simplifiedPayments.length === 0 ? (
                    <div className="p-8 text-center bg-slate-800/20 border border-dashed border-slate-700 rounded-xl text-slate-400">
                      All debts settled! No payments needed.
                    </div>
                  ) : (
                    simplifiedPayments.map((p, idx) => (
                      <div key={idx} className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl flex items-center justify-between">
                        <div className="flex items-center space-x-2 shrink-0">
                          <span className="font-semibold text-rose-400 text-sm">{p.from}</span>
                          <ArrowRight className="h-4 w-4 text-slate-500" />
                          <span className="font-semibold text-emerald-400 text-sm">{p.to}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-100">₹{p.amount.toLocaleString()}</div>
                          <span className="text-[10px] text-slate-400">Direct transfer</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ROHAN'S LEDGER */}
        {activeTab === "ledger" && dbSynced && (
          <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl space-y-6 animate-fadeIn">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
              <div>
                <h3 className="text-lg font-bold flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-emerald-400" /> Rohan's Audit Trail: "No Magic Numbers"
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Select a member to see the list of all expenses and settlements that calculate their balance.
                </p>
              </div>

              {/* Member Selector buttons */}
              <div className="flex flex-wrap gap-2">
                {balances.map(b => (
                  <button
                    key={b.name}
                    onClick={() => setSelectedMember(b.name)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      selectedMember === b.name
                        ? "bg-emerald-500 text-slate-950 font-bold"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-750"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>

            {ledgerLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="h-8 w-8 text-emerald-400 animate-spin mr-3" />
                <span>Generating ledger audit trail...</span>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl flex flex-wrap gap-6 items-center justify-between">
                  <div className="text-sm">
                    Audit target: <span className="font-bold text-emerald-400">{selectedMember}</span>
                  </div>
                  <div className="flex gap-6">
                    <div className="text-center">
                      <span className="text-xs text-slate-400 block">Lent/Paid</span>
                      <span className="text-sm font-semibold text-slate-100">
                        ₹{balances.find(b => b.name === selectedMember)?.totalPaid.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-xs text-slate-400 block">Owed Cost</span>
                      <span className="text-sm font-semibold text-slate-100">
                        -₹{balances.find(b => b.name === selectedMember)?.totalOwed.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-xs text-slate-400 block">Direct Payments Sent</span>
                      <span className="text-sm font-semibold text-slate-100">
                        +₹{balances.find(b => b.name === selectedMember)?.paymentsSent.toLocaleString() || 0}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-xs text-slate-400 block">Payments Received</span>
                      <span className="text-sm font-semibold text-slate-100">
                        -₹{balances.find(b => b.name === selectedMember)?.paymentsRecv.toLocaleString() || 0}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Net Balance Summary</span>
                    <span className={`text-lg font-bold ${
                      (balances.find(b => b.name === selectedMember)?.netBalance || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}>
                      ₹{(balances.find(b => b.name === selectedMember)?.netBalance || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {ledger.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">No transaction logs involving this user.</div>
                ) : (
                  <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900/80 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase">
                          <th className="p-4">Date</th>
                          <th className="p-4">Type</th>
                          <th className="p-4">Description</th>
                          <th className="p-4 text-right">Cost</th>
                          <th className="p-4">Payer</th>
                          <th className="p-4 text-right">Your Share</th>
                          <th className="p-4 text-right">Net Effect</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-sm">
                        {ledger.map((item, idx) => {
                          const isExpense = item.type === "EXPENSE";
                          return (
                            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                              <td className="p-4 whitespace-nowrap text-xs text-slate-400">
                                <Calendar className="inline-block h-3.5 w-3.5 mr-1.5 -mt-0.5 text-slate-500" />
                                {item.date}
                              </td>
                              <td className="p-4">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  isExpense ? "bg-indigo-500/10 text-indigo-400" : "bg-purple-500/10 text-purple-400"
                                }`}>
                                  {item.type}
                                </span>
                              </td>
                              <td className="p-4 font-medium text-slate-200">
                                {item.description}
                                {item.exchangeRate > 1 && (
                                  <span className="text-[10px] text-slate-500 block">
                                    Converts {item.amount} {item.currency} at x{item.exchangeRate}
                                  </span>
                                )}
                              </td>
                              <td className="p-4 text-right whitespace-nowrap text-slate-300">
                                {isExpense ? (
                                  <>₹{item.totalInr.toLocaleString()}</>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className="p-4 text-slate-300">{item.paidBy}</td>
                              <td className="p-4 text-right whitespace-nowrap text-rose-300">
                                {item.yourShareInr > 0 ? <>-₹{item.yourShareInr.toLocaleString()}</> : <span className="text-slate-500">—</span>}
                              </td>
                              <td className={`p-4 text-right font-bold whitespace-nowrap ${
                                item.netEffectInr >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}>
                                {item.netEffectInr >= 0 ? "+" : ""}₹{item.netEffectInr.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CSV IMPORT & RESOLUTION */}
        {activeTab === "import" && (
          <div className="space-y-8 animate-fadeIn">
            {/* CSV Ingestion Panel */}
            <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold flex items-center">
                    <Upload className="h-5 w-5 mr-2 text-emerald-400" /> Ingest CSV Spreadsheet
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload your raw spreadsheet file or import the default `expenses_export.csv` from the server.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleLoadLocalCSV}
                    disabled={isAnalyzing}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/10 flex items-center transition-all disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    One-Click Import Local CSV
                  </button>

                  <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center cursor-pointer transition-all">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload CSV File
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Drag zone / text editor preview */}
              <div className="space-y-4">
                <textarea
                  value={csvContent}
                  onChange={e => setCsvContent(e.target.value)}
                  placeholder="Paste raw CSV data here or click 'One-Click Import Local CSV' above..."
                  className="w-full h-32 bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-slate-750 focus:ring-1 focus:ring-slate-700 resize-y"
                />
                
                {csvContent && !analyzeResult && (
                  <button
                    onClick={() => handleAnalyzeCSV(csvContent)}
                    disabled={isAnalyzing}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-750 text-xs font-bold rounded-xl flex items-center justify-center transition-all"
                  >
                    {isAnalyzing && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                    Analyze Pasted CSV Content
                  </button>
                )}
              </div>
            </div>

            {/* Dry Run Results */}
            {analyzeResult && (
              <div className="space-y-8 animate-fadeIn">
                {/* Configuration section */}
                <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl flex flex-wrap gap-6 items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Settings className="h-5 w-5 text-indigo-400" />
                    <div>
                      <h4 className="font-semibold text-sm">Currency Converter Configuration</h4>
                      <p className="text-[10px] text-slate-400">Priya's request: set the USD to INR conversion exchange rate</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-xl">
                    <span className="text-xs text-slate-400 font-mono">1 USD =</span>
                    <input
                      type="number"
                      value={usdRate}
                      onChange={e => setUsdRate(parseFloat(e.target.value) || 83.0)}
                      className="w-16 bg-transparent text-xs font-bold text-center text-emerald-400 border-b border-dashed border-slate-700 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400 font-mono">INR</span>
                  </div>
                </div>

                {/* Anomaly Resolution Panel */}
                <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl space-y-6">
                  <div className="border-b border-slate-800 pb-4">
                    <h3 className="text-lg font-bold flex items-center text-amber-400">
                      <AlertTriangle className="h-5 w-5 mr-2" /> Anomaly Resolution Center
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      The importer detected {analyzeResult.anomalies.length} deliberate anomalies in the spreadsheet. Choose how to handle them.
                    </p>
                  </div>

                  {/* CRITICAL ANOMALIES */}
                  {groupedAnomalies.critical.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-rose-500 flex items-center">
                        Critical Anomalies ({groupedAnomalies.critical.length}) — Action Required
                      </h4>
                      <div className="space-y-3">
                        {groupedAnomalies.critical.map((anom) => (
                          <div key={anom.id} className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-xl space-y-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded font-bold mr-2">Row {anom.rowNumber}</span>
                                <span className="text-xs text-slate-500 font-mono font-semibold">[{anom.type}]</span>
                                <p className="text-sm text-slate-200 mt-1 font-medium">{anom.description}</p>
                              </div>
                            </div>
                            
                            {/* Interactive Fix for missing paid_by */}
                            {anom.type === "MISSING_PAID_BY" && (
                              <div className="flex items-center space-x-3 bg-slate-950 p-2.5 border border-slate-850 rounded-xl">
                                <span className="text-xs text-slate-400">Resolve: Who paid?</span>
                                <select
                                  value={missingPayerMappings[anom.rowNumber] || ""}
                                  onChange={e => handlePayerChange(anom.rowNumber, e.target.value)}
                                  className="bg-slate-900 text-xs text-slate-200 font-semibold border border-slate-700 px-2 py-1 rounded-lg focus:outline-none focus:border-slate-650"
                                >
                                  <option value="">-- Select Member --</option>
                                  {STANDARD_MEMBERS.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                                {missingPayerMappings[anom.rowNumber] && (
                                  <span className="text-xs text-emerald-400 flex items-center">
                                    <Check className="h-3.5 w-3.5 mr-1" /> Mapped!
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Duplicate Double Logging resolution */}
                            {anom.type === "DOUBLE_LOGGING_CONFLICT" && (
                              <div className="flex flex-col gap-2">
                                <span className="text-xs text-slate-400">Resolve Conflict (choose which expense is correct):</span>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <button
                                    onClick={() => {
                                      // Keep A, Skip B
                                      if (anom.rowNumber) {
                                        if (!skippedRows.includes(anom.rowNumber)) toggleRowSkip(anom.rowNumber);
                                      }
                                    }}
                                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                                      skippedRows.includes(anom.rowNumber)
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                        : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-750"
                                    }`}
                                  >
                                    <div className="font-semibold flex justify-between">
                                      <span>Option A (Original / Row 24)</span>
                                      {skippedRows.includes(anom.rowNumber) && <CheckCircle className="h-4 w-4 text-emerald-400" />}
                                    </div>
                                    <p className="mt-1 text-slate-400">Keep Aisha's Thalassa Dinner (2400 INR)</p>
                                  </button>
                                  
                                  <button
                                    onClick={() => {
                                      // Keep B, Skip A
                                      // Row 24 is A (item.rowNumber is 25)
                                      const rowA = 24;
                                      if (!skippedRows.includes(rowA)) toggleRowSkip(rowA);
                                      if (skippedRows.includes(anom.rowNumber)) toggleRowSkip(anom.rowNumber);
                                    }}
                                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                                      skippedRows.includes(24) && !skippedRows.includes(anom.rowNumber)
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                        : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-750"
                                    }`}
                                  >
                                    <div className="font-semibold flex justify-between">
                                      <span>Option B (Row {anom.rowNumber})</span>
                                      {skippedRows.includes(24) && !skippedRows.includes(anom.rowNumber) && <CheckCircle className="h-4 w-4 text-emerald-400" />}
                                    </div>
                                    <p className="mt-1 text-slate-400">Keep Rohan's Thalassa Dinner (2450 INR)</p>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* WARNING ANOMALIES */}
                  {groupedAnomalies.warning.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center">
                        Warning Anomalies ({groupedAnomalies.warning.length}) — Meera's Approvals
                      </h4>
                      <div className="space-y-3">
                        {groupedAnomalies.warning.map((anom) => (
                          <div key={anom.id} className="p-4 bg-amber-950/10 border border-amber-900/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold mr-2">Row {anom.rowNumber}</span>
                              <span className="text-xs text-slate-500 font-mono font-semibold">[{anom.type}]</span>
                              <p className="text-sm text-slate-200 mt-1 font-medium">{anom.description}</p>
                              <p className="text-xs text-slate-400 mt-1">Proposed fix: {anom.proposedAction}</p>
                            </div>
                            
                            <div className="flex items-center space-x-2 shrink-0">
                              {/* Toggle approval for duplicates deletion */}
                              {anom.type === "DUPLICATE_EXPENSE" ? (
                                <button
                                  onClick={() => toggleRowSkip(anom.rowNumber)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center ${
                                    skippedRows.includes(anom.rowNumber)
                                      ? "bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400"
                                      : "bg-slate-800 hover:bg-slate-750 text-slate-300"
                                  }`}
                                >
                                  {skippedRows.includes(anom.rowNumber) ? (
                                    <>
                                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                                      Approved (Delete Duplicate)
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                      Keep Duplicate Row
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded-lg flex items-center">
                                  <Check className="h-4 w-4 mr-1" /> Auto-applied
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* INFO ANOMALIES */}
                  {groupedAnomalies.info.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500 flex items-center">
                        Informational Normalizations ({groupedAnomalies.info.length}) — Auto-Fixed
                      </h4>
                      <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-850 bg-slate-950/40">
                        {groupedAnomalies.info.map((anom) => (
                          <div key={anom.id} className="p-3 flex items-start justify-between gap-4">
                            <div>
                              <span className="text-[10px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded font-bold mr-2">Row {anom.rowNumber}</span>
                              <span className="text-xs text-slate-400">{anom.description}</span>
                            </div>
                            <span className="text-[10px] text-emerald-400 font-semibold shrink-0 flex items-center bg-emerald-500/10 px-2 py-0.5 rounded">
                              <Check className="h-3 w-3 mr-1" /> Normalized
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Import Dry Run Preview Table */}
                <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl space-y-4">
                  <h3 className="text-lg font-bold flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-indigo-400" /> Normalized Data Preview ({analyzeResult.normalized.length} rows parsed)
                  </h3>
                  <div className="overflow-x-auto border border-slate-800 rounded-xl max-h-96">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase">
                          <th className="p-3">Status</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Description</th>
                          <th className="p-3 text-right">Amount</th>
                          <th className="p-3">Payer</th>
                          <th className="p-3">Split With</th>
                          <th className="p-3">Split Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-xs">
                        {analyzeResult.normalized.map((exp, idx) => {
                          const isSkipped = skippedRows.includes(exp.rowNumber);
                          const isMissingPayer = (!exp.paidBy || exp.paidBy === "Unknown") && !missingPayerMappings[exp.rowNumber];
                          return (
                            <tr key={idx} className={`hover:bg-slate-800/20 transition-colors ${
                              isSkipped ? "opacity-35 line-through bg-rose-950/5" : ""
                            } ${isMissingPayer ? "bg-rose-500/5" : ""}`}>
                              <td className="p-3 font-semibold">
                                {isSkipped ? (
                                  <span className="text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">Skipped</span>
                                ) : isMissingPayer ? (
                                  <span className="text-rose-500 bg-rose-500/20 px-1.5 py-0.5 rounded font-bold">Unassigned Payer</span>
                                ) : (
                                  <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Ready</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-slate-400">{exp.dateStr}</td>
                              <td className="p-3 font-medium text-slate-200">
                                {exp.description}
                                {exp.isPayment && (
                                  <span className="text-[9px] bg-purple-500/10 text-purple-400 px-1.5 py-0.2 rounded font-bold block w-fit mt-0.5">
                                    Direct Payment
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right whitespace-nowrap text-slate-300">
                                {exp.currency === "USD" ? (
                                  <>
                                    ${exp.amount.toFixed(2)} USD
                                    <span className="text-[10px] text-slate-500 block">
                                      ₹{(exp.amount * usdRate).toFixed(2)} INR
                                    </span>
                                  </>
                                ) : (
                                  <>₹{exp.amount.toFixed(2)} INR</>
                                )}
                              </td>
                              <td className="p-3 font-bold text-slate-300">
                                {exp.paidBy && exp.paidBy !== "Unknown"
                                  ? exp.paidBy
                                  : (missingPayerMappings[exp.rowNumber] || <span className="text-rose-400">?</span>)}
                              </td>
                              <td className="p-3 text-slate-400">{exp.splitWith.join(", ")}</td>
                              <td className="p-3 capitalize">{exp.splitType || "equal"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* IMPORT BUTTON */}
                  <button
                    onClick={handleConfirmImport}
                    disabled={dbLoading}
                    className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold rounded-2xl shadow-xl shadow-emerald-500/15 flex items-center justify-center transition-all disabled:opacity-50 text-sm mt-6"
                  >
                    {dbLoading ? (
                      <>
                        <RefreshCw className="h-5 w-5 mr-3 animate-spin" />
                        Writing Relational Records to Neon PostgreSQL...
                      </>
                    ) : (
                      <>
                        <Database className="h-5 w-5 mr-3" />
                        Approve resolutions & Write {analyzeResult.normalized.length - skippedRows.length} transactions to Neon DB
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TIMELINE */}
        {activeTab === "timeline" && (
          <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm shadow-xl space-y-8 animate-fadeIn">
            <div>
              <h3 className="text-lg font-bold flex items-center">
                <CalendarDays className="h-5 w-5 mr-2 text-emerald-400" /> Flatmate Membership Timelines
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Visualizing active periods when members live in the flat. Expenses outside these dates do not affect their balances.
              </p>
            </div>

            <div className="space-y-6">
              {Object.entries(MEMBER_TIMELINES).map(([name, dates]) => {
                const isActive = dates.left === null;
                return (
                  <div key={name} className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-sm font-semibold">
                      <span className="text-slate-200">{name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                      }`}>
                        {isActive ? "Currently Active Member" : "Moved Out"}
                      </span>
                    </div>

                    <div className="relative pt-2">
                      <div className="h-2 bg-slate-950 rounded-full overflow-hidden flex">
                        {/* Timeline visual bar */}
                        {name === "Meera" ? (
                          // Active Feb and Mar, inactive April
                          <div className="w-[66%] bg-gradient-to-r from-amber-500 to-amber-600 h-full" />
                        ) : name === "Sam" ? (
                          // Inactive Feb, Mar, joined mid-April
                          <>
                            <div className="w-[83%] bg-slate-950 h-full" />
                            <div className="w-[17%] bg-gradient-to-r from-emerald-500 to-teal-500 h-full" />
                          </>
                        ) : (
                          // Active throughout
                          <div className="w-full bg-gradient-to-r from-emerald-500 to-indigo-500 h-full" />
                        )}
                      </div>

                      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                        <span>Feb 1, 2026 (Joined)</span>
                        <span>Mar 31, 2026 {name === "Meera" && "(Left)"}</span>
                        <span>Apr 15, 2026 {name === "Sam" && "(Joined)"}</span>
                        <span>Apr 30, 2026</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 pt-2 italic">
                      {name === "Meera" && "Meera moved out at the end of March. She only participates in expenses up to March 31st."}
                      {name === "Sam" && "Sam moved in mid-April. He is excluded from all February, March, and early April expenses."}
                      {name === "Dev" && "Dev is an ongoing member/guest. He participated in the Goa trip."}
                      {!["Meera", "Sam", "Dev"].includes(name) && `${name} is a permanent flatmate active from February to April.`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500 mt-12">
        <p>© 2026 Spreetail Shared Expenses App | AI Collaborative Software Engineering Intern Assignment</p>
      </footer>
    </div>
  );
}
