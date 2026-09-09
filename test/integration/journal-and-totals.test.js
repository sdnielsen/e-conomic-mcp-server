import test from "node:test";
import assert from "node:assert/strict";

import registerTools from "../../src/tools/index.js";
import {
  createCaptureServer,
  invokeTool,
  parseResult,
  useDemoCompany,
} from "../helpers/capture-server.js";

useDemoCompany();
const server = createCaptureServer();
registerTools(server);

test("list_account_totals returns per-account totals for a year", async () => {
  const body = parseResult(
    await invokeTool(server, "list_account_totals", { accountingYear: "2022", pageSize: 3 })
  );

  assert.equal(body.collection.length, 3);
  const total = body.collection[0];
  assert.equal(typeof total.totalInBaseCurrency, "number");
  assert.equal(typeof total.account.accountNumber, "number");
  assert.equal(total.fromDate, "2022-01-01");
  assert.equal(total.toDate, "2022-12-31");
});

test("list_account_totals narrows to one period", async () => {
  const body = parseResult(
    await invokeTool(server, "list_account_totals", {
      accountingYear: "2022",
      periodNumber: 5,
      pageSize: 1,
    })
  );

  assert.equal(body.collection[0].fromDate, "2022-05-01");
  assert.equal(body.collection[0].toDate, "2022-05-31");
});

test("list_journal_draft_entries returns the unbooked entries of a journal", async () => {
  const body = parseResult(
    await invokeTool(server, "list_journal_draft_entries", { journalNumber: 1, pageSize: 5 })
  );

  assert.ok(Array.isArray(body.collection));
  assert.equal(typeof body.pagination.results, "number");
});

test("list_journal_draft_entries accepts a date range", async () => {
  const body = parseResult(
    await invokeTool(server, "list_journal_draft_entries", {
      journalNumber: 1,
      fromDate: "2022-01-01",
      toDate: "2022-12-31",
    })
  );

  assert.ok(Array.isArray(body.collection));
});
