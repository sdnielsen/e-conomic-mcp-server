import test from "node:test";
import assert from "node:assert/strict";

import registerTools from "../../src/tools/index.js";
import {
  captureErrorLogs,
  createCaptureServer,
  invokeTool,
  parseResult,
  useDemoCompany,
} from "../helpers/capture-server.js";

useDemoCompany();
const server = createCaptureServer();
registerTools(server);

test("list_account_entries sums the entries of one account for a date range", async () => {
  const body = parseResult(
    await invokeTool(server, "list_account_entries", {
      accountNumber: 1021,
      fromDate: "2022-01-01",
      toDate: "2022-12-31",
    })
  );

  assert.equal(body.account, 1021);
  assert.ok(body.count > 0);
  assert.equal(body.entries.length, body.count);
  assert.equal(typeof body.sum, "number");
  for (const entry of body.entries) {
    assert.match(entry.date, /^2022-/);
  }
});

test("list_account_entries reports a range outside any accounting year as an error result", async () => {
  const { value, lines } = await captureErrorLogs(() =>
    invokeTool(server, "list_account_entries", {
      accountNumber: 1021,
      fromDate: "1999-01-01",
      toDate: "1999-12-31",
    })
  );

  assert.equal(value.isError, true);
  assert.equal(parseResult(value).errorCode, "E_ACCOUNTING_YEAR_RANGE");
  assert.equal(lines.length, 1);
});
