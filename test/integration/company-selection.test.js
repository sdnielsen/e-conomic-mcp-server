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

const READ_TOOLS_WITH_PAGING = [
  "list_customers",
  "list_products",
  "list_invoice_drafts",
  "list_booked_invoices",
  "list_payment_terms",
  "list_customer_groups",
  "list_vat_zones",
];

for (const name of READ_TOOLS_WITH_PAGING) {
  test(`${name} accepts the company argument`, async () => {
    const result = await invokeTool(server, name, { company: "demo", pageSize: 1 });

    assert.notEqual(result.isError, true);
    const body = parseResult(result);
    assert.ok(Array.isArray(body.collection));
  });
}

test("get_customer, get_invoice_draft and get_booked_invoice accept the company argument", async () => {
  const customer = parseResult(
    await invokeTool(server, "get_customer", { company: "demo", customerNumber: 1 })
  );
  assert.equal(customer.customerNumber, 1);

  const booked = parseResult(
    await invokeTool(server, "get_booked_invoice", { company: "demo", bookedInvoiceNumber: 1 })
  );
  assert.equal(booked.bookedInvoiceNumber, 1);

  const drafts = parseResult(
    await invokeTool(server, "list_invoice_drafts", { company: "demo", pageSize: 1 })
  );
  const draftNumber = drafts.collection[0]?.draftInvoiceNumber;
  assert.ok(draftNumber, "demo agreement has at least one draft");
  const draft = parseResult(
    await invokeTool(server, "get_invoice_draft", { company: "demo", draftInvoiceNumber: draftNumber })
  );
  assert.equal(draft.draftInvoiceNumber, draftNumber);
});

test("an unknown company is reported as an error result", async () => {
  const { value, lines } = await captureErrorLogs(() =>
    invokeTool(server, "list_customers", { company: "nope", pageSize: 1 })
  );

  assert.equal(value.isError, true);
  assert.equal(parseResult(value).errorCode, "E_UNKNOWN_COMPANY");
  assert.equal(lines.length, 1);
});

test("omitting the company with two companies configured is reported as an error result", async () => {
  process.env.ECONOMIC_GRANT_OTHER = "demo";
  try {
    const { value } = await captureErrorLogs(() =>
      invokeTool(server, "get_customer", { customerNumber: 1 })
    );

    assert.equal(value.isError, true);
    assert.equal(parseResult(value).errorCode, "E_COMPANY_REQUIRED");
  } finally {
    delete process.env.ECONOMIC_GRANT_OTHER;
  }
});

test("write tools report which company they would act on", async () => {
  const { value } = await captureErrorLogs(() =>
    invokeTool(server, "book_invoice_draft", { company: "demo", draftInvoiceNumber: 999999999 })
  );

  assert.equal(value.isError, true);
  assert.equal(parseResult(value).status, 404);
});
