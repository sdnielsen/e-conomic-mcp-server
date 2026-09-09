import test from "node:test";
import assert from "node:assert/strict";

import { accountTotalsPath } from "../../src/tools/list-account-totals.js";

test("accountTotalsPath addresses the whole year by default", () => {
  assert.equal(accountTotalsPath("2022"), "/accounting-years/2022/totals");
});

test("accountTotalsPath addresses one period and encodes split years", () => {
  assert.equal(
    accountTotalsPath("2025/2026", 3),
    "/accounting-years/2025%2F2026/periods/3/totals"
  );
});
