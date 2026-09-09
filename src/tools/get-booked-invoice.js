import { z } from "zod";
import { request } from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";

export const registerGetBookedInvoiceTool = (server) => {
  server.registerTool(
    "get_booked_invoice",
    {
      title: "Get booked invoice",
      description: "Fetch a booked invoice by number.",
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
        const data = await request(
          "GET",
          `/invoices/booked/${bookedInvoiceNumber}`,
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
