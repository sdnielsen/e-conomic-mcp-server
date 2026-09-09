import { z } from "zod";
import { request, resolveCompanyName } from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";

/**
 * Fields of a customer that may be sent back on PUT. Taken from the published
 * `customers.post` schema (the PUT schema is not published) plus the
 * reference fields `attention`, `customerContact` and
 * `defaultDeliveryLocation`, which the API returns and accepts on update.
 * Computed fields such as `balance` and link fields such as `templates` are
 * left out.
 */
export const CUSTOMER_WRITABLE_FIELDS = [
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
];

/**
 * Input fields that are copied onto the payload under the same name.
 */
const DIRECT_FIELDS = [
  "name",
  "address",
  "zip",
  "city",
  "country",
  "email",
  "telephoneAndFaxNumber",
  "ean",
  "corporateIdentificationNumber",
  "website",
];

const updateSchema = z.object({
  company: companySchema,
  customerNumber: z
    .number()
    .int()
    .positive()
    .describe("Customer number to update"),
  name: z
    .string()
    .min(1)
    .max(250)
    .transform((s) => s.trim())
    .optional(),
  currency: z
    .string()
    .length(3)
    .optional()
    .describe("Customer currency (ISO 4217)")
    .transform((value) => (value ? value.toUpperCase() : value)),
  paymentTermsNumber: z.number().int().positive().optional(),
  customerGroupNumber: z.number().int().positive().optional(),
  vatZoneNumber: z.number().int().positive().optional(),
  address: z.string().max(500).optional(),
  zip: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  email: z.string().email().max(254).toLowerCase().optional(),
  telephoneAndFaxNumber: z.string().max(50).optional(),
  ean: z.string().max(20).optional(),
  corporateIdentificationNumber: z
    .string()
    .max(40)
    .optional()
    .describe("Company registration number (CVR number in Denmark)"),
  website: z
    .string()
    .url()
    .max(500)
    .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
      message: "Website must be a valid HTTP/HTTPS URL",
    })
    .optional(),
});

/**
 * Fetches a customer.
 *
 * Args:
 *   customerNumber (number): Customer number.
 *   company (string|undefined): Company key.
 *
 * Returns:
 *   object: The customer as returned by the API.
 */
const fetchCustomer = (customerNumber, company) =>
  request("GET", `/customers/${customerNumber}`, undefined, { company });

/**
 * Builds the PUT payload for a customer: the current writable fields with the
 * requested changes applied on top.
 *
 * Args:
 *   current (object): The customer as returned by the API. Not mutated.
 *   input (object): Parsed tool input.
 *
 * Returns:
 *   object: Payload for `PUT /customers/{customerNumber}`.
 */
export const buildCustomerUpdatePayload = (current, input) => {
  const payload = {};

  for (const field of CUSTOMER_WRITABLE_FIELDS) {
    if (current[field] !== undefined) {
      payload[field] = current[field];
    }
  }

  for (const field of DIRECT_FIELDS) {
    if (input[field] !== undefined) {
      payload[field] = input[field];
    }
  }

  if (input.currency) {
    payload.currency = input.currency;
  }

  if (input.paymentTermsNumber) {
    payload.paymentTerms = { paymentTermsNumber: input.paymentTermsNumber };
  }

  if (input.customerGroupNumber) {
    payload.customerGroup = { customerGroupNumber: input.customerGroupNumber };
  }

  if (input.vatZoneNumber) {
    payload.vatZone = { vatZoneNumber: input.vatZoneNumber };
  }

  return payload;
};

export const registerUpdateCustomerTool = (server) => {
  server.registerTool(
    "update_customer",
    {
      title: "Update customer",
      description:
        "Update an existing customer in e-conomic. Fields that are not given keep their current values.",
      inputSchema: updateSchema,
    },
    async (input) => {
      const { company, customerNumber } = input;
      try {
        const current = await fetchCustomer(customerNumber, company);
        const payload = buildCustomerUpdatePayload(current, input);

        const data = await request("PUT", `/customers/${customerNumber}`, payload, {
          company,
        });

        return jsonContent({
          company: resolveCompanyName(company),
          customerNumber: data?.customerNumber,
          name: data?.name,
          self: data?.self,
        });
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
