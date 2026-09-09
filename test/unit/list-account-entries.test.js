import test from "node:test";
import assert from "node:assert/strict";

import {
  accountEntriesPath,
  buildEntriesFilter,
  findAccountingYear,
  registerListAccountEntriesTool,
  summarizeEntries,
} from "../../src/tools/list-account-entries.js";

test("buildEntriesFilter combines the date range", () => {
  assert.equal(
    buildEntriesFilter({ fromDate: "2025-05-01", toDate: "2026-04-30" }),
    "date$gte:2025-05-01$and:date$lte:2026-04-30"
  );
});

test("buildEntriesFilter appends amount match when provided", () => {
  assert.equal(
    buildEntriesFilter({ fromDate: "2025-05-01", toDate: "2025-05-31", amount: -1234.56 }),
    "date$gte:2025-05-01$and:date$lte:2025-05-31$and:amountInBaseCurrency$eq:-1234.56"
  );
});

test("buildEntriesFilter appends amount match when amount is zero", () => {
  assert.match(
    buildEntriesFilter({ fromDate: "2025-05-01", toDate: "2025-05-31", amount: 0 }),
    /\$and:amountInBaseCurrency\$eq:0$/
  );
});

test("buildEntriesFilter ignores a null amount", () => {
  assert.equal(
    buildEntriesFilter({ fromDate: "2025-05-01", toDate: "2025-05-31", amount: null }),
    "date$gte:2025-05-01$and:date$lte:2025-05-31"
  );
});

test("findAccountingYear returns the year covering the range", () => {
  const collection = [
    { year: "2024/2025", fromDate: "2024-05-01", toDate: "2025-04-30" },
    { year: "2025/2026", fromDate: "2025-05-01", toDate: "2026-04-30" },
  ];

  assert.equal(findAccountingYear(collection, "2025-06-01", "2025-06-30")?.year, "2025/2026");
});

test("findAccountingYear returns null when no year covers the range or it spans two years", () => {
  const collection = [
    { year: "2024/2025", fromDate: "2024-05-01", toDate: "2025-04-30" },
    { year: "2025/2026", fromDate: "2025-05-01", toDate: "2026-04-30" },
  ];

  assert.equal(findAccountingYear(collection, "2027-01-01", "2027-01-31"), null);
  assert.equal(findAccountingYear(collection, "2025-04-01", "2025-05-31"), null);
  assert.equal(findAccountingYear(undefined, "2025-04-01", "2025-05-31"), null);
});

test("accountEntriesPath builds the account-scoped path and encodes split years", () => {
  assert.equal(accountEntriesPath(5820, { year: "2022" }), "/accounts/5820/accounting-years/2022/entries");
  assert.equal(
    accountEntriesPath(5821, { year: "2025/2026" }),
    "/accounts/5821/accounting-years/2025%2F2026/entries"
  );
});

test("summarizeEntries maps fields and sums amounts", () => {
  const result = summarizeEntries(5821, [
    {
      date: "2025-06-01",
      text: "Bank transfer",
      amountInBaseCurrency: -100.5,
      amount: -100.5,
      voucherNumber: 101,
      entryNumber: 1,
      entryType: "financeVoucher",
      account: { accountNumber: 5821 },
    },
    {
      date: "2025-06-02",
      text: "Invoice payment",
      amountInBaseCurrency: 250.25,
      amount: 250.25,
      voucherNumber: 102,
      entryNumber: 2,
      entryType: "customerPayment",
      account: { accountNumber: 5821 },
    },
  ]);

  assert.equal(result.account, 5821);
  assert.equal(result.count, 2);
  assert.equal(result.sum, 149.75);
  assert.deepEqual(result.entries[0], {
    date: "2025-06-01",
    text: "Bank transfer",
    amount: -100.5,
    voucherNumber: 101,
    entryNumber: 1,
    entryType: "financeVoucher",
  });
});

test("summarizeEntries falls back to amount and handles an empty list", () => {
  const withFallback = summarizeEntries(5821, [
    { date: "2025-06-01", text: "Manual entry", amount: 42, voucherNumber: 103, entryNumber: 3, entryType: "financeVoucher" },
  ]);
  assert.equal(withFallback.sum, 42);
  assert.equal(withFallback.entries[0].amount, 42);

  assert.deepEqual(summarizeEntries(5821, []), { account: 5821, count: 0, sum: 0, entries: [] });
});

test("registerListAccountEntriesTool registers the tool with the server", () => {
  const tools = [];
  registerListAccountEntriesTool({
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  });

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "list_account_entries");
  assert.equal(typeof tools[0].handler, "function");
});
