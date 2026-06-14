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
  CalendarDays,
  Sparkles,
  Zap,
  HelpCircle,
  ShieldCheck,
  Play
} from "lucide-react";

import {
  CSVRow,
  Anomaly,
  NormalizedExpense,
  STANDARD_MEMBERS,
  MEMBER_TIMELINES
} from "@/lib/parser";

import { MemberBalance, SimplifiedPayment, AuditItem } from "@/lib/balances";
import { Tooltip } from "@/components/Tooltip";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"landing" | "dashboard" | "ledger" | "import" | "timeline">("landing");
  
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

  // Stepper state for "How it Works" on Landing Page
  const [activeStep, setActiveStep] = useState(0);

  // Load Initial Status
  useEffect(() => {
    fetchBalances();
  }, []);

  const fetchBalances = async () => {
    try {
      const res = await fetch("/api/balances");
      const data = await res.json();
      if (data.success && data.balances && data.balances.length > 0) {
        setBalances(data.balances);
        setSimplifiedPayments(data.simplifiedPayments);
        setDbSynced(true);
      }
    } catch (err) {
      console.error("Error fetching initial balances:", err);
    }
  };

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
        const defaultResolutions: typeof resolvedAnomalies = {};
        data.anomalies.forEach((a: Anomaly) => {
          defaultResolutions[a.id] = {
            approved: a.autoApplied,
            action: a.proposedAction
          };
        });
        setResolvedAnomalies(defaultResolutions);

        const duplicates = data.normalized.filter((e: NormalizedExpense) => e.isDuplicate);
        const dupRows = duplicates.map((d: NormalizedExpense) => d.rowNumber);
        setSkippedRows(dupRows);
      }
    } catch (err) {
      alert("Failed to analyze CSV. Make sure backend is running.");
    } finally {
      setIsAnalyzing(false);
    }
  };

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

  const toggleRowSkip = (rowNum: number) => {
    setSkippedRows(prev => 
      prev.includes(rowNum) ? prev.filter(r => r !== rowNum) : [...prev, rowNum]
    );
  };

  const handlePayerChange = (rowNum: number, payer: string) => {
    setMissingPayerMappings(prev => ({ ...prev, [rowNum]: payer }));
  };

  const handleConfirmImport = async () => {
    if (!analyzeResult) return;

    const missingPayers = analyzeResult.anomalies.filter(a => a.type === "MISSING_PAID_BY");
    const unresolvedPayer = missingPayers.some(mp => !missingPayerMappings[mp.rowNumber]);
    if (unresolvedPayer) {
      alert("Please assign a payer to all rows with missing 'paid_by' fields before importing!");
      return;
    }

    setDbLoading(true);
    try {
      const finalExpenses = analyzeResult.normalized.map(exp => {
        let mappedExp = { ...exp };
        if (!mappedExp.paidBy || mappedExp.paidBy === "Unknown") {
          const mappedName = missingPayerMappings[mappedExp.rowNumber];
          if (mappedName) mappedExp.paidBy = mappedName;
        }

        if (mappedExp.currency === "USD") {
          mappedExp.exchangeRate = usdRate;
          mappedExp.amountInr = mappedExp.amount * usdRate;
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
          resolvedAnomalies,
          anomalies: analyzeResult ? analyzeResult.anomalies : []
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSyncSummary(data.summary);
        setDbSynced(true);
        await fetchBalances();
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

  const groupedAnomalies = useMemo(() => {
    if (!analyzeResult) return { critical: [], warning: [], info: [] };
    return {
      critical: analyzeResult.anomalies.filter(a => a.severity === "CRITICAL"),
      warning: analyzeResult.anomalies.filter(a => a.severity === "WARNING"),
      info: analyzeResult.anomalies.filter(a => a.severity === "INFO"),
    };
  }, [analyzeResult]);

  const totalStats = useMemo(() => {
    if (!balances || balances.length === 0) return { totalExpenses: 0, usdPortion: 0 };
    const total = balances.reduce((sum, b) => sum + b.totalPaid, 0);
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

  // Timeline Steps details
  const steps = [
    {
      title: "Ingest Messy Spreadsheet",
      desc: "Upload standard or chaotic CSV files. The engine automatically processes inconsistent dates, numbers with commas, and leading spaces.",
      features: ["Date Normalization", "Auto-currency detection", "Floating-point rounding"],
      input: "Date,Description,Amount,Paid By\n04/05/2026, Electricity Bill , \"2,500.00\", unknown",
      output: `{\n  "row": 13,\n  "date": "2026-04-05",\n  "description": "Electricity Bill",\n  "amount": 2500,\n  "currency": "INR",\n  "status": "WARNING_MISSING_PAID_BY"\n}`
    },
    {
      title: "Resolve Data Anomalies",
      desc: "Assign missing payers via dropdowns, automatically correct percentages, and compare duplicates side-by-side for manual approval.",
      features: ["Interactive resolution UI", "Meera's duplicate filter", "Percentage rescaling"],
      input: "// Conflict: Row 24 & Row 25 duplicates\n24, 25/03, Thalassa Dinner, Aisha, 2400\n25, 25/03, Thalassa Dinner, Rohan, 2450",
      output: `{\n  "anomaly": "DOUBLE_LOGGING_CONFLICT",\n  "proposal": "Approve Row 24 (Aisha) and skip Row 25 (Rohan)",\n  "skippedRows": [25]\n}`
    },
    {
      title: "Enforce Roommate Timelines",
      desc: "Ensure split calculations respect individual timelines. Sam won't pay for March bills, and Meera is excluded post-March.",
      features: ["Junction memberships", "Chronological boundaries", "Fair rent division"],
      input: "Expense: March Rent (₹18,000) split with all\nSam joins: April 15 | Meera leaves: March 31",
      output: `// Split share computed:\n{\n  "active_members_march": ["Aisha", "Rohan", "Priya", "Meera", "Dev"],\n  "Meera_share": 3600,  // (18000 / 5)\n  "Sam_share": 0        // Not active in March\n}`
    },
    {
      title: "Minimize Transaction Volume",
      desc: "Calculates total paid versus owed per person to generate the simplified payouts pathway, settling all flat debts in a few transfers.",
      features: ["Greedy matching algorithm", "Aisha's settlement paths", "Zero round-trip transactions"],
      input: "Net Balances:\n- Rohan owes ₹4,500\n- Sam owes ₹2,300\n- Aisha owed ₹6,800",
      output: `// Optimized Payout Paths:\n[\n  { "from": "Rohan", "to": "Aisha", "amount": 4500 },\n  { "from": "Sam", "to": "Aisha", "amount": 2300 }\n]`
    }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-emerald-500/10 selection:text-emerald-700 dot-grid">
      {/* Glow Backdrops */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[600px] h-[600px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="relative z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 cursor-pointer" onClick={() => setActiveTab("landing")}>
            <div className="p-2 bg-emerald-500 text-white rounded-lg shadow-sm shadow-emerald-500/10">
              <DollarSign className="h-4 w-4 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-slate-800">
                FlatSplit.io
              </h1>
              <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Premium SaaS Light</p>
            </div>
          </div>

          <nav className="hidden md:flex space-x-1">
            <button
              onClick={() => setActiveTab("landing")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === "landing" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
              }`}
            >
              Overview
            </button>
            {dbSynced && (
              <>
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                    activeTab === "dashboard" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveTab("ledger")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                    activeTab === "ledger" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                  }`}
                >
                  Rohan's Ledger
                </button>
              </>
            )}
            <button
              onClick={() => setActiveTab("import")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === "import" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
              }`}
            >
              CSV Ingestion
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === "timeline" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
              }`}
            >
              Timelines
            </button>
          </nav>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
              <span className="flex h-1.5 w-1.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-semibold text-emerald-600 select-none">Neon live</span>
            </div>

            {activeTab === "landing" && (
              <button
                onClick={() => setActiveTab(dbSynced ? "dashboard" : "import")}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-xs rounded-full shadow-sm flex items-center transition-all cursor-pointer"
              >
                Launch App <Play className="h-3 w-3 ml-1.5 fill-current" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full relative z-10">
        
        {/* TAB 0: LANDING PAGE */}
        {activeTab === "landing" && (
          <div className="space-y-20 animate-fade-in-up">
            {/* Hero Section */}
            <div className="text-center max-w-3xl mx-auto space-y-5 pt-8">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] text-emerald-600 font-medium shadow-sm">
                <Sparkles className="h-3 w-3" />
                <span>SPREETAIL SHORTLISTING CHALLENGE</span>
              </div>

              <h2 className="text-3xl sm:text-5xl font-medium tracking-tight leading-[1.15] text-slate-900">
                Settle roommate expenses <br className="hidden sm:inline" />
                <span className="text-emerald-500">
                  without the drama
                </span>
              </h2>

              <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
                Automatically resolve 20+ messy spreadsheet anomalies, convert multi-currency trip costs, and enforce roommate membership timelines. Securely synced to Neon PostgreSQL.
              </p>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => setActiveTab(dbSynced ? "dashboard" : "import")}
                  className="w-full sm:w-auto px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-full shadow-sm flex items-center justify-center transition-all cursor-pointer text-xs"
                >
                  Launch Live App <Play className="h-3.5 w-3.5 ml-1.5 fill-current" />
                </button>
                <button
                  onClick={() => setActiveTab("import")}
                  className="w-full sm:w-auto px-6 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-medium rounded-full flex items-center justify-center transition-all cursor-pointer text-xs"
                >
                  Analyze expenses_export.csv <ArrowRight className="h-3.5 w-3.5 ml-1.5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Simulated Live Dashboard Mockup */}
            <div className="relative max-w-4xl mx-auto p-4 bg-white/40 border border-slate-200 rounded-2xl backdrop-blur-md shadow-sm animate-float">
              <div className="absolute -top-3 left-6 px-2.5 py-0.5 bg-white border border-slate-200 text-[9px] text-slate-400 font-semibold uppercase rounded-md shadow-sm">
                Live App Preview Mockup
              </div>
              <div className="rounded-xl overflow-hidden border border-slate-200/60 bg-white p-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl space-y-2">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Total Flat Costs</span>
                  <div className="text-xl font-normal text-slate-800 font-mono">₹1,94,847.99</div>
                  <span className="text-[9px] text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">Active since Feb</span>
                </div>
                <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl space-y-2">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">USD Converted</span>
                  <div className="text-xl font-normal text-slate-800 font-mono">₹64,236.00</div>
                  <span className="text-[9px] text-blue-650 font-medium bg-blue-50 px-2 py-0.5 rounded-full">Goa Trip portion</span>
                </div>
                <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl space-y-2">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Anomalies Fixed</span>
                  <div className="text-xl font-normal text-emerald-600 font-mono">21 Detected</div>
                  <span className="text-[9px] text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full">100% Resolved</span>
                </div>
              </div>
            </div>

            {/* Roommate Quotes Grid */}
            <div className="space-y-6 max-w-6xl mx-auto">
              <div className="text-center space-y-1.5">
                <h3 className="text-xl font-medium tracking-tight text-slate-800">The Roommate Conundrums</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Every flatmate has an explicit request that our system mathematically models and resolves.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="p-5 bg-white border border-slate-200 rounded-xl glass-card flex flex-col justify-between space-y-3.5 shadow-sm">
                  <div className="flex items-center space-x-2.5">
                    <div className="h-8 w-8 bg-emerald-50 text-emerald-600 flex items-center justify-center font-semibold rounded-full text-xs">AI</div>
                    <div>
                      <h4 className="font-semibold text-xs text-slate-700">Aisha</h4>
                      <p className="text-[9px] text-slate-400">The Payout Optimizer</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 italic leading-relaxed font-normal">
                    "I just want one number per person. Who pays whom, how much, done."
                  </p>
                  <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full w-fit">Simplification</span>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-xl glass-card flex flex-col justify-between space-y-3.5 shadow-sm">
                  <div className="flex items-center space-x-2.5">
                    <div className="h-8 w-8 bg-blue-50 text-blue-600 flex items-center justify-center font-semibold rounded-full text-xs">RO</div>
                    <div>
                      <h4 className="font-semibold text-xs text-slate-700">Rohan</h4>
                      <p className="text-[9px] text-slate-400">The Auditor</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 italic leading-relaxed font-normal">
                    "No magic numbers. If the app says I owe ₹2,300, I want to see exactly which expenses make that up."
                  </p>
                  <span className="text-[9px] font-semibold text-blue-650 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full w-fit">Itemized Ledger</span>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-xl glass-card flex flex-col justify-between space-y-3.5 shadow-sm">
                  <div className="flex items-center space-x-2.5">
                    <div className="h-8 w-8 bg-purple-50 text-purple-650 flex items-center justify-center font-semibold rounded-full text-xs">PR</div>
                    <div>
                      <h4 className="font-semibold text-xs text-slate-700">Priya</h4>
                      <p className="text-[9px] text-slate-400">The Traveler</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 italic leading-relaxed font-normal">
                    "Half the trip was in dollars. The sheet pretends a dollar is a rupee. That can’t be right."
                  </p>
                  <span className="text-[9px] font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full w-fit">Multi-Currency</span>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-xl glass-card flex flex-col justify-between space-y-3.5 shadow-sm">
                  <div className="flex items-center space-x-2.5">
                    <div className="h-8 w-8 bg-amber-50 text-amber-600 flex items-center justify-center font-semibold rounded-full text-xs">SA</div>
                    <div>
                      <h4 className="font-semibold text-xs text-slate-700">Sam</h4>
                      <p className="text-[9px] text-slate-400">The Newcomer</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 italic leading-relaxed font-normal">
                    "I moved in mid-April. Why would March electricity affect my balance?"
                  </p>
                  <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full w-fit">Timeline splits</span>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-xl glass-card flex flex-col justify-between space-y-3.5 shadow-sm">
                  <div className="flex items-center space-x-2.5">
                    <div className="h-8 w-8 bg-rose-50 text-rose-600 flex items-center justify-center font-semibold rounded-full text-xs">ME</div>
                    <div>
                      <h4 className="font-semibold text-xs text-slate-700">Meera</h4>
                      <p className="text-[9px] text-slate-400">The Departed</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 italic leading-relaxed font-normal">
                    "Clean up the duplicates — but I want to approve anything the app deletes or changes."
                  </p>
                  <span className="text-[9px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full w-fit">Double check</span>
                </div>
              </div>
            </div>

            {/* Interactive "How it Works" Pipeline */}
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="text-center space-y-1.5">
                <h3 className="text-xl font-medium tracking-tight text-slate-800">How FlatSplit Solves the Chaos</h3>
                <p className="text-xs text-slate-500">
                  Select a step in our ingestion pipeline to see the logic and data mapping in action.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Steps Stepper Selector */}
                <div className="lg:col-span-5 space-y-2 flex flex-col justify-center">
                  {steps.map((step, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveStep(idx)}
                      className={`w-full p-3.5 rounded-xl border text-left flex items-start space-x-3 transition-all cursor-pointer ${
                        activeStep === idx
                          ? "bg-white border-slate-200 shadow-sm"
                          : "bg-transparent border-transparent text-slate-500 hover:bg-slate-100/50"
                      }`}
                    >
                      <span className={`h-5 w-5 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 ${
                        activeStep === idx ? "bg-emerald-500 text-white" : "bg-slate-250 text-slate-400 border border-slate-300"
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className={`font-medium text-xs ${activeStep === idx ? "text-slate-800" : "text-slate-500"}`}>
                          {step.title}
                        </h4>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Step Details Display */}
                <div className="lg:col-span-7 p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-between min-h-[380px]">
                  <div className="space-y-4">
                    <div className="inline-flex items-center space-x-1.5 text-[10px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">
                      <Zap className="h-3 w-3" />
                      <span>Pipeline Step {activeStep + 1}</span>
                    </div>
                    <h3 className="text-lg font-medium text-slate-800">{steps[activeStep].title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-normal">{steps[activeStep].desc}</p>

                    {/* Interactive Code Preview Block */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg space-y-1">
                        <span className="text-[9px] text-slate-400 uppercase font-semibold block">Messy Input</span>
                        <pre className="font-mono text-[10px] text-slate-600 whitespace-pre-wrap leading-tight">
                          {steps[activeStep].input}
                        </pre>
                      </div>
                      <div className="p-3 bg-emerald-50/20 border border-emerald-100/50 rounded-lg space-y-1">
                        <span className="text-[9px] text-emerald-600 uppercase font-semibold block">Processed Output</span>
                        <pre className="font-mono text-[10px] text-slate-700 whitespace-pre-wrap leading-tight">
                          {steps[activeStep].output}
                        </pre>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 mt-4">
                    <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider block mb-2">Key Solutions Included</span>
                    <div className="flex flex-wrap gap-1.5">
                      {steps[activeStep].features.map((f, i) => (
                        <span key={i} className="text-[10px] bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-md text-slate-600 font-medium">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Call to Action */}
            <div className="p-8 bg-white border border-slate-200 rounded-2xl max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
              <div className="space-y-1.5 max-w-xl relative z-10">
                <h3 className="text-lg font-medium text-slate-800">Ready to audit roommate balances?</h3>
                <p className="text-xs text-slate-400">
                  Import the CSV directly, resolve conflicts, and view detailed balance cards for all flatmates.
                </p>
              </div>
              <button
                onClick={() => setActiveTab("import")}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-xs rounded-full shadow-sm shadow-emerald-500/10 transition-all cursor-pointer relative z-10 shrink-0 self-start md:self-center"
              >
                Go to CSV Import Dashboard
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === "dashboard" && dbSynced && (
          <div className="space-y-8 animate-fade-in-up">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Expenses</span>
                  <div className="p-1.5 bg-emerald-50 rounded-lg"><DollarSign className="h-4 w-4 text-emerald-500" /></div>
                </div>
                <div className="text-2xl font-normal tracking-tight text-slate-800 font-mono">₹{totalStats.totalExpenses.toLocaleString()}</div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">Combined roommate accounts</p>
              </div>

              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center">
                    Goa USD Costs
                    <Tooltip content="Priya's request: Converts Goa flights and shack costs from USD to INR, preventing the sheet's original bug of treating $1 as ₹1.">
                      <HelpCircle className="h-3.5 w-3.5 ml-1 text-slate-400 cursor-pointer hover:text-slate-600" />
                    </Tooltip>
                  </span>
                  <div className="p-1.5 bg-blue-50 rounded-lg"><DollarSign className="h-4 w-4 text-blue-500" /></div>
                </div>
                <div className="text-2xl font-normal tracking-tight text-slate-800 font-mono">₹{totalStats.usdPortion.toLocaleString()}</div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">Converted @ rate: 1 USD = ₹{usdRate}</p>
              </div>

              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center">
                    Simplified Debts
                    <Tooltip content="Aisha's request: Minimizes flat transactions by net matching debtors and creditors (e.g. eliminating circular payments).">
                      <HelpCircle className="h-3.5 w-3.5 ml-1 text-slate-400 cursor-pointer hover:text-slate-600" />
                    </Tooltip>
                  </span>
                  <div className="p-1.5 bg-purple-50 rounded-lg"><Zap className="h-4 w-4 text-purple-500" /></div>
                </div>
                <div className="text-2xl font-normal tracking-tight text-slate-800 font-mono">{simplifiedPayments.length} Payments</div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">Reduced transaction round-trips</p>
              </div>

              <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Neon Relational</span>
                  <div className="p-1.5 bg-indigo-50 rounded-lg"><ShieldCheck className="h-4 w-4 text-indigo-500" /></div>
                </div>
                <div className="text-xl font-medium tracking-tight text-emerald-500 flex items-center">
                  <CheckCircle className="h-5 w-5 mr-1.5 text-emerald-500 shrink-0" /> Synchronized
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Safe transactional commits</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Individual Balances */}
              <div className="lg:col-span-2 p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center text-slate-700">
                  <Users className="h-4.5 w-4.5 mr-2 text-emerald-500" /> Roommate Balance Sheets
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {balances.map(b => {
                    const isCreditor = b.netBalance >= 0;
                    return (
                      <div key={b.name} className="p-4 bg-slate-50/50 border border-slate-200/60 hover:border-slate-300 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-all">
                        <div className="flex items-center space-x-3">
                          <div className={`h-9 w-9 rounded-full flex items-center justify-center font-semibold text-xs ${
                            isCreditor ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                          }`}>
                            {b.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800 text-xs">{b.name}</div>
                            <div className="text-[10px] text-slate-450 mt-0.5">
                              Paid: ₹{Math.round(b.totalPaid).toLocaleString()} | Share: ₹{Math.round(b.totalOwed).toLocaleString()}
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5">
                              Settled: Sent ₹{Math.round(b.paymentsSent).toLocaleString()} | Recv ₹{Math.round(b.paymentsRecv).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className={`text-sm font-semibold font-mono ${isCreditor ? "text-emerald-600" : "text-rose-600"}`}>
                            {isCreditor ? "+" : ""}₹{Math.round(b.netBalance).toLocaleString()}
                          </div>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                            isCreditor ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                          }`}>
                            {isCreditor ? "Creditor" : "Debtor"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Aisha's Simplified Payments */}
              <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center text-slate-700">
                    <UserCheck className="h-4.5 w-4.5 mr-2 text-emerald-500" /> Aisha's Settlement Paths
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Optimized repayments calculated by resolving net totals.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {simplifiedPayments.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-medium">
                      All balances cleared! No actions required.
                    </div>
                  ) : (
                    simplifiedPayments.map((p, idx) => (
                      <div key={idx} className="p-3 bg-slate-50/50 border border-slate-200/60 rounded-xl flex items-center justify-between">
                        <div className="flex items-center space-x-2 shrink-0">
                          <span className="font-semibold text-rose-600 text-xs">{p.from}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          <span className="font-semibold text-emerald-600 text-xs">{p.to}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-slate-700 text-xs font-mono">₹{p.amount.toLocaleString()}</div>
                          <span className="text-[8px] text-slate-450 uppercase font-semibold">Direct pay</span>
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
          <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-5 animate-fade-in-up">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center text-slate-700">
                  <FileText className="h-4.5 w-4.5 mr-2 text-emerald-500" /> Rohan's Audit Ledger: "No Magic Numbers"
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pick a member to view every itemized transaction that builds their balance.
                </p>
              </div>

              {/* Member Selector buttons */}
              <div className="flex flex-wrap gap-1">
                {balances.map(b => (
                  <button
                    key={b.name}
                    onClick={() => setSelectedMember(b.name)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-all border cursor-pointer ${
                      selectedMember === b.name
                        ? "bg-emerald-500 text-white border-emerald-500 font-medium"
                        : "bg-white text-slate-500 hover:text-slate-800 border-slate-200"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>

            {ledgerLoading ? (
              <div className="flex items-center justify-center py-20 text-slate-400">
                <RefreshCw className="h-5 w-5 text-emerald-500 animate-spin mr-2" />
                <span>Auditing ledger items...</span>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Ledger metrics header */}
                <div className="p-3 bg-slate-50 border border-slate-200/85 rounded-xl flex flex-wrap gap-6 items-center justify-between">
                  <div className="text-xs text-slate-600 font-medium">
                    Auditing Ledger for: <span className="font-semibold text-emerald-600">{selectedMember}</span>
                  </div>
                  <div className="flex gap-6">
                    <div className="text-center">
                      <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider block">Lent/Paid</span>
                      <span className="text-xs font-normal font-mono text-slate-700">
                        ₹{Math.round(balances.find(b => b.name === selectedMember)?.totalPaid || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider block">Owed Cost</span>
                      <span className="text-xs font-normal font-mono text-slate-700">
                        -₹{Math.round(balances.find(b => b.name === selectedMember)?.totalOwed || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider block">Transfers Sent</span>
                      <span className="text-xs font-normal font-mono text-slate-700">
                        +₹{Math.round(balances.find(b => b.name === selectedMember)?.paymentsSent || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider block">Transfers Recv</span>
                      <span className="text-xs font-normal font-mono text-slate-700">
                        -₹{Math.round(balances.find(b => b.name === selectedMember)?.paymentsRecv || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider block">Audit Net Total</span>
                    <span className={`text-sm font-semibold font-mono ${
                      (balances.find(b => b.name === selectedMember)?.netBalance || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      ₹{Math.round(balances.find(b => b.name === selectedMember)?.netBalance || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {ledger.length === 0 ? (
                  <div className="p-10 text-center text-slate-400 text-xs">No transactions recorded for this user.</div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200/80 rounded-xl bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                          <th className="p-3.5">Date</th>
                          <th className="p-3.5">Type</th>
                          <th className="p-3.5">Description</th>
                          <th className="p-3.5 text-right">Total Cost</th>
                          <th className="p-3.5">Paid By</th>
                          <th className="p-3.5 text-right">Your Share</th>
                          <th className="p-3.5 text-right">Net Effect</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
                        {ledger.map((item, idx) => {
                          const isExpense = item.type === "EXPENSE";
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-3.5 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                                <Calendar className="inline-block h-3 w-3 mr-1.5 -mt-0.5 text-slate-400" />
                                {item.date}
                              </td>
                              <td className="p-3.5">
                                <span className={`text-[8px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                                  isExpense ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-purple-50 text-purple-600 border border-purple-100"
                                }`}>
                                  {item.type}
                                </span>
                              </td>
                              <td className="p-3.5 font-medium text-slate-800">
                                {item.description}
                                {item.exchangeRate > 1 && (
                                  <span className="text-[9px] text-slate-400 block font-normal mt-0.5">
                                    Converted {item.amount} {item.currency} @ ₹{item.exchangeRate}
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 text-right font-mono text-slate-500 font-normal">
                                {isExpense ? <>₹{Math.round(item.totalInr).toLocaleString()}</> : <span className="text-slate-305">—</span>}
                              </td>
                              <td className="p-3.5 text-slate-500">{item.paidBy}</td>
                              <td className="p-3.5 text-right font-mono text-rose-500 font-normal">
                                {item.yourShareInr > 0 ? <>-₹{Math.round(item.yourShareInr).toLocaleString()}</> : <span className="text-slate-305">—</span>}
                              </td>
                              <td className={`p-3.5 text-right font-semibold font-mono ${
                                item.netEffectInr >= 0 ? "text-emerald-600" : "text-rose-600"
                              }`}>
                                {item.netEffectInr >= 0 ? "+" : ""}₹{Math.round(item.netEffectInr).toLocaleString()}
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
          <div className="space-y-8 animate-fade-in-up">
            {/* Ingestion controls */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center text-slate-700">
                    <Upload className="h-4.5 w-4.5 mr-2 text-emerald-500" /> Ingest CSV Spreadsheet
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Upload your raw spreadsheet file or import the default `expenses_export.csv` from the server.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleLoadLocalCSV}
                    disabled={isAnalyzing}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-xs rounded-lg shadow-sm flex items-center transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isAnalyzing ? (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Database className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    One-Click Import Local CSV
                  </button>

                  <label className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-650 font-medium text-xs rounded-lg flex items-center cursor-pointer transition-all">
                    <Upload className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
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

              {/* Textarea */}
              <div className="space-y-3">
                <textarea
                  value={csvContent}
                  onChange={e => setCsvContent(e.target.value)}
                  placeholder="Paste raw CSV data here or click 'One-Click Import Local CSV' above..."
                  className="w-full h-32 bg-slate-50/50 border border-slate-200/80 rounded-xl p-3.5 text-[11px] font-mono text-slate-600 focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-300 resize-y"
                />
                
                {csvContent && !analyzeResult && (
                  <button
                    onClick={() => handleAnalyzeCSV(csvContent)}
                    disabled={isAnalyzing}
                    className="w-full py-2 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium rounded-lg flex items-center justify-center transition-all cursor-pointer"
                  >
                    {isAnalyzing && <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    Analyze Pasted CSV Content
                  </button>
                )}
              </div>
            </div>

            {/* Dry Run Resolutions */}
            {analyzeResult && (
              <div className="space-y-6 animate-fade-in-up">
                {/* Configuration */}
                <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <Settings className="h-4.5 w-4.5 text-blue-500" />
                    <div>
                      <h4 className="font-semibold text-xs text-slate-700">Currency Converter Configuration</h4>
                      <p className="text-[10px] text-slate-400">Priya's request: set the USD to INR conversion exchange rate</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg">
                    <span className="text-[10px] text-slate-450 font-mono">1 USD =</span>
                    <input
                      type="number"
                      value={usdRate}
                      onChange={e => setUsdRate(parseFloat(e.target.value) || 83.0)}
                      className="w-12 bg-transparent text-[11px] font-semibold text-center text-emerald-600 border-b border-dashed border-slate-300 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-450 font-mono">INR</span>
                  </div>
                </div>

                {/* Anomaly Resolution Panel */}
                <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-5">
                  <div className="border-b border-slate-100 pb-3.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center text-amber-500">
                      <AlertTriangle className="h-4.5 w-4.5 mr-2" /> Anomaly Resolution Center
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      The parser identified {analyzeResult.anomalies.length} deliberate anomalies in the CSV. Fix them below:
                    </p>
                  </div>

                  {/* CRITICAL */}
                  {groupedAnomalies.critical.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-rose-500 flex items-center">
                        Critical Anomalies ({groupedAnomalies.critical.length}) — Action Required
                      </h4>
                      <div className="space-y-2.5">
                        {groupedAnomalies.critical.map((anom) => (
                          <div key={anom.id} className="p-4 bg-rose-50/50 border border-rose-100/50 rounded-xl space-y-3">
                            <div className="text-xs">
                              <span className="text-[9px] bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded font-semibold mr-2">Row {anom.rowNumber}</span>
                              <span className="text-[10px] text-slate-400 font-mono">[{anom.type}]</span>
                              <p className="text-xs text-slate-700 mt-1 font-medium">{anom.description}</p>
                            </div>
                            
                            {anom.type === "MISSING_PAID_BY" && (
                              <div className="flex items-center space-x-2.5 bg-white p-2 border border-slate-200 rounded-lg w-fit shadow-2xs">
                                <span className="text-[10px] text-slate-450">Assign Payer:</span>
                                <select
                                  value={missingPayerMappings[anom.rowNumber] || ""}
                                  onChange={e => handlePayerChange(anom.rowNumber, e.target.value)}
                                  className="bg-slate-50 text-[10px] text-slate-600 font-semibold border border-slate-200 px-2 py-0.5 rounded focus:outline-none cursor-pointer"
                                >
                                  <option value="">-- Select --</option>
                                  {STANDARD_MEMBERS.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {anom.type === "DOUBLE_LOGGING_CONFLICT" && (
                              <div className="flex flex-col gap-2">
                                <span className="text-[10px] text-slate-450">Resolve Double Logging:</span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <button
                                    onClick={() => {
                                      if (anom.rowNumber && !skippedRows.includes(anom.rowNumber)) toggleRowSkip(anom.rowNumber);
                                    }}
                                    className={`p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                                      skippedRows.includes(anom.rowNumber)
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-medium shadow-3xs"
                                        : "bg-white border-slate-200 text-slate-400"
                                    }`}
                                  >
                                    <div className="font-semibold flex justify-between text-[11px]">
                                      <span>Option A (Original / Row 24)</span>
                                      {skippedRows.includes(anom.rowNumber) && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                                    </div>
                                    <p className="mt-0.5 text-[9px] text-slate-400 font-normal">Keep Aisha's Thalassa Dinner (2400 INR)</p>
                                  </button>
                                  
                                  <button
                                    onClick={() => {
                                      const rowA = 24;
                                      if (!skippedRows.includes(rowA)) toggleRowSkip(rowA);
                                      if (skippedRows.includes(anom.rowNumber)) toggleRowSkip(anom.rowNumber);
                                    }}
                                    className={`p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                                      skippedRows.includes(24) && !skippedRows.includes(anom.rowNumber)
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-medium shadow-3xs"
                                        : "bg-white border-slate-200 text-slate-400"
                                    }`}
                                  >
                                    <div className="font-semibold flex justify-between text-[11px]">
                                      <span>Option B (Row {anom.rowNumber})</span>
                                      {skippedRows.includes(24) && !skippedRows.includes(anom.rowNumber) && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                                    </div>
                                    <p className="mt-0.5 text-[9px] text-slate-400 font-normal">Keep Rohan's Thalassa Dinner (2450 INR)</p>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* WARNING */}
                  {groupedAnomalies.warning.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 flex items-center">
                        Warning Anomalies ({groupedAnomalies.warning.length}) — Roommate Approvals
                      </h4>
                      <div className="space-y-2">
                        {groupedAnomalies.warning.map((anom) => (
                          <div key={anom.id} className="p-3.5 bg-amber-50/20 border border-amber-100/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="text-xs">
                              <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-semibold mr-2">Row {anom.rowNumber}</span>
                              <span className="text-[10px] text-slate-450 font-mono">[{anom.type}]</span>
                              <p className="text-xs text-slate-700 mt-1 font-medium">{anom.description}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Proposed Resolution: {anom.proposedAction}</p>
                            </div>
                            
                            <div className="flex items-center space-x-2 shrink-0">
                              {anom.type === "DUPLICATE_EXPENSE" ? (
                                <button
                                  onClick={() => toggleRowSkip(anom.rowNumber)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center cursor-pointer ${
                                    skippedRows.includes(anom.rowNumber)
                                      ? "bg-rose-50 border border-rose-200 text-rose-600 shadow-2xs"
                                      : "bg-white border border-slate-200 text-slate-450"
                                  }`}
                                >
                                  {skippedRows.includes(anom.rowNumber) ? (
                                    <>
                                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                                      Approved (Delete Row)
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                      Keep Duplicate Row
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className="text-[9px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg flex items-center">
                                  <Check className="h-3 w-3 mr-1" /> Auto-Applied
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* INFO */}
                  {groupedAnomalies.info.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-blue-500 flex items-center">
                        Informational Normalizations ({groupedAnomalies.info.length}) — Auto-Fixed
                      </h4>
                      <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/30">
                        {groupedAnomalies.info.map((anom) => (
                          <div key={anom.id} className="p-3 flex items-start justify-between gap-4">
                            <div className="text-xs">
                              <span className="text-[8px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded font-semibold mr-2">Row {anom.rowNumber}</span>
                              <span className="text-slate-600 text-[11px]">{anom.description}</span>
                            </div>
                            <span className="text-[8px] text-emerald-600 font-semibold shrink-0 flex items-center bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                              <Check className="h-2.5 w-2.5 mr-0.5" /> Normalized
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Import Table */}
                <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center text-slate-700">
                    <FileText className="h-4.5 w-4.5 mr-2 text-blue-500" /> Normalized Data Preview ({analyzeResult.normalized.length} rows)
                  </h3>
                  <div className="overflow-x-auto border border-slate-200/80 rounded-xl max-h-96">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                          <th className="p-3">Status</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Description</th>
                          <th className="p-3 text-right">Amount</th>
                          <th className="p-3">Payer</th>
                          <th className="p-3">Split With</th>
                          <th className="p-3">Split Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-650">
                        {analyzeResult.normalized.map((exp, idx) => {
                          const isSkipped = skippedRows.includes(exp.rowNumber);
                          const isMissingPayer = (!exp.paidBy || exp.paidBy === "Unknown") && !missingPayerMappings[exp.rowNumber];
                          return (
                            <tr key={idx} className={`hover:bg-slate-50/50 transition-colors ${
                              isSkipped ? "opacity-35 line-through bg-rose-50/10" : ""
                            } ${isMissingPayer ? "bg-rose-50/5" : ""}`}>
                              <td className="p-3 text-[10px]">
                                {isSkipped ? (
                                  <span className="text-rose-500 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded font-semibold">Skipped</span>
                                ) : isMissingPayer ? (
                                  <span className="text-rose-550 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded font-semibold">Unassigned Payer</span>
                                ) : (
                                  <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-semibold">Ready</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-450">{exp.dateStr}</td>
                              <td className="p-3 font-medium text-slate-800">
                                {exp.description}
                                {exp.isPayment && (
                                  <span className="text-[8px] bg-purple-50 border border-purple-100 text-purple-650 px-1.5 py-0.2 rounded font-semibold block w-fit mt-1">
                                    Repayment
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right whitespace-nowrap font-mono text-[11px] font-normal text-slate-600">
                                {exp.currency === "USD" ? (
                                  <>
                                    ${exp.amount.toFixed(2)} USD
                                    <span className="text-[9px] text-slate-400 block font-normal">
                                      ₹{(exp.amount * usdRate).toFixed(2)} INR
                                    </span>
                                  </>
                                ) : (
                                  <>₹{exp.amount.toFixed(2)} INR</>
                                )}
                              </td>
                              <td className="p-3 font-medium text-slate-700">
                                {exp.paidBy && exp.paidBy !== "Unknown"
                                  ? exp.paidBy
                                  : (missingPayerMappings[exp.rowNumber] || <span className="text-rose-600 font-bold">?</span>)}
                              </td>
                              <td className="p-3 text-slate-500">{exp.splitWith.join(", ")}</td>
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
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl shadow-md shadow-emerald-500/10 flex items-center justify-center transition-all disabled:opacity-50 text-xs mt-6 cursor-pointer"
                  >
                    {dbLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2.5 animate-spin" />
                        Writing Relational Records to Neon PostgreSQL...
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4 mr-2.5" />
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
          <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6 animate-fade-in-up">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center text-slate-700">
                <CalendarDays className="h-4.5 w-4.5 mr-2 text-emerald-500" /> Flatmate Membership Timelines
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Visualizing active periods when members live in the flat. Expenses outside these dates do not affect their balances.
              </p>
            </div>

            <div className="space-y-4">
              {Object.entries(MEMBER_TIMELINES).map(([name, dates]) => {
                const isActive = dates.left === null;
                return (
                  <div key={name} className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-slate-800">{name}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                        isActive ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                      }`}>
                        {isActive ? "Currently Active Member" : "Moved Out"}
                      </span>
                    </div>

                    <div className="relative pt-1">
                      <div className="h-1.5 bg-slate-200/80 rounded-full overflow-hidden flex">
                        {name === "Meera" ? (
                          <div className="w-[66%] bg-amber-400 h-full" />
                        ) : name === "Sam" ? (
                          <>
                            <div className="w-[83%] bg-slate-100 h-full" />
                            <div className="w-[17%] bg-emerald-400 h-full" />
                          </>
                        ) : (
                          <div className="w-full bg-emerald-400 h-full" />
                        )}
                      </div>

                      <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-1">
                        <span>Feb 1, 2026 (Joined)</span>
                        <span>Mar 31, 2026 {name === "Meera" && "(Left)"}</span>
                        <span>Apr 15, 2026 {name === "Sam" && "(Joined)"}</span>
                        <span>Apr 30, 2026</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 pt-1 font-normal leading-relaxed">
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

      <footer className="relative z-10 border-t border-slate-200 bg-white py-8 text-center text-[10px] text-slate-450 mt-20">
        <p>© 2026 FlatSplit.io | Built for Spreetail Software Developer Assignment | Premium Light SaaS & Neon DB</p>
      </footer>
    </div>
  );
}
