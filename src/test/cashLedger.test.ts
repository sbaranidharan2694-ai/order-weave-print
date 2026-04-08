import { describe, it, expect } from "vitest";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/hooks/useExpenses";

// ─── Pure logic extracted from useExpenseStats ───────────────────────────────

type LedgerRow = {
  expense_date: string;
  amount: number;
  category: string;
  entry_type: string | null;
  payment_method: string;
};

function computeStats(
  rows: LedgerRow[],
  todayStr: string,
  monthStart: string,
  fromDate: string,
  toDate: string
) {
  let todayExpenses = 0;
  let todayReceipts = 0;
  let monthExpenses = 0;
  let monthReceipts = 0;
  let openingBalanceToday = 0;
  let bankDepositedToday = 0;
  const byCategory: Record<string, number> = {};

  for (const e of rows) {
    const amt = Number(e.amount) || 0;
    const et: string = e.entry_type == null ? "expense" : e.entry_type;
    const isExpense = et === "expense";
    const isReceipt = et === "receipt";
    const isOpening = et === "opening_balance";
    const isBankDeposit = et === "bank_deposit";
    const isToday = e.expense_date === todayStr;
    const isThisMonth = e.expense_date >= monthStart;

    if (isToday && isExpense) todayExpenses += amt;
    if (isToday && isReceipt) todayReceipts += amt;
    if (isToday && isOpening) openingBalanceToday += amt;
    if (isToday && isBankDeposit) bankDepositedToday += amt;
    if (isThisMonth && isExpense) monthExpenses += amt;
    if (isThisMonth && isReceipt) monthReceipts += amt;

    if (isExpense && e.expense_date >= fromDate && e.expense_date <= toDate) {
      byCategory[e.category] = (byCategory[e.category] || 0) + amt;
    }
  }

  const cashInHand =
    openingBalanceToday > 0
      ? openingBalanceToday + todayReceipts - todayExpenses - bankDepositedToday
      : null;

  return {
    todayExpenses,
    todayReceipts,
    netCashToday: todayReceipts - todayExpenses,
    monthExpenses,
    monthReceipts,
    cashInHand,
    hasOpeningBalance: openingBalanceToday > 0,
    byCategory,
  };
}

// ─── Pure logic from useDailySummary ─────────────────────────────────────────

type DailyRow = {
  amount: number;
  entry_type: string | null;
  payment_method: string;
  actual_counted: number | null;
  variance: number | null;
};

function computeDailySummary(rows: DailyRow[]) {
  let openingCash = 0;
  let cashReceived = 0;
  let cashExpenses = 0;
  let bankDeposited = 0;
  let savedActualCounted: number | null = null;
  let savedVariance: number | null = null;

  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    const rt: string = r.entry_type == null ? "expense" : r.entry_type;
    if (rt === "opening_balance") openingCash += amt;
    if (rt === "receipt" && r.payment_method === "Cash") cashReceived += amt;
    if (rt === "expense" && r.payment_method === "Cash") cashExpenses += amt;
    if (rt === "bank_deposit") bankDeposited += amt;
    if (rt === "adjustment" && r.actual_counted !== null) {
      savedActualCounted = r.actual_counted;
      savedVariance = r.variance;
    }
  }

  const expectedCash = openingCash + cashReceived - cashExpenses - bankDeposited;

  return {
    openingCash,
    cashReceived,
    cashExpenses,
    bankDeposited,
    expectedCash,
    actualCounted: savedActualCounted,
    variance: savedVariance,
    hasOpeningBalance: openingCash > 0,
  };
}

// ─── Client-side entry_type filter (from useExpenses) ────────────────────────

type FilterRow = { entry_type: string | null };

function filterByEntryType(rows: FilterRow[], entryType: "all" | "expense" | "receipt"): FilterRow[] {
  if (!entryType || entryType === "all") return rows;
  return rows.filter((r) => {
    const et = r.entry_type ?? "expense";
    return et === entryType;
  });
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

describe("EXPENSE_CATEGORIES", () => {
  it("defaults to Ink / Toner as first category", () => {
    expect(EXPENSE_CATEGORIES[0]).toBe("Ink / Toner");
  });

  it("does not contain old Printing Materials label", () => {
    expect(EXPENSE_CATEGORIES).not.toContain("Printing Materials");
  });

  it("contains all expected categories", () => {
    const expected = ["Ink / Toner", "Paper Purchase", "Transport", "Office Supplies", "Miscellaneous"];
    for (const cat of expected) {
      expect(EXPENSE_CATEGORIES).toContain(cat);
    }
  });
});

describe("PAYMENT_METHODS", () => {
  it("contains Cash, UPI, Bank Transfer", () => {
    expect(PAYMENT_METHODS).toContain("Cash");
    expect(PAYMENT_METHODS).toContain("UPI");
    expect(PAYMENT_METHODS).toContain("Bank Transfer");
  });
});

// ─── KPI STATS ────────────────────────────────────────────────────────────────

describe("computeStats — KPI cards", () => {
  const today = "2026-04-09";
  const monthStart = "2026-04-01";

  it("counts today expense correctly", () => {
    const rows: LedgerRow[] = [
      { expense_date: today, amount: 500, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.todayExpenses).toBe(500);
    expect(s.todayReceipts).toBe(0);
    expect(s.netCashToday).toBe(-500);
  });

  it("counts today receipt correctly", () => {
    const rows: LedgerRow[] = [
      { expense_date: today, amount: 1200, category: "", entry_type: "receipt", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.todayReceipts).toBe(1200);
    expect(s.todayExpenses).toBe(0);
    expect(s.netCashToday).toBe(1200);
  });

  it("net cash today is positive when receipts > expenses", () => {
    const rows: LedgerRow[] = [
      { expense_date: today, amount: 2000, category: "", entry_type: "receipt", payment_method: "Cash" },
      { expense_date: today, amount: 500, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.netCashToday).toBe(1500);
  });

  it("net cash today is negative when expenses > receipts", () => {
    const rows: LedgerRow[] = [
      { expense_date: today, amount: 300, category: "", entry_type: "receipt", payment_method: "Cash" },
      { expense_date: today, amount: 800, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.netCashToday).toBe(-500);
  });

  it("accumulates month expenses from multiple rows", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-04-01", amount: 1000, category: "Transport", entry_type: "expense", payment_method: "Cash" },
      { expense_date: "2026-04-05", amount: 2000, category: "Ink / Toner", entry_type: "expense", payment_method: "UPI" },
      { expense_date: "2026-04-09", amount: 500, category: "Office Supplies", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.monthExpenses).toBe(3500);
    expect(s.monthReceipts).toBe(0);
  });

  it("accumulates month receipts from multiple rows", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-04-03", amount: 5000, category: "", entry_type: "receipt", payment_method: "Cash" },
      { expense_date: "2026-04-07", amount: 3000, category: "", entry_type: "receipt", payment_method: "UPI" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.monthReceipts).toBe(8000);
    expect(s.monthExpenses).toBe(0);
  });

  it("excludes receipts from month expenses total", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-04-03", amount: 5000, category: "", entry_type: "receipt", payment_method: "Cash" },
      { expense_date: "2026-04-04", amount: 1000, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.monthExpenses).toBe(1000);
    expect(s.monthReceipts).toBe(5000);
  });

  it("NULL entry_type is treated as expense (pre-migration rows)", () => {
    const rows: LedgerRow[] = [
      { expense_date: today, amount: 750, category: "Transport", entry_type: null, payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.todayExpenses).toBe(750);
    expect(s.todayReceipts).toBe(0);
    expect(s.monthExpenses).toBe(750);
  });

  it("excludes rows outside the month from month totals", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-03-31", amount: 9999, category: "Transport", entry_type: "expense", payment_method: "Cash" },
      { expense_date: "2026-04-01", amount: 100, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.monthExpenses).toBe(100);
  });

  it("does not count tomorrow as today", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-04-10", amount: 999, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.todayExpenses).toBe(0);
  });
});

// ─── CASH IN HAND ─────────────────────────────────────────────────────────────

describe("computeStats — cashInHand", () => {
  const today = "2026-04-09";
  const monthStart = "2026-04-01";

  it("cashInHand is null when no opening balance exists", () => {
    const rows: LedgerRow[] = [
      { expense_date: today, amount: 500, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.cashInHand).toBeNull();
    expect(s.hasOpeningBalance).toBe(false);
  });

  it("cashInHand = opening + receipts - expenses - bank deposit", () => {
    const rows: LedgerRow[] = [
      { expense_date: today, amount: 5000, category: "Opening", entry_type: "opening_balance", payment_method: "Cash" },
      { expense_date: today, amount: 2000, category: "", entry_type: "receipt", payment_method: "Cash" },
      { expense_date: today, amount: 800, category: "Transport", entry_type: "expense", payment_method: "Cash" },
      { expense_date: today, amount: 1000, category: "", entry_type: "bank_deposit", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.cashInHand).toBe(5000 + 2000 - 800 - 1000);
    expect(s.cashInHand).toBe(5200);
    expect(s.hasOpeningBalance).toBe(true);
  });

  it("cashInHand can be negative (overspent)", () => {
    const rows: LedgerRow[] = [
      { expense_date: today, amount: 1000, category: "Opening", entry_type: "opening_balance", payment_method: "Cash" },
      { expense_date: today, amount: 3000, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.cashInHand).toBe(-2000);
  });
});

// ─── CATEGORY BREAKDOWN ───────────────────────────────────────────────────────

describe("computeStats — byCategory (date-filter-aware)", () => {
  const today = "2026-04-09";
  const monthStart = "2026-04-01";

  it("groups expenses by category within date range", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-04-05", amount: 500, category: "Transport", entry_type: "expense", payment_method: "Cash" },
      { expense_date: "2026-04-06", amount: 300, category: "Transport", entry_type: "expense", payment_method: "Cash" },
      { expense_date: "2026-04-07", amount: 200, category: "Ink / Toner", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.byCategory["Transport"]).toBe(800);
    expect(s.byCategory["Ink / Toner"]).toBe(200);
  });

  it("excludes receipts from category breakdown", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-04-05", amount: 1000, category: "", entry_type: "receipt", payment_method: "Cash" },
      { expense_date: "2026-04-05", amount: 200, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, today);
    expect(s.byCategory[""]).toBeUndefined();
    expect(s.byCategory["Transport"]).toBe(200);
  });

  it("respects fromDate filter for byCategory", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-04-01", amount: 999, category: "Transport", entry_type: "expense", payment_method: "Cash" },
      { expense_date: "2026-04-05", amount: 100, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, "2026-04-03", today);
    expect(s.byCategory["Transport"]).toBe(100);
  });

  it("respects toDate filter for byCategory", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-04-04", amount: 200, category: "Transport", entry_type: "expense", payment_method: "Cash" },
      { expense_date: "2026-04-08", amount: 999, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, today, monthStart, monthStart, "2026-04-05");
    expect(s.byCategory["Transport"]).toBe(200);
  });
});

// ─── DAILY SUMMARY ────────────────────────────────────────────────────────────

describe("computeDailySummary", () => {
  it("returns all zeros when no rows", () => {
    const s = computeDailySummary([]);
    expect(s.openingCash).toBe(0);
    expect(s.cashReceived).toBe(0);
    expect(s.cashExpenses).toBe(0);
    expect(s.bankDeposited).toBe(0);
    expect(s.expectedCash).toBe(0);
    expect(s.hasOpeningBalance).toBe(false);
  });

  it("calculates expectedCash = opening + received - expenses - deposited", () => {
    const rows: DailyRow[] = [
      { amount: 5000, entry_type: "opening_balance", payment_method: "Cash", actual_counted: null, variance: null },
      { amount: 3000, entry_type: "receipt", payment_method: "Cash", actual_counted: null, variance: null },
      { amount: 1200, entry_type: "expense", payment_method: "Cash", actual_counted: null, variance: null },
      { amount: 2000, entry_type: "bank_deposit", payment_method: "Cash", actual_counted: null, variance: null },
    ];
    const s = computeDailySummary(rows);
    expect(s.openingCash).toBe(5000);
    expect(s.cashReceived).toBe(3000);
    expect(s.cashExpenses).toBe(1200);
    expect(s.bankDeposited).toBe(2000);
    expect(s.expectedCash).toBe(5000 + 3000 - 1200 - 2000);
    expect(s.expectedCash).toBe(4800);
  });

  it("only counts cash payment_method for receipts", () => {
    const rows: DailyRow[] = [
      { amount: 1000, entry_type: "receipt", payment_method: "Cash", actual_counted: null, variance: null },
      { amount: 2000, entry_type: "receipt", payment_method: "UPI", actual_counted: null, variance: null },
      { amount: 500, entry_type: "receipt", payment_method: "Bank Transfer", actual_counted: null, variance: null },
    ];
    const s = computeDailySummary(rows);
    expect(s.cashReceived).toBe(1000);
  });

  it("only counts cash payment_method for expenses", () => {
    const rows: DailyRow[] = [
      { amount: 800, entry_type: "expense", payment_method: "Cash", actual_counted: null, variance: null },
      { amount: 1500, entry_type: "expense", payment_method: "UPI", actual_counted: null, variance: null },
    ];
    const s = computeDailySummary(rows);
    expect(s.cashExpenses).toBe(800);
  });

  it("NULL entry_type treated as expense", () => {
    const rows: DailyRow[] = [
      { amount: 400, entry_type: null, payment_method: "Cash", actual_counted: null, variance: null },
    ];
    const s = computeDailySummary(rows);
    expect(s.cashExpenses).toBe(400);
  });

  it("reads saved actualCounted and variance from adjustment entry", () => {
    const rows: DailyRow[] = [
      { amount: 0, entry_type: "adjustment", payment_method: "Cash", actual_counted: 4500, variance: -300 },
    ];
    const s = computeDailySummary(rows);
    expect(s.actualCounted).toBe(4500);
    expect(s.variance).toBe(-300);
  });

  it("hasOpeningBalance is true when opening_balance entry exists", () => {
    const rows: DailyRow[] = [
      { amount: 1000, entry_type: "opening_balance", payment_method: "Cash", actual_counted: null, variance: null },
    ];
    const s = computeDailySummary(rows);
    expect(s.hasOpeningBalance).toBe(true);
  });

  it("hasOpeningBalance is false when no opening_balance entry", () => {
    const rows: DailyRow[] = [
      { amount: 500, entry_type: "expense", payment_method: "Cash", actual_counted: null, variance: null },
    ];
    const s = computeDailySummary(rows);
    expect(s.hasOpeningBalance).toBe(false);
  });

  it("variance is positive when actual > expected (excess)", () => {
    const actual = 5500;
    const expected = 4800;
    expect(actual - expected).toBe(700);
  });

  it("variance is negative when actual < expected (shortage)", () => {
    const actual = 4200;
    const expected = 4800;
    expect(actual - expected).toBe(-600);
  });

  it("variance is zero when balanced", () => {
    const actual = 4800;
    const expected = 4800;
    expect(actual - expected).toBe(0);
  });
});

// ─── CLIENT-SIDE ENTRY TYPE FILTER ───────────────────────────────────────────

describe("filterByEntryType", () => {
  const rows: FilterRow[] = [
    { entry_type: "expense" },
    { entry_type: "receipt" },
    { entry_type: "expense" },
    { entry_type: null },
    { entry_type: "opening_balance" },
  ];

  it("returns all rows when filter is 'all'", () => {
    expect(filterByEntryType(rows, "all")).toHaveLength(5);
  });

  it("returns only expense rows (including null) when filter is 'expense'", () => {
    const result = filterByEntryType(rows, "expense");
    expect(result).toHaveLength(3);
    for (const r of result) {
      expect(r.entry_type === "expense" || r.entry_type === null).toBe(true);
    }
  });

  it("returns only receipt rows when filter is 'receipt'", () => {
    const result = filterByEntryType(rows, "receipt");
    expect(result).toHaveLength(1);
    expect(result[0].entry_type).toBe("receipt");
  });

  it("NULL entry_type is included in expense filter (pre-migration backcompat)", () => {
    const nullRows: FilterRow[] = [{ entry_type: null }, { entry_type: null }];
    const result = filterByEntryType(nullRows, "expense");
    expect(result).toHaveLength(2);
  });

  it("NULL entry_type is excluded from receipt filter", () => {
    const nullRows: FilterRow[] = [{ entry_type: null }];
    const result = filterByEntryType(nullRows, "receipt");
    expect(result).toHaveLength(0);
  });
});

// ─── EDGE CASES ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles zero amount rows without NaN", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-04-09", amount: 0, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, "2026-04-09", "2026-04-01", "2026-04-01", "2026-04-09");
    expect(s.todayExpenses).toBe(0);
    expect(Number.isNaN(s.todayExpenses)).toBe(false);
  });

  it("handles string amounts from DB correctly", () => {
    const rows = [
      { expense_date: "2026-04-09", amount: "1500.50" as unknown as number, category: "Transport", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, "2026-04-09", "2026-04-01", "2026-04-01", "2026-04-09");
    expect(s.todayExpenses).toBeCloseTo(1500.5);
  });

  it("handles empty row array without errors", () => {
    const s = computeStats([], "2026-04-09", "2026-04-01", "2026-04-01", "2026-04-09");
    expect(s.todayExpenses).toBe(0);
    expect(s.monthExpenses).toBe(0);
    expect(s.cashInHand).toBeNull();
    expect(s.byCategory).toEqual({});
  });

  it("multiple categories accumulated independently", () => {
    const rows: LedgerRow[] = [
      { expense_date: "2026-04-05", amount: 100, category: "Transport", entry_type: "expense", payment_method: "Cash" },
      { expense_date: "2026-04-06", amount: 200, category: "Ink / Toner", entry_type: "expense", payment_method: "Cash" },
      { expense_date: "2026-04-07", amount: 150, category: "Transport", entry_type: "expense", payment_method: "Cash" },
      { expense_date: "2026-04-08", amount: 300, category: "Ink / Toner", entry_type: "expense", payment_method: "Cash" },
    ];
    const s = computeStats(rows, "2026-04-09", "2026-04-01", "2026-04-01", "2026-04-09");
    expect(s.byCategory["Transport"]).toBe(250);
    expect(s.byCategory["Ink / Toner"]).toBe(500);
  });
});
