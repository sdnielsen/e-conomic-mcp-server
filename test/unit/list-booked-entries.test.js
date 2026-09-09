import test from "node:test";
import assert from "node:assert/strict";

import {
  bookedEntriesPath,
  buildBookedEntriesFilter,
} from "../../src/tools/list-booked-entries.js";

test("buildBookedEntriesFilter returns undefined without criteria", () => {
  assert.equal(buildBookedEntriesFilter({}), undefined);
});

test("buildBookedEntriesFilter combines dates, voucher, type, amount and parties", () => {
  const filter = buildBookedEntriesFilter({
    fromDate: "2025-01-01",
    toDate: "2025-03-31",
    voucherNumber: 600000,
    entryType: "customerInvoice",
    amount: -1234.5,
    customerNumber: 7,
    supplierNumber: 9,
  });

  assert.equal(
    filter,
    "date$gte:2025-01-01$and:date$lte:2025-03-31$and:voucherNumber$eq:600000$and:entryType$eq:customerInvoice$and:amount$eq:-1234.5$and:customer.customerNumber$eq:7$and:supplier.supplierNumber$eq:9"
  );
});

test("buildBookedEntriesFilter searches text as an escaped substring", () => {
  assert.equal(
    buildBookedEntriesFilter({ text: "Crane (2*)" }),
    "text$like:*Crane $(2$*$)*"
  );
});

test("bookedEntriesPath encodes split accounting years", () => {
  assert.equal(bookedEntriesPath("2022"), "/accounting-years/2022/entries");
  assert.equal(bookedEntriesPath("2025/2026"), "/accounting-years/2025%2F2026/entries");
});
