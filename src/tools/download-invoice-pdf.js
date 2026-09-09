import { z } from "zod";
import { EconomicApiError, requestBinary } from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";

const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50MB limit

/**
 * Builds the API path of a booked invoice's PDF.
 *
 * Args:
 *   bookedInvoiceNumber (number): Booked invoice number.
 *
 * Returns:
 *   string: Path relative to the API base URL.
 */
const buildPdfUrl = (bookedInvoiceNumber) =>
  `/invoices/booked/${bookedInvoiceNumber}/pdf`;

export const registerDownloadInvoicePdfTool = (server) => {
  server.registerTool(
    "download_invoice_pdf",
    {
      title: "Download invoice PDF",
      description: "Download a booked invoice PDF as base64.",
      inputSchema: z.object({
        company: companySchema,
        bookedInvoiceNumber: z
          .number()
          .int()
          .positive()
          .describe("Booked invoice number"),
      }),
    },
    async ({ company, bookedInvoiceNumber }) => {
      try {
        const { buffer, contentType } = await requestBinary(
          "GET",
          buildPdfUrl(bookedInvoiceNumber),
          { company }
        );

        if (buffer.byteLength > MAX_PDF_SIZE) {
          throw new EconomicApiError(
            `PDF too large: ${buffer.byteLength} bytes (max: ${MAX_PDF_SIZE} bytes)`,
            { status: 413, errorCode: "E_PDF_TOO_LARGE" }
          );
        }

        return jsonContent({
          bookedInvoiceNumber,
          contentType,
          size: buffer.byteLength,
          base64: buffer.toString("base64"),
        });
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
