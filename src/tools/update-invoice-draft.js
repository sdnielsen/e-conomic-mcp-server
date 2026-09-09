import { z } from "zod";
import { request, resolveCompanyName } from "../economic/api-client.js";
import {
  companySchema,
  dateSchema,
  errorToContent,
  jsonContent,
} from "./tool-helpers.js";
import { buildLine, lineSchema } from "./invoice-lines.js";

/**
 * Fields of a draft invoice that may be sent back on PUT. Taken from the
 * published schema `invoices.drafts.draftInvoiceNumber.put`, without the
 * computed amount fields and `pdf`, plus `layout`, which the API accepts on
 * update even though the PUT schema omits it.
 */
export const DRAFT_WRITABLE_FIELDS = [
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
];

/**
 * Fetches a draft invoice.
 *
 * Args:
 *   draftInvoiceNumber (number): Draft number.
 *   company (string|undefined): Company key.
 *
 * Returns:
 *   object: The draft as returned by the API.
 */
const fetchDraft = (draftInvoiceNumber, company) =>
  request("GET", `/invoices/drafts/${draftInvoiceNumber}`, undefined, { company });

/**
 * Builds the PUT payload for a draft: the current writable fields with the
 * requested changes applied on top.
 *
 * `dueDate` is only kept or set when the payment terms are of type
 * `dueDate` (where the API requires it) or when `input.dueDate` was given
 * explicitly. The GET response returns a computed `dueDate` for every draft,
 * while the PUT schema describes the field as used only for that payment
 * terms type, so it is not echoed back for other types.
 *
 * Args:
 *   current (object): The draft as returned by the API. Not mutated.
 *   input (object): Parsed tool input.
 *
 * Returns:
 *   object: Payload for `PUT /invoices/drafts/{draftInvoiceNumber}`.
 */
export const buildDraftUpdatePayload = (current, input) => {
  const payload = {};

  for (const field of DRAFT_WRITABLE_FIELDS) {
    if (current[field] !== undefined) {
      payload[field] = current[field];
    }
  }

  if (
    !input.dueDate &&
    current.paymentTerms?.paymentTermsType !== "dueDate"
  ) {
    delete payload.dueDate;
  }

  if (input.date) {
    payload.date = input.date;
  }

  if (input.dueDate) {
    payload.dueDate = input.dueDate;
  }

  if (input.currency) {
    payload.currency = input.currency;
  }

  if (input.paymentTermsNumber) {
    payload.paymentTerms = { paymentTermsNumber: input.paymentTermsNumber };
  }

  if (input.layoutNumber) {
    payload.layout = { layoutNumber: input.layoutNumber };
  }

  if (input.recipientName || input.recipientVatZoneNumber) {
    payload.recipient = { ...(payload.recipient ?? {}) };
  }

  if (input.recipientName) {
    payload.recipient.name = input.recipientName;
  }

  if (input.recipientVatZoneNumber) {
    payload.recipient.vatZone = { vatZoneNumber: input.recipientVatZoneNumber };
  }

  if (input.lines) {
    payload.lines = input.lines.map(buildLine);
  }

  return payload;
};

export const registerUpdateInvoiceDraftTool = (server) => {
  server.registerTool(
    "update_invoice_draft",
    {
      title: "Update invoice draft",
      description:
        "Update an existing draft invoice in e-conomic. Fields that are not given keep their current values. Giving lines replaces all lines.",
      inputSchema: z.object({
        company: companySchema,
        draftInvoiceNumber: z
          .number()
          .int()
          .positive()
          .describe("Draft invoice number"),
        date: dateSchema.optional().describe("Invoice date (YYYY-MM-DD)"),
        dueDate: dateSchema.optional().describe("Due date (YYYY-MM-DD)"),
        currency: z
          .string()
          .length(3)
          .optional()
          .describe("Invoice currency (ISO 4217)")
          .transform((value) => (value ? value.toUpperCase() : value)),
        paymentTermsNumber: z.number().int().positive().optional(),
        layoutNumber: z.number().int().positive().optional(),
        recipientName: z
          .string()
          .min(1)
          .max(250)
          .transform((s) => s.trim())
          .optional(),
        recipientVatZoneNumber: z.number().int().positive().optional(),
        lines: z.array(lineSchema).min(1).optional().describe("Invoice lines"),
      }),
    },
    async (input) => {
      const { company, draftInvoiceNumber } = input;
      try {
        const current = await fetchDraft(draftInvoiceNumber, company);
        const payload = buildDraftUpdatePayload(current, input);

        const data = await request(
          "PUT",
          `/invoices/drafts/${draftInvoiceNumber}`,
          payload,
          { company }
        );

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
