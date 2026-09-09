import test from "node:test";
import assert from "node:assert/strict";

import { mapFetchError, EconomicApiError } from "../../src/economic/api-client.js";

test("mapFetchError turns a timeout into E_TIMEOUT", () => {
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";

  const mapped = mapFetchError(timeout);

  assert.ok(mapped instanceof EconomicApiError);
  assert.equal(mapped.errorCode, "E_TIMEOUT");
  assert.equal(mapped.status, 0);
  assert.match(mapped.message, /timed out after 30000 ms/);
});

test("mapFetchError turns other fetch failures into E_NETWORK", () => {
  const failure = new TypeError("fetch failed");

  const mapped = mapFetchError(failure);

  assert.equal(mapped.errorCode, "E_NETWORK");
  assert.equal(mapped.status, 0);
  assert.equal(mapped.message, "Could not reach the e-conomic API: fetch failed");
});

test("mapFetchError leaves EconomicApiError untouched", () => {
  const original = new EconomicApiError("boom", { status: 0, errorCode: "E_X" });

  assert.equal(mapFetchError(original), original);
});
