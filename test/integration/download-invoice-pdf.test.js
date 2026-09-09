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

test("download_invoice_pdf returns the PDF as base64 with its size", async () => {
  const result = await invokeTool(server, "download_invoice_pdf", {
    company: "demo",
    bookedInvoiceNumber: 1,
  });

  assert.notEqual(result.isError, true);
  const body = parseResult(result);
  assert.equal(body.bookedInvoiceNumber, 1);
  assert.ok(body.contentType.startsWith("application/pdf"));
  assert.ok(body.base64.startsWith("JVBERi0"), "base64 of %PDF-");
  assert.equal(Buffer.from(body.base64, "base64").length, body.size);
});

test("download_invoice_pdf reports a missing invoice as an error result", async () => {
  const { value, lines } = await captureErrorLogs(() =>
    invokeTool(server, "download_invoice_pdf", { bookedInvoiceNumber: 999999999 })
  );

  assert.equal(value.isError, true);
  assert.equal(parseResult(value).status, 404);
  assert.equal(lines.length, 1);
});
