import test from "node:test";
import assert from "node:assert/strict";

import {
  WRITE_TOOLS,
  hasNullPlaceholder,
  parseHarnessArgs,
  resolvePlaceholders,
} from "../../scripts/test-harness.js";

test("parseHarnessArgs defaults to read-only without a company", () => {
  assert.deepEqual(parseHarnessArgs([]), { company: undefined, allowWrites: false, demo: false });
});

test("parseHarnessArgs reads --company, --allow-writes and --demo", () => {
  assert.deepEqual(parseHarnessArgs(["--company", "acme", "--allow-writes", "--demo"]), {
    company: "acme",
    allowWrites: true,
    demo: true,
  });
});

test("WRITE_TOOLS names every tool that changes data", () => {
  assert.deepEqual(
    [...WRITE_TOOLS].sort(),
    [
      "book_invoice_draft",
      "create_invoice_draft",
      "update_customer",
      "update_invoice_draft",
      "upsert_product",
    ]
  );
});

test("resolvePlaceholders swaps draft and booked placeholders anywhere in the input", () => {
  const context = { lastDraftNumber: 12, lastBookedInvoiceNumber: 34 };

  assert.deepEqual(
    resolvePlaceholders({ a: "$lastDraft", b: ["$lastBooked", "keep"], c: 1 }, context),
    { a: 12, b: [34, "keep"], c: 1 }
  );
});

test("hasNullPlaceholder finds unresolved placeholders", () => {
  assert.equal(hasNullPlaceholder({ a: { b: [null] } }), true);
  assert.equal(hasNullPlaceholder({ a: 1, b: ["x"] }), false);
});
