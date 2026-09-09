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

test("list_booked_entries pages through an accounting year", async () => {
  const body = parseResult(
    await invokeTool(server, "list_booked_entries", { accountingYear: "2022", pageSize: 2 })
  );

  assert.equal(body.collection.length, 2);
  assert.ok(body.pagination.results > 2);
  assert.equal(typeof body.collection[0].voucherNumber, "number");
});

test("list_booked_entries filters by voucher number", async () => {
  const body = parseResult(
    await invokeTool(server, "list_booked_entries", {
      accountingYear: "2022",
      voucherNumber: 600000,
    })
  );

  assert.ok(body.collection.length > 0);
  for (const entry of body.collection) {
    assert.equal(entry.voucherNumber, 600000);
  }
});

test("list_booked_entries searches entry text", async () => {
  const body = parseResult(
    await invokeTool(server, "list_booked_entries", { accountingYear: "2022", text: "Crane" })
  );

  assert.ok(body.collection.length > 0);
  for (const entry of body.collection) {
    assert.match(entry.text, /Crane/);
  }
});

test("list_booked_entries applies a date range", async () => {
  const body = parseResult(
    await invokeTool(server, "list_booked_entries", {
      accountingYear: "2022",
      fromDate: "2022-01-01",
      toDate: "2022-01-31",
    })
  );

  assert.equal(body.collection.length, 0);
  assert.equal(body.pagination.results, 0);
});
