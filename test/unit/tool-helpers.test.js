import test from "node:test";
import assert from "node:assert/strict";

import { EconomicApiError } from "../../src/economic/errors.js";
import {
  accountingYearSchema,
  buildListQuery,
  dateRangeClauses,
  errorToContent,
  escapeFilterValue,
  joinFilters,
  jsonContent,
} from "../../src/tools/tool-helpers.js";
import { captureErrorLogs } from "../helpers/capture-server.js";

test("buildListQuery defaults to page size 100 and the first page", () => {
  assert.equal(buildListQuery().toString(), "pagesize=100&skippages=0");
});

test("buildListQuery converts page numbers to skipped pages and adds a filter", () => {
  const query = buildListQuery({ pageSize: 25, page: 3, filter: "date$gte:2025-01-01" });

  assert.equal(query.get("pagesize"), "25");
  assert.equal(query.get("skippages"), "2");
  assert.equal(query.get("filter"), "date$gte:2025-01-01");
});

test("escapeFilterValue escapes every reserved character", () => {
  assert.equal(escapeFilterValue("a$b(c)d*e[f]g,h"), "a$$b$(c$)d$*e$[f$]g$,h");
  assert.equal(escapeFilterValue(42), "42");
});

test("joinFilters drops empty clauses and joins with $and:", () => {
  assert.equal(joinFilters(["a$eq:1", undefined, "", "b$eq:2"]), "a$eq:1$and:b$eq:2");
  assert.equal(joinFilters([]), undefined);
});

test("dateRangeClauses builds inclusive bounds only for given dates", () => {
  assert.deepEqual(dateRangeClauses("2025-01-01", "2025-01-31"), [
    "date$gte:2025-01-01",
    "date$lte:2025-01-31",
  ]);
  assert.deepEqual(dateRangeClauses(undefined, "2025-01-31"), ["date$lte:2025-01-31"]);
  assert.deepEqual(dateRangeClauses(), []);
});

test("jsonContent wraps data as pretty-printed text content", () => {
  assert.deepEqual(jsonContent({ a: 1 }), {
    content: [{ type: "text", text: '{\n  "a": 1\n}' }],
  });
});

test("errorToContent flags the result as an error and logs the details", async () => {
  const error = new EconomicApiError("Customer '9' was not found!", {
    status: 404,
    errorCode: "E06000",
    details: { logId: "abc" },
    hint: "look it up",
  });

  const { value, lines } = await captureErrorLogs(() => errorToContent(error));

  assert.equal(value.isError, true);
  assert.deepEqual(JSON.parse(value.content[0].text), {
    error: "Customer '9' was not found!",
    status: 404,
    errorCode: "E06000",
  });
  assert.equal(lines.length, 1);
  const logged = JSON.parse(lines[0]);
  assert.equal(logged.level, "error");
  assert.equal(logged.status, 404);
  assert.equal(logged.hint, "look it up");
});

test("errorToContent rethrows anything that is not an EconomicApiError", () => {
  assert.throws(() => errorToContent(new TypeError("nope")), TypeError);
});

test("accountingYearSchema accepts a plain year and a split year", () => {
  assert.equal(accountingYearSchema.parse("2025"), "2025");
  assert.equal(accountingYearSchema.parse("2025/2026"), "2025/2026");
});

test("accountingYearSchema rejects a path-like value and a short year", () => {
  assert.throws(() => accountingYearSchema.parse("../foo"));
  assert.throws(() => accountingYearSchema.parse("25"));
});
