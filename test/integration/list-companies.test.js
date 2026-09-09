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

test("list_companies describes every configured company", async () => {
  const result = await invokeTool(server, "list_companies", {});

  assert.notEqual(result.isError, true);
  const body = parseResult(result);
  assert.equal(body.length, 1);
  assert.equal(body[0].company, "demo");
  assert.equal(typeof body[0].agreementNumber, "number");
  assert.equal(body[0].companyName, "Demo Company");
  assert.equal(typeof body[0].companyIdentificationNumber, "string");
});

test("list_companies reports a company whose token is rejected without failing the others", async () => {
  process.env.ECONOMIC_GRANT_BROKEN = "not-a-real-token";
  try {
    const { value, lines } = await captureErrorLogs(() => invokeTool(server, "list_companies", {}));

    assert.notEqual(value.isError, true);
    const body = parseResult(value);
    assert.deepEqual(
      body.map((entry) => entry.company),
      ["broken", "demo"]
    );
    assert.equal(body[0].status, 401);
    assert.equal(typeof body[0].error, "string");
    assert.equal(body[1].companyName, "Demo Company");
    assert.equal(lines.length, 1);
  } finally {
    delete process.env.ECONOMIC_GRANT_BROKEN;
  }
});

test("list_companies is an error result when every company fails", async () => {
  const demoToken = process.env.ECONOMIC_GRANT_DEMO;
  process.env.ECONOMIC_GRANT_DEMO = "not-a-real-token";
  try {
    const { value } = await captureErrorLogs(() => invokeTool(server, "list_companies", {}));

    assert.equal(value.isError, true);
    assert.equal(parseResult(value)[0].status, 401);
  } finally {
    process.env.ECONOMIC_GRANT_DEMO = demoToken;
  }
});

test("list_companies is an error result when nothing is configured", async () => {
  const demoToken = process.env.ECONOMIC_GRANT_DEMO;
  delete process.env.ECONOMIC_GRANT_DEMO;
  try {
    const { value } = await captureErrorLogs(() => invokeTool(server, "list_companies", {}));

    assert.equal(value.isError, true);
    assert.equal(parseResult(value).errorCode, "E_NO_CREDENTIALS");
  } finally {
    process.env.ECONOMIC_GRANT_DEMO = demoToken;
  }
});
