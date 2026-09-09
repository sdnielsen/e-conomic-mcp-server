import { z } from "zod";
import { request, resolveCompanyName } from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";

/**
 * Fetches e-conomic's booking instructions template for a draft invoice.
 *
 * Args:
 *   draftInvoiceNumber (number): Draft invoice number.
 *   company (string|undefined): Company key.
 *
 * Returns:
 *   object: Booking payload accepted by `POST /invoices/booked`.
 */
const fetchBookingInstructions = (draftInvoiceNumber, company) =>
  request(
    "GET",
    `/invoices/drafts/${draftInvoiceNumber}/templates/booking-instructions`,
    undefined,
    { company }
  );

export const registerBookInvoiceDraftTool = (server) => {
  server.registerTool(
    "book_invoice_draft",
    {
      title: "Book invoice draft",
      description: "Book a draft invoice into a booked invoice.",
      inputSchema: z.object({
        company: companySchema,
        draftInvoiceNumber: z
          .number()
          .int()
          .positive()
          .describe("Draft invoice number"),
        bookWithNumber: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional booked invoice number"),
      }),
    },
    async ({ company, draftInvoiceNumber, bookWithNumber }) => {
      try {
        const payload = await fetchBookingInstructions(draftInvoiceNumber, company);

        if (bookWithNumber) {
          payload.bookWithNumber = bookWithNumber;
        }

        const data = await request("POST", "/invoices/booked", payload, { company });

        return jsonContent({
          company: resolveCompanyName(company),
          bookedInvoiceNumber: data?.bookedInvoiceNumber,
          draftInvoiceNumber: data?.draftInvoiceNumber,
          self: data?.self,
        });
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
