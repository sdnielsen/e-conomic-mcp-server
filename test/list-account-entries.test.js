import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEntriesFilter,
  findAccountingYear,
  accountEntriesPath,
  summarizeEntries,
  registerListAccountEntriesTool,
} from "../src/tools/list-account-entries.js";

test("buildEntriesFilter combines the date range", () => {
  const filter = buildEntriesFilter({
    fromDate: "2025-05-01",
    toDate: "2026-04-30",
  });

  assert.equal(filter, "date$gte:2025-05-01$and:date$lte:2026-04-30");
});

test("buildEntriesFilter appends amount match when provided", () => {
  const filter = buildEntriesFilter({
    fromDate: "2025-05-01",
    toDate: "2025-05-31",
    amount: -1234.56,
  });

  assert.equal(
    filter,
    "date$gte:2025-05-01$and:date$lte:2025-05-31$and:amountInBaseCurrency$eq:-1234.56"
  );
});

test("findAccountingYear returns the year covering the range", () => {
  const collection = [
    { year: "2024/2025", fromDate: "2024-05-01", toDate: "2025-04-30" },
    { year: "2025/2026", fromDate: "2025-05-01", toDate: "2026-04-30" },
  ];

  const match = findAccountingYear(collection, "2025-06-01", "2025-06-30");

  assert.equal(match?.year, "2025/2026");
});

test("findAccountingYear returns null when no year covers the range", () => {
  const collection = [
    { year: "2024/2025", fromDate: "2024-05-01", toDate: "2025-04-30" },
  ];

  const match = findAccountingYear(collection, "2025-06-01", "2025-06-30");

  assert.equal(match, null);
});

test("findAccountingYear returns null when the range spans two years", () => {
  const collection = [
    { year: "2024/2025", fromDate: "2024-05-01", toDate: "2025-04-30" },
    { year: "2025/2026", fromDate: "2025-05-01", toDate: "2026-04-30" },
  ];

  const match = findAccountingYear(collection, "2025-04-01", "2025-05-31");

  assert.equal(match, null);
});

test("accountEntriesPath builds the account-scoped entries path", () => {
  assert.equal(
    accountEntriesPath(5820, { year: "2022" }),
    "/accounts/5820/accounting-years/2022/entries"
  );
});

test("accountEntriesPath URL-encodes split accounting years", () => {
  assert.equal(
    accountEntriesPath(5821, { year: "2025/2026" }),
    "/accounts/5821/accounting-years/2025%2F2026/entries"
  );
});

test("summarizeEntries maps fields and sums amounts", () => {
  const raw = [
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
  ];

  const result = summarizeEntries(5821, raw);

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

test("summarizeEntries falls back to amount when base currency amount is missing", () => {
  const raw = [
    {
      date: "2025-06-01",
      text: "Manual entry",
      amount: 42,
      voucherNumber: 103,
      entryNumber: 3,
      entryType: "financeVoucher",
    },
  ];

  const result = summarizeEntries(5821, raw);

  assert.equal(result.sum, 42);
  assert.equal(result.entries[0].amount, 42);
});

test("summarizeEntries handles an empty entry list", () => {
  const result = summarizeEntries(5821, []);

  assert.deepEqual(result, {
    account: 5821,
    count: 0,
    sum: 0,
    entries: [],
  });
});

test("registerListAccountEntriesTool registers the tool with the server", () => {
  const tools = [];
  const server = {
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  };

  registerListAccountEntriesTool(server);

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "list_account_entries");
  assert.equal(typeof tools[0].handler, "function");
});
