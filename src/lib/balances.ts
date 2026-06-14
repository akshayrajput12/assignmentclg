import { prisma } from "./db";
import type { User, Expense, ExpenseSplit, Payment } from "@prisma/client";

export interface MemberBalance {
  name: string;
  totalPaid: number;   // Total amount paid by this user
  totalOwed: number;   // Total amount this user owes (their share of expenses)
  paymentsSent: number;// Total direct payments sent by this user
  paymentsRecv: number;// Total direct payments received by this user
  netBalance: number;  // netBalance = totalPaid - totalOwed + paymentsSent - paymentsRecv
}

export interface SimplifiedPayment {
  from: string;
  to: string;
  amount: number;
}

export interface AuditItem {
  id: string;
  type: "EXPENSE" | "PAYMENT";
  date: string;
  description: string;
  amount: number;        // Original amount
  currency: string;      // INR, USD
  exchangeRate: number;
  totalInr: number;      // Total cost of expense/payment in INR
  paidBy: string;        // Payer
  yourShareInr: number;  // How much you owe for this item (0 for direct payments unless you sent it)
  netEffectInr: number;  // Net change in your balance: (+paid -owed) or (+received -sent)
}

export async function calculateBalances() {
  // 1. Fetch all users, expenses, splits, and payments
  const users = await prisma.user.findMany();
  const expenses = await prisma.expense.findMany({
    include: {
      splits: true,
      paidBy: true,
    },
  });
  const payments = await prisma.payment.findMany({
    include: {
      fromUser: true,
      toUser: true,
    },
  });

  // Initialize balance map for each user
  const balanceMap: { [userId: string]: MemberBalance & { id: string } } = {};
  users.forEach((u: User) => {
    balanceMap[u.id] = {
      id: u.id,
      name: u.name,
      totalPaid: 0,
      totalOwed: 0,
      paymentsSent: 0,
      paymentsRecv: 0,
      netBalance: 0,
    };
  });

  // Calculate payments paid by users
  expenses.forEach((exp: Expense & { splits: ExpenseSplit[]; paidBy: User }) => {
    const payerId = exp.paidById;
    if (balanceMap[payerId]) {
      // Standardize in INR
      balanceMap[payerId].totalPaid += exp.amountInr;
    }

    // Calculate shares owed by each split user
    exp.splits.forEach((split: ExpenseSplit) => {
      const debtorId = split.userId;
      if (balanceMap[debtorId]) {
        balanceMap[debtorId].totalOwed += split.amount; // already in INR in the split table
      }
    });
  });

  // Add payments (settlements)
  payments.forEach((pay: Payment & { fromUser: User; toUser: User }) => {
    const fromId = pay.fromUserId;
    const toId = pay.toUserId;

    if (balanceMap[fromId]) {
      balanceMap[fromId].paymentsSent += pay.amount;
    }
    if (balanceMap[toId]) {
      balanceMap[toId].paymentsRecv += pay.amount;
    }
  });

  // Compute final net balances
  const balances: MemberBalance[] = Object.values(balanceMap).map(b => {
    // Net balance = what you paid (positive) - what you owe (negative) + payments you sent (positive) - payments you received (negative)
    const netBalance = b.totalPaid - b.totalOwed + b.paymentsSent - b.paymentsRecv;
    return {
      name: b.name,
      totalPaid: Math.round(b.totalPaid * 100) / 100,
      totalOwed: Math.round(b.totalOwed * 100) / 100,
      paymentsSent: Math.round(b.paymentsSent * 100) / 100,
      paymentsRecv: Math.round(b.paymentsRecv * 100) / 100,
      netBalance: Math.round(netBalance * 100) / 100,
    };
  });

  // 2. Simplify Debts (Aisha's view)
  const simplifiedPayments = simplifyDebts(balances);

  return {
    balances,
    simplifiedPayments,
  };
}

// Splitwise-like Debt Simplification Algorithm
function simplifyDebts(balances: MemberBalance[]): SimplifiedPayment[] {
  // Filter and map users into debtors (net balance < 0) and creditors (net balance > 0)
  const debtors = balances
    .filter(b => b.netBalance < -0.05)
    .map(b => ({ name: b.name, balance: b.netBalance }))
    .sort((a, b) => a.balance - b.balance); // Most negative first

  const creditors = balances
    .filter(b => b.netBalance > 0.05)
    .map(b => ({ name: b.name, balance: b.netBalance }))
    .sort((a, b) => b.balance - a.balance); // Most positive first

  const payments: SimplifiedPayment[] = [];

  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amountOwed = -debtor.balance;
    const amountCredited = creditor.balance;

    const paymentAmount = Math.min(amountOwed, amountCredited);
    
    payments.push({
      from: debtor.name,
      to: creditor.name,
      amount: Math.round(paymentAmount * 100) / 100,
    });

    debtor.balance += paymentAmount;
    creditor.balance -= paymentAmount;

    if (Math.abs(debtor.balance) < 0.05) {
      i++;
    }
    if (Math.abs(creditor.balance) < 0.05) {
      j++;
    }
  }

  return payments;
}

// Generate Rohan's audit trail / transaction ledger for a specific member
export async function getMemberLedger(memberName: string): Promise<AuditItem[]> {
  const user = await prisma.user.findUnique({
    where: { name: memberName },
  });

  if (!user) return [];

  const ledger: AuditItem[] = [];

  // 1. Fetch expenses involving this user (either paid by them or split with them)
  const expenses = await prisma.expense.findMany({
    where: {
      OR: [
        { paidById: user.id },
        { splits: { some: { userId: user.id } } }
      ]
    },
    include: {
      paidBy: true,
      splits: {
        where: { userId: user.id }
      }
    },
    orderBy: { date: "asc" }
  });

  expenses.forEach(exp => {
    const isPayer = exp.paidById === user.id;
    const mySplit = exp.splits[0]; // Filtered in query to contain only this user's split
    const myShareInr = mySplit ? mySplit.amount : 0;
    
    // Net effect = (Amount I paid in INR) - (My share in INR)
    const paidInr = isPayer ? exp.amountInr : 0;
    const netEffectInr = paidInr - myShareInr;

    ledger.push({
      id: exp.id,
      type: "EXPENSE",
      date: exp.date.toISOString().split("T")[0],
      description: exp.description,
      amount: exp.amount,
      currency: exp.currency,
      exchangeRate: exp.exchangeRate,
      totalInr: exp.amountInr,
      paidBy: exp.paidBy.name,
      yourShareInr: Math.round(myShareInr * 100) / 100,
      netEffectInr: Math.round(netEffectInr * 100) / 100,
    });
  });

  // 2. Fetch payments sent/received by this user
  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { fromUserId: user.id },
        { toUserId: user.id }
      ]
    },
    include: {
      fromUser: true,
      toUser: true,
    },
    orderBy: { date: "asc" }
  });

  payments.forEach(pay => {
    const isSender = pay.fromUserId === user.id;
    // Net effect = (if sender ? -amount : +amount)
    const netEffectInr = isSender ? pay.amount : -pay.amount;

    ledger.push({
      id: pay.id,
      type: "PAYMENT",
      date: pay.date.toISOString().split("T")[0],
      description: isSender ? `Paid ${pay.toUser.name}` : `Received from ${pay.fromUser.name}`,
      amount: pay.amount,
      currency: pay.currency,
      exchangeRate: 1.0,
      totalInr: pay.amount,
      paidBy: pay.fromUser.name,
      yourShareInr: 0,
      netEffectInr: Math.round(netEffectInr * 100) / 100,
    });
  });

  // Sort by date ascending
  return ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
