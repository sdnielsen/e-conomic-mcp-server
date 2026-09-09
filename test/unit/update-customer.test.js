import test from "node:test";
import assert from "node:assert/strict";

import {
  CUSTOMER_WRITABLE_FIELDS,
  buildCustomerUpdatePayload,
} from "../../src/tools/update-customer.js";

const current = {
  customerNumber: 1,
  currency: "DKK",
  paymentTerms: { paymentTermsNumber: 1, self: "pt" },
  customerGroup: { customerGroupNumber: 1, self: "cg" },
  vatZone: { vatZoneNumber: 1, self: "vz" },
  name: "Decathlon",
  address: "Avenue des Arts No 5",
  zip: "1040",
  city: "Brussels",
  country: "Belgium",
  email: "customerone@mailinator.com",
  telephoneAndFaxNumber: "08343242525",
  mobilePhone: "12345678",
  website: "https://example.com",
  ean: "5790000000000",
  corporateIdentificationNumber: "BE0123",
  pNumber: "1001",
  vatNumber: "BE0123456789",
  publicEntryNumber: "PE-1",
  creditLimit: 50000,
  barred: false,
  layout: { layoutNumber: 21 },
  salesPerson: { employeeNumber: 1, self: "sp" },
  priceGroup: { priceGroupNumber: 2 },
  eInvoicingDisabledByDefault: false,
  attention: { customerContactNumber: 1, self: "ct" },
  customerContact: { customerContactNumber: 2, self: "ct2" },
  defaultDeliveryLocation: { deliveryLocationNumber: 1 },
  balance: -1600,
  dueAmount: 0,
  contacts: "https://...",
  templates: { invoice: "https://..." },
  totals: { drafts: "https://..." },
  deliveryLocations: "https://...",
  invoices: { drafts: "https://..." },
  lastUpdated: "2022-06-02T08:53:29Z",
  self: "https://...",
};

test("CUSTOMER_WRITABLE_FIELDS lists the published customer fields", () => {
  assert.deepEqual(CUSTOMER_WRITABLE_FIELDS, [
    "customerNumber",
    "name",
    "currency",
    "paymentTerms",
    "customerGroup",
    "vatZone",
    "address",
    "zip",
    "city",
    "country",
    "email",
    "telephoneAndFaxNumber",
    "mobilePhone",
    "website",
    "ean",
    "corporateIdentificationNumber",
    "pNumber",
    "vatNumber",
    "publicEntryNumber",
    "creditLimit",
    "barred",
    "layout",
    "salesPerson",
    "priceGroup",
    "eInvoicingDisabledByDefault",
    "attention",
    "customerContact",
    "defaultDeliveryLocation",
  ]);
});

test("buildCustomerUpdatePayload keeps credit limit, sales person and contacts when only the name changes", () => {
  const payload = buildCustomerUpdatePayload(current, { customerNumber: 1, name: "Decathlon Belgium" });

  assert.equal(payload.name, "Decathlon Belgium");
  assert.equal(payload.creditLimit, 50000);
  assert.deepEqual(payload.salesPerson, current.salesPerson);
  assert.deepEqual(payload.attention, current.attention);
  assert.deepEqual(payload.customerContact, current.customerContact);
  assert.equal(payload.mobilePhone, "12345678");
});

test("buildCustomerUpdatePayload drops computed and link fields", () => {
  const payload = buildCustomerUpdatePayload(current, { customerNumber: 1 });

  for (const field of ["balance", "dueAmount", "contacts", "templates", "totals", "deliveryLocations", "invoices", "lastUpdated", "self"]) {
    assert.equal(field in payload, false, `${field} must not be sent`);
  }
  assert.equal("cvr" in payload, false);
});

test("buildCustomerUpdatePayload leaves out a writable field absent from current", () => {
  const { salesPerson, ...currentWithoutSalesPerson } = current;

  const payload = buildCustomerUpdatePayload(currentWithoutSalesPerson, { customerNumber: 1 });

  assert.equal("salesPerson" in payload, false);
});

test("buildCustomerUpdatePayload applies every supported change", () => {
  const payload = buildCustomerUpdatePayload(current, {
    customerNumber: 1,
    currency: "EUR",
    paymentTermsNumber: 3,
    customerGroupNumber: 4,
    vatZoneNumber: 2,
    email: "billing@example.com",
    corporateIdentificationNumber: "BE0999",
    website: "https://new.example.com",
  });

  assert.equal(payload.currency, "EUR");
  assert.deepEqual(payload.paymentTerms, { paymentTermsNumber: 3 });
  assert.deepEqual(payload.customerGroup, { customerGroupNumber: 4 });
  assert.deepEqual(payload.vatZone, { vatZoneNumber: 2 });
  assert.equal(payload.email, "billing@example.com");
  assert.equal(payload.corporateIdentificationNumber, "BE0999");
  assert.equal(payload.website, "https://new.example.com");
  assert.equal(current.currency, "DKK", "current customer is not mutated");
});
