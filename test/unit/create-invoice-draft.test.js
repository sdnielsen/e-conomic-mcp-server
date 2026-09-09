import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftCreatePayload,
  buildNewCustomerPayload,
  needsInvoiceTemplate,
} from "../../src/tools/create-invoice-draft.js";

test("buildNewCustomerPayload uses the API field name for the company registration number", () => {
  const payload = buildNewCustomerPayload(90001, "DKK", {
    name: "Sandbox ApS",
    paymentTermsNumber: 1,
    customerGroupNumber: 2,
    vatZoneNumber: 3,
    corporateIdentificationNumber: "12345678",
    email: "billing@example.com",
  });

  assert.deepEqual(payload, {
    customerNumber: 90001,
    name: "Sandbox ApS",
    currency: "DKK",
    paymentTerms: { paymentTermsNumber: 1 },
    customerGroup: { customerGroupNumber: 2 },
    vatZone: { vatZoneNumber: 3 },
    corporateIdentificationNumber: "12345678",
    email: "billing@example.com",
  });
  assert.equal("cvr" in payload, false);
});

test("buildNewCustomerPayload prefers the customer's own currency", () => {
  const payload = buildNewCustomerPayload(1, "DKK", { name: "Euro Kunde", currency: "eur" });

  assert.equal(payload.currency, "EUR");
});

test("needsInvoiceTemplate is false only when every template field is given", () => {
  assert.equal(
    needsInvoiceTemplate({
      layoutNumber: 1,
      paymentTermsNumber: 1,
      recipientName: "A",
      recipientVatZoneNumber: 1,
    }),
    false
  );
  assert.equal(needsInvoiceTemplate({ layoutNumber: 1, paymentTermsNumber: 1 }), true);
});

test("buildDraftCreatePayload keeps template fields and applies the input", () => {
  const template = {
    customer: { customerNumber: 1, self: "x" },
    layout: { layoutNumber: 21 },
    paymentTerms: { paymentTermsNumber: 1 },
    recipient: { name: "Decathlon", address: "Avenue 5", vatZone: { vatZoneNumber: 1 } },
    notes: { heading: "Thanks" },
    currency: "EUR",
  };

  const payload = buildDraftCreatePayload(template, {
    customerNumber: 1,
    currency: "DKK",
    date: "2026-09-09",
    dueDate: "2026-09-30",
    recipientName: "Decathlon HQ",
    lines: [{ description: "Consulting", quantity: 1, unitPrice: 100, productNumber: "1" }],
  });

  assert.equal(payload.date, "2026-09-09");
  assert.equal(payload.currency, "DKK");
  assert.equal(payload.dueDate, "2026-09-30");
  assert.deepEqual(payload.customer, { customerNumber: 1 });
  assert.deepEqual(payload.layout, { layoutNumber: 21 });
  assert.equal(payload.recipient.name, "Decathlon HQ");
  assert.equal(payload.recipient.address, "Avenue 5");
  assert.deepEqual(payload.notes, { heading: "Thanks" });
  assert.equal(payload.lines.length, 1);
  assert.deepEqual(payload.lines[0].product, { productNumber: "1" });
  assert.notEqual(payload.recipient, template.recipient, "template object is not mutated");
});

test("buildDraftCreatePayload builds a complete payload without a template", () => {
  const payload = buildDraftCreatePayload({}, {
    customerNumber: 7,
    currency: "DKK",
    date: "2026-09-09",
    layoutNumber: 21,
    paymentTermsNumber: 2,
    recipientName: "ACME",
    recipientVatZoneNumber: 1,
    lines: [{ description: "Widget", quantity: 2, unitPrice: 10, productNumber: "W" }],
  });

  assert.deepEqual(payload, {
    date: "2026-09-09",
    currency: "DKK",
    customer: { customerNumber: 7 },
    layout: { layoutNumber: 21 },
    paymentTerms: { paymentTermsNumber: 2 },
    recipient: { name: "ACME", vatZone: { vatZoneNumber: 1 } },
    lines: [
      {
        lineNumber: 1,
        sortKey: 1,
        description: "Widget",
        quantity: 2,
        unitNetPrice: 10,
        product: { productNumber: "W" },
      },
    ],
  });
});
