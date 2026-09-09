import test from "node:test";
import assert from "node:assert/strict";

import {
  DRAFT_WRITABLE_FIELDS,
  buildDraftUpdatePayload,
} from "../../src/tools/update-invoice-draft.js";

const current = {
  draftInvoiceNumber: 55,
  soap: { currentInvoiceHandle: { id: 55 } },
  templates: { bookingInstructions: "https://..." },
  date: "2026-01-10",
  currency: "DKK",
  exchangeRate: 100,
  netAmount: 100,
  grossAmount: 125,
  vatAmount: 25,
  roundingAmount: 0,
  dueDate: "2026-01-24",
  paymentTerms: { paymentTermsNumber: 1, self: "pt", paymentTermsType: "net" },
  customer: { customerNumber: 1, self: "c" },
  recipient: { name: "Decathlon", address: "Avenue 5", vatZone: { vatZoneNumber: 1 } },
  deliveryLocation: { deliveryLocationNumber: 1 },
  delivery: { address: "Dock 3" },
  notes: { heading: "Thanks", textLine1: "Pay soon" },
  references: { other: "PO-77" },
  layout: { layoutNumber: 21 },
  project: { projectNumber: 7 },
  pdf: { download: "https://..." },
  lines: [{ lineNumber: 1, sortKey: 1, description: "Old", quantity: 1, unitNetPrice: 100, product: { productNumber: "1" } }],
  lastUpdated: "2026-01-10T10:00:00Z",
  self: "https://...",
};

test("DRAFT_WRITABLE_FIELDS matches the published PUT schema minus computed fields", () => {
  assert.deepEqual(DRAFT_WRITABLE_FIELDS, [
    "draftInvoiceNumber",
    "date",
    "currency",
    "exchangeRate",
    "dueDate",
    "layout",
    "project",
    "paymentTerms",
    "customer",
    "recipient",
    "deliveryLocation",
    "delivery",
    "notes",
    "references",
    "lines",
  ]);
});

test("buildDraftUpdatePayload keeps notes, references, delivery and project when only the date changes", () => {
  const payload = buildDraftUpdatePayload(current, { draftInvoiceNumber: 55, date: "2026-02-01" });

  assert.equal(payload.date, "2026-02-01");
  assert.deepEqual(payload.notes, current.notes);
  assert.deepEqual(payload.references, current.references);
  assert.deepEqual(payload.delivery, current.delivery);
  assert.deepEqual(payload.project, current.project);
  assert.deepEqual(payload.lines, current.lines);
  assert.equal("dueDate" in payload, false);
});

test("buildDraftUpdatePayload keeps the current dueDate when payment terms are of type dueDate", () => {
  const dueDateTerms = {
    ...current,
    paymentTerms: { ...current.paymentTerms, paymentTermsType: "dueDate" },
  };

  const payload = buildDraftUpdatePayload(dueDateTerms, { draftInvoiceNumber: 55 });

  assert.equal(payload.dueDate, "2026-01-24");
});

test("buildDraftUpdatePayload sends the input dueDate with net payment terms", () => {
  const payload = buildDraftUpdatePayload(current, { draftInvoiceNumber: 55, dueDate: "2026-02-15" });

  assert.equal(payload.dueDate, "2026-02-15");
});

test("buildDraftUpdatePayload drops computed and read-only fields", () => {
  const payload = buildDraftUpdatePayload(current, { draftInvoiceNumber: 55 });

  for (const field of ["netAmount", "grossAmount", "vatAmount", "roundingAmount", "pdf", "soap", "templates", "lastUpdated", "self"]) {
    assert.equal(field in payload, false, `${field} must not be sent`);
  }
});

test("buildDraftUpdatePayload applies every supported change", () => {
  const payload = buildDraftUpdatePayload(current, {
    draftInvoiceNumber: 55,
    dueDate: "2026-03-01",
    currency: "EUR",
    paymentTermsNumber: 3,
    layoutNumber: 22,
    recipientName: "Decathlon HQ",
    recipientVatZoneNumber: 2,
    lines: [{ description: "New", quantity: 2, unitPrice: 50, productNumber: "2" }],
  });

  assert.equal(payload.dueDate, "2026-03-01");
  assert.equal(payload.currency, "EUR");
  assert.deepEqual(payload.paymentTerms, { paymentTermsNumber: 3 });
  assert.deepEqual(payload.layout, { layoutNumber: 22 });
  assert.equal(payload.recipient.name, "Decathlon HQ");
  assert.equal(payload.recipient.address, "Avenue 5");
  assert.deepEqual(payload.recipient.vatZone, { vatZoneNumber: 2 });
  assert.deepEqual(payload.lines, [
    {
      lineNumber: 1,
      sortKey: 1,
      description: "New",
      quantity: 2,
      unitNetPrice: 50,
      product: { productNumber: "2" },
    },
  ]);
  assert.equal(current.recipient.name, "Decathlon", "current draft is not mutated");
});

test("buildDraftUpdatePayload creates a recipient when the draft has none", () => {
  const payload = buildDraftUpdatePayload(
    { draftInvoiceNumber: 1, date: "2026-01-01", currency: "DKK", customer: { customerNumber: 1 }, lines: [] },
    { draftInvoiceNumber: 1, recipientName: "New Name" }
  );

  assert.deepEqual(payload.recipient, { name: "New Name" });
});
