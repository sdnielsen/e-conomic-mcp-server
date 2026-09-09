import { z } from "zod";
import { request } from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";

export const registerGetCustomerTool = (server) => {
  server.registerTool(
    "get_customer",
    {
      title: "Get customer",
      description: "Fetch a single customer by customer number.",
      inputSchema: z.object({
        company: companySchema,
        customerNumber: z
          .number()
          .int()
          .positive()
          .describe("Customer number in e-conomic"),
      }),
    },
    async ({ company, customerNumber }) => {
      try {
        const data = await request("GET", `/customers/${customerNumber}`, undefined, {
          company,
        });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
