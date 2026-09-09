import test from "node:test";
import assert from "node:assert/strict";

import {
  request,
  requestBinary,
  resolveCompanyName,
  EconomicApiError,
} from "../../src/economic/api-client.js";

for (const key of Object.keys(process.env)) {
  if (key.startsWith("ECONOMIC_GRANT_")) {
    delete process.env[key];
  }
}
delete process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN;
delete process.env.ECONOMIC_BASE_URL;
process.env.ECONOMIC_APP_SECRET_TOKEN = "demo";
process.env.ECONOMIC_GRANT_DEMO = "demo";

test("request targets the named company", async () => {
  const self = await request("GET", "/self", undefined, { company: "demo" });

  assert.equal(typeof self.agreementNumber, "number");
  assert.equal(self.company.name, "Demo Company");
});

test("request uses the only configured company when none is named", async () => {
  const data = await request("GET", "/customers?pagesize=1");

  assert.equal(data.collection.length, 1);
});

test("resolveCompanyName returns the resolved key", () => {
  assert.equal(resolveCompanyName(), "demo");
  assert.equal(resolveCompanyName("DEMO"), "demo");
});

test("request rejects an unknown company before calling the API", async () => {
  await assert.rejects(
    request("GET", "/self", undefined, { company: "nope" }),
    (error) => error instanceof EconomicApiError && error.errorCode === "E_UNKNOWN_COMPANY"
  );
});

test("request requires a company when two are configured", async () => {
  process.env.ECONOMIC_GRANT_OTHER = "demo";
  try {
    await assert.rejects(
      request("GET", "/self"),
      (error) => error.errorCode === "E_COMPANY_REQUIRED"
    );
  } finally {
    delete process.env.ECONOMIC_GRANT_OTHER;
  }
});

test("request maps API errors to EconomicApiError with status and code", async () => {
  await assert.rejects(
    request("GET", "/customers/999999999"),
    (error) =>
      error instanceof EconomicApiError &&
      error.status === 404 &&
      error.errorCode === "E06000"
  );
});

test("requestBinary returns the PDF of a booked invoice", async () => {
  const { buffer, contentType } = await requestBinary("GET", "/invoices/booked/1/pdf");

  assert.ok(contentType.startsWith("application/pdf"));
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
});
