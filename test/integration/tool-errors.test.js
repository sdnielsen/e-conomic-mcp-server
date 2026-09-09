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

test("a missing customer comes back as an error result", async () => {
  const { value, lines } = await captureErrorLogs(() =>
    invokeTool(server, "get_customer", { customerNumber: 999999999 })
  );

  assert.equal(value.isError, true);
  const body = parseResult(value);
  assert.equal(body.status, 404);
  assert.equal(body.errorCode, "E06000");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /"status":404/);
});

test("a write against the read-only demo licence comes back as an error result", async () => {
  const { value, lines } = await captureErrorLogs(() =>
    invokeTool(server, "upsert_product", {
      productNumber: "TEST-NEVER-CREATED",
      name: "Never created",
      productGroupNumber: 1,
    })
  );

  assert.equal(value.isError, true);
  const body = parseResult(value);
  assert.equal(body.status, 403);
  assert.equal(body.errorCode, "E02002");
  assert.equal(lines.length, 1);
});
