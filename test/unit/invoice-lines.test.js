import test from "node:test";
import assert from "node:assert/strict";

import { buildLine, lineSchema } from "../../src/tools/invoice-lines.js";

test("lineSchema requires a productNumber", () => {
  const result = lineSchema.safeParse({
    description: "Consulting",
    quantity: 1,
    unitPrice: 100,
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues[0].path, ["productNumber"]);
});

test("lineSchema trims the description", () => {
  const parsed = lineSchema.parse({
    description: "  Consulting  ",
    quantity: 1,
    unitPrice: 100,
    productNumber: "CONS",
  });

  assert.equal(parsed.description, "Consulting");
});

test("buildLine numbers lines from one and maps the product reference", () => {
  const line = buildLine(
    { description: "Consulting", quantity: 2, unitPrice: 500, productNumber: "CONS" },
    0
  );

  assert.deepEqual(line, {
    lineNumber: 1,
    sortKey: 1,
    description: "Consulting",
    quantity: 2,
    unitNetPrice: 500,
    product: { productNumber: "CONS" },
  });
});

test("buildLine includes discount and unit only when given", () => {
  const line = buildLine(
    {
      description: "Hours",
      quantity: 3,
      unitPrice: 800,
      productNumber: "HOURS",
      unitNumber: 2,
      discountPercentage: 0,
    },
    4
  );

  assert.equal(line.lineNumber, 5);
  assert.equal(line.sortKey, 5);
  assert.equal(line.discountPercentage, 0);
  assert.deepEqual(line.unit, { unitNumber: 2 });
});
