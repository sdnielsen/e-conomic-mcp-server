import { z } from "zod";
import { request } from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";

export const registerGetInvoiceDraftTool = (server) => {
  server.registerTool(
    "get_invoice_draft",
    {
      title: "Get invoice draft",
      description: "Fetch a draft invoice by number.",
      inputSchema: z.object({
        company: companySchema,
        draftInvoiceNumber: z
          .number()
          .int()
          .positive()
          .describe("Draft invoice number"),
      }),
    },
    async ({ company, draftInvoiceNumber }) => {
      try {
        const data = await request(
          "GET",
          `/invoices/drafts/${draftInvoiceNumber}`,
          undefined,
          { company }
        );
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
