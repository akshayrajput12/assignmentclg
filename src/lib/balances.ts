import { pool } from "./db";

export interface MemberBalance {
  name: string;
  totalPaid: number;
  totalOwed: number;
  paymentsSent: number;
  paymentsRecv: number;
  netBalance: number;
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
  amount: number;
  currency: string;
  exchangeRate: number;
  totalInr: number;
  paidBy: string;
  yourShareInr: number;
  netEffectInr: number;
}

export async function calculateBalances() {
  const [usersRes, expensesRes, splitsRes, paymentsRes] = await Promise.all([
    pool.query<{ id: string; name: string }>(`SELECT id, name FROM "User"`),
    pool.query<{ id: string; paidById: string; amountInr: number }>(
      `SELECT id, "paidById", "amountInr" FROM "Expense"`
    ),
    pool.query<{ expenseId: string; userId: string; amount: number }>(
      `SELECT "expenseId", "userId", amount FROM "ExpenseSplit"`
    ),
    pool.query<{ fromUserId: string; toUserId: string; amount: number }>(
      `SELECT "fromUserId", "toUserId", amount FROM "Payment"`
    ),
  ]);

  const splitsByExpense: Record<string, Array<{ userId: string; amount: number }>> = {};
  for (const s of splitsRes.rows) {
    if (!splitsByExpense[s.expenseId]) splitsByExpense[s.expenseId] = [];
    splitsByExpense[s.expenseId].push({ userId: s.userId, amount: Number(s.amount) });
  }

  const balanceMap: Record<string, MemberBalance & { id: string }> = {};
  for (const u of usersRes.rows) {
    balanceMap[u.id] = {
      id: u.id,
      name: u.name,
      totalPaid: 0,
      totalOwed: 0,
      paymentsSent: 0,
      paymentsRecv: 0,
      netBalance: 0,
    };
  }

  for (const exp of expensesRes.rows) {
    if (balanceMap[exp.paidById]) {
      balanceMap[exp.paidById].totalPaid += Number(exp.amountInr);
    }
    for (const split of splitsByExpense[exp.id] ?? []) {
      if (balanceMap[split.userId]) {
        balanceMap[split.userId].totalOwed += split.amount;
      }
    }
  }

  for (const pay of paymentsRes.rows) {
    if (balanceMap[pay.fromUserId]) {
      balanceMap[pay.fromUserId].paymentsSent += Number(pay.amount);
    }
    if (balanceMap[pay.toUserId]) {
      balanceMap[pay.toUserId].paymentsRecv += Number(pay.amount);
    }
  }

  const balances: MemberBalance[] = Object.values(balanceMap).map((b) => {
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

  return {
    balances,
    simplifiedPayments: simplifyDebts(balances),
  };
}

function simplifyDebts(balances: MemberBalance[]): SimplifiedPayment[] {
  const debtors = balances
    .filter((b) => b.netBalance < -0.05)
    .map((b) => ({ name: b.name, balance: b.netBalance }))
    .sort((a, b) => a.balance - b.balance);

  const creditors = balances
    .filter((b) => b.netBalance > 0.05)
    .map((b) => ({ name: b.name, balance: b.netBalance }))
    .sort((a, b) => b.balance - a.balance);

  const payments: SimplifiedPayment[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const paymentAmount = Math.min(-debtor.balance, creditor.balance);

    payments.push({
      from: debtor.name,
      to: creditor.name,
      amount: Math.round(paymentAmount * 100) / 100,
    });

    debtor.balance += paymentAmount;
    creditor.balance -= paymentAmount;

    if (Math.abs(debtor.balance) < 0.05) i++;
    if (Math.abs(creditor.balance) < 0.05) j++;
  }

  return payments;
}

export async function getMemberLedger(memberName: string): Promise<AuditItem[]> {
  const userRes = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM "User" WHERE name = $1`,
    [memberName]
  );
  if (userRes.rows.length === 0) return [];
  const user = userRes.rows[0];

  const [expensesRes, splitsRes, paymentsRes] = await Promise.all([
    pool.query<{
      id: string;
      date: Date;
      description: string;
      amount: number;
      currency: string;
      exchangeRate: number;
      amountInr: number;
      paidById: string;
      paidByName: string;
    }>(
      `SELECT e.id, e.date, e.description, e.amount, e.currency, e."exchangeRate", e."amountInr",
              e."paidById", u.name AS "paidByName"
       FROM "Expense" e
       JOIN "User" u ON u.id = e."paidById"
       WHERE e."paidById" = $1
          OR EXISTS (
            SELECT 1 FROM "ExpenseSplit" s WHERE s."expenseId" = e.id AND s."userId" = $1
          )
       ORDER BY e.date ASC`,
      [user.id]
    ),
    pool.query<{ expenseId: string; amount: number }>(
      `SELECT "expenseId", amount FROM "ExpenseSplit" WHERE "userId" = $1`,
      [user.id]
    ),
    pool.query<{
      id: string;
      date: Date;
      amount: number;
      currency: string;
      fromUserId: string;
      toUserId: string;
      fromUserName: string;
      toUserName: string;
    }>(
      `SELECT p.id, p.date, p.amount, p.currency, p."fromUserId", p."toUserId",
              fu.name AS "fromUserName", tu.name AS "toUserName"
       FROM "Payment" p
       JOIN "User" fu ON fu.id = p."fromUserId"
       JOIN "User" tu ON tu.id = p."toUserId"
       WHERE p."fromUserId" = $1 OR p."toUserId" = $1
       ORDER BY p.date ASC`,
      [user.id]
    ),
  ]);

  const splitByExpense: Record<string, number> = {};
  for (const s of splitsRes.rows) {
    splitByExpense[s.expenseId] = Number(s.amount);
  }

  const ledger: AuditItem[] = [];

  for (const exp of expensesRes.rows) {
    const isPayer = exp.paidById === user.id;
    const myShareInr = splitByExpense[exp.id] ?? 0;
    const paidInr = isPayer ? Number(exp.amountInr) : 0;
    const netEffectInr = paidInr - myShareInr;

    ledger.push({
      id: exp.id,
      type: "EXPENSE",
      date: new Date(exp.date).toISOString().split("T")[0],
      description: exp.description,
      amount: Number(exp.amount),
      currency: exp.currency,
      exchangeRate: Number(exp.exchangeRate),
      totalInr: Number(exp.amountInr),
      paidBy: exp.paidByName,
      yourShareInr: Math.round(myShareInr * 100) / 100,
      netEffectInr: Math.round(netEffectInr * 100) / 100,
    });
  }

  for (const pay of paymentsRes.rows) {
    const isSender = pay.fromUserId === user.id;
    const netEffectInr = isSender ? Number(pay.amount) : -Number(pay.amount);

    ledger.push({
      id: pay.id,
      type: "PAYMENT",
      date: new Date(pay.date).toISOString().split("T")[0],
      description: isSender
        ? `Paid ${pay.toUserName}`
        : `Received from ${pay.fromUserName}`,
      amount: Number(pay.amount),
      currency: pay.currency,
      exchangeRate: 1.0,
      totalInr: Number(pay.amount),
      paidBy: pay.fromUserName,
      yourShareInr: 0,
      netEffectInr: Math.round(netEffectInr * 100) / 100,
    });
  }

  return ledger.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}
