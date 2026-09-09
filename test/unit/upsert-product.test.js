import test from "node:test";
import assert from "node:assert/strict";

import { productPath } from "../../src/tools/upsert-product.js";

test("productPath URL-encodes the product number", () => {
  assert.equal(productPath("A/B C"), "/products/A%2FB%20C");
  assert.equal(productPath("1"), "/products/1");
});
