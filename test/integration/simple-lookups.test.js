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

test("list_accounting_years returns years with their date ranges", async () => {
  const body = parseResult(await invokeTool(server, "list_accounting_years", { pageSize: 2 }));

  assert.ok(body.collection.length > 0);
  const year = body.collection[0];
  assert.equal(typeof year.year, "string");
  assert.match(year.fromDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(year.toDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("list_accounts returns the chart of accounts", async () => {
  const body = parseResult(await invokeTool(server, "list_accounts", { pageSize: 3 }));

  assert.equal(body.collection.length, 3);
  assert.equal(typeof body.collection[0].accountNumber, "number");
  assert.equal(typeof body.collection[0].name, "string");
});

test("list_accounts filters by account type", async () => {
  const body = parseResult(
    await invokeTool(server, "list_accounts", { accountType: "profitAndLoss", pageSize: 5 })
  );

  assert.ok(body.collection.length > 0);
  for (const account of body.collection) {
    assert.equal(account.accountType, "profitAndLoss");
  }
});

test("list_vat_accounts returns VAT codes with rates", async () => {
  const body = parseResult(await invokeTool(server, "list_vat_accounts", {}));

  assert.ok(body.collection.length > 0);
  const vatAccount = body.collection[0];
  assert.equal(typeof vatAccount.vatCode, "string");
  assert.equal(typeof vatAccount.ratePercentage, "number");
  assert.equal(typeof vatAccount.account.accountNumber, "number");
});

test("list_journals returns journals with numbers and names", async () => {
  const body = parseResult(await invokeTool(server, "list_journals", { pageSize: 2 }));

  assert.ok(body.collection.length > 0);
  assert.equal(typeof body.collection[0].journalNumber, "number");
  assert.equal(typeof body.collection[0].name, "string");
});
