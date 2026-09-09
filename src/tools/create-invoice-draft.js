import { z } from "zod";
import {
  EconomicApiError,
  request,
  resolveCompanyName,
} from "../economic/api-client.js";
import {
  companySchema,
  dateSchema,
  errorToContent,
  jsonContent,
} from "./tool-helpers.js";
import { buildLine, lineSchema } from "./invoice-lines.js";

const newCustomerSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(250)
    .transform((s) => s.trim())
    .describe("Customer name"),
  currency: z
    .string()
    .length(3)
    .optional()
    .describe("Customer currency (ISO 4217)"),
  paymentTermsNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Payment terms number"),
  customerGroupNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Customer group number"),
  vatZoneNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("VAT zone number"),
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

const NEW_CUSTOMER_OPTIONAL_FIELDS = [
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

/**
 * Builds the payload for creating a customer that an invoice refers to.
 *
 * Args:
 *   customerNumber (number): Customer number to create.
 *   currency (string): Invoice currency, used when the customer has none.
 *   newCustomer (object): Parsed `newCustomerSchema` value.
 *
 * Returns:
 *   object: Customer payload for `POST /customers`.
 */
export const buildNewCustomerPayload = (customerNumber, currency, newCustomer) => {
  const payload = {
    customerNumber,
    name: newCustomer.name,
    currency: (newCustomer.currency ?? currency)?.toUpperCase(),
  };

  if (newCustomer.paymentTermsNumber) {
    payload.paymentTerms = {
      paymentTermsNumber: newCustomer.paymentTermsNumber,
    };
  }

  if (newCustomer.customerGroupNumber) {
    payload.customerGroup = {
      customerGroupNumber: newCustomer.customerGroupNumber,
    };
  }

  if (newCustomer.vatZoneNumber) {
    payload.vatZone = { vatZoneNumber: newCustomer.vatZoneNumber };
  }

  for (const field of NEW_CUSTOMER_OPTIONAL_FIELDS) {
    if (newCustomer[field]) {
      payload[field] = newCustomer[field];
    }
  }

  return payload;
};

/**
 * Makes sure the invoice customer exists, creating it when allowed.
 *
 * Args:
 *   options (object): `customerNumber`, `currency`, `createCustomerIfMissing`,
 *     `newCustomer` and `company`.
 *
 * Raises:
 *   EconomicApiError: The original 404 when creation is not allowed,
 *     `E_CUSTOMER_MISSING` when allowed but no `newCustomer` was given, or
 *     any other API error.
 */
const ensureCustomer = async ({
  customerNumber,
  currency,
  createCustomerIfMissing,
  newCustomer,
  company,
}) => {
  try {
    await request("GET", `/customers/${customerNumber}`, undefined, { company });
    return;
  } catch (error) {
    if (!(error instanceof EconomicApiError) || error.status !== 404) {
      throw error;
    }

    if (!createCustomerIfMissing) {
      throw error;
    }

    if (!newCustomer) {
      throw new EconomicApiError(
        "Customer does not exist. Provide newCustomer details to create it.",
        { status: 404, errorCode: "E_CUSTOMER_MISSING" }
      );
    }

    await request(
      "POST",
      "/customers",
      buildNewCustomerPayload(customerNumber, currency, newCustomer),
      { company }
    );
  }
};

/**
 * Fetches e-conomic's invoice template for a customer.
 *
 * Args:
 *   customerNumber (number): Customer number.
 *   currency (string|undefined): Optional currency for the template.
 *   company (string|undefined): Company key.
 *
 * Returns:
 *   object: Template draft with layout, payment terms and recipient filled in.
 */
const fetchInvoiceTemplate = async (customerNumber, currency, company) => {
  const query = new URLSearchParams();
  if (currency) {
    query.set("currency", currency);
  }
  const url = query.toString()
    ? `/customers/${customerNumber}/templates/invoice?${query.toString()}`
    : `/customers/${customerNumber}/templates/invoice`;

  return request("GET", url, undefined, { company });
};

/**
 * Decides whether the template is needed to complete the draft.
 *
 * Args:
 *   input (object): Tool input.
 *
 * Returns:
 *   boolean: True unless layout, payment terms, recipient name and recipient
 *   VAT zone were all given.
 */
export const needsInvoiceTemplate = ({
  layoutNumber,
  paymentTermsNumber,
  recipientName,
  recipientVatZoneNumber,
}) =>
  !layoutNumber || !paymentTermsNumber || !recipientName || !recipientVatZoneNumber;

/**
 * Builds the draft invoice payload from a base object and the tool input.
 *
 * Args:
 *   base (object): The invoice template, or an empty object when every
 *     required field was given explicitly. Not mutated.
 *   input (object): Parsed tool input.
 *
 * Returns:
 *   object: Payload for `POST /invoices/drafts`.
 */
export const buildDraftCreatePayload = (base, input) => {
  const {
    customerNumber,
    currency,
    date,
    layoutNumber,
    paymentTermsNumber,
    recipientName,
    recipientVatZoneNumber,
    dueDate,
    lines,
  } = input;

  const payload = { ...base };

  payload.date = date;
  payload.currency = currency;
  payload.customer = { customerNumber };

  if (layoutNumber) {
    payload.layout = { layoutNumber };
  }

  if (paymentTermsNumber) {
    payload.paymentTerms = { paymentTermsNumber };
  }

  payload.recipient = { ...(base.recipient ?? {}) };

  if (recipientName) {
    payload.recipient.name = recipientName;
  }

  if (recipientVatZoneNumber) {
    payload.recipient.vatZone = { vatZoneNumber: recipientVatZoneNumber };
  }

  if (dueDate) {
    payload.dueDate = dueDate;
  }

  payload.lines = lines.map(buildLine);

  return payload;
};

export const registerCreateInvoiceDraftTool = (server) => {
  server.registerTool(
    "create_invoice_draft",
    {
      title: "Create invoice draft",
      description:
        "Create a draft invoice in e-conomic. Every line needs an existing productNumber; use list_products to find one.",
      inputSchema: z.object({
        company: companySchema,
        customerNumber: z
          .number()
          .int()
          .positive()
          .describe("Customer number in e-conomic"),
        createCustomerIfMissing: z
          .boolean()
          .optional()
          .describe("Create customer if it does not exist"),
        newCustomer: newCustomerSchema
          .optional()
          .describe("Customer payload when creating a missing customer"),
        currency: z
          .string()
          .length(3)
          .describe("Invoice currency (ISO 4217)")
          .transform((value) => value.toUpperCase()),
        date: dateSchema.describe("Invoice date (YYYY-MM-DD)"),
        lines: z.array(lineSchema).min(1).describe("Invoice lines"),
        layoutNumber: z.number().int().positive().optional(),
        paymentTermsNumber: z.number().int().positive().optional(),
        recipientName: z.string().min(1).optional(),
        recipientVatZoneNumber: z.number().int().positive().optional(),
        dueDate: dateSchema.optional(),
      }),
    },
    async (input) => {
      const { company, customerNumber, createCustomerIfMissing, newCustomer, currency } =
        input;
      try {
        await ensureCustomer({
          customerNumber,
          currency,
          createCustomerIfMissing,
          newCustomer,
          company,
        });

        const base = needsInvoiceTemplate(input)
          ? await fetchInvoiceTemplate(customerNumber, currency, company)
          : {};

        const payload = buildDraftCreatePayload(base, input);
        const data = await request("POST", "/invoices/drafts", payload, { company });

        return jsonContent({
          company: resolveCompanyName(company),
          draftInvoiceNumber: data?.draftInvoiceNumber,
          customerNumber: data?.customer?.customerNumber,
          status: "draft",
          self: data?.self,
        });
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
