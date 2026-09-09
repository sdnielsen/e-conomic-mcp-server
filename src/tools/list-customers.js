import { z } from "zod";
import { request } from "../economic/api-client.js";
import {
  buildListQuery,
  companySchema,
  errorToContent,
  jsonContent,
  pageSchema,
  pageSizeSchema,
} from "./tool-helpers.js";

export const registerListCustomersTool = (server) => {
  server.registerTool(
    "list_customers",
    {
      title: "List customers",
      description: "Fetch a page of customers from the e-conomic API.",
      inputSchema: z.object({
        company: companySchema,
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, pageSize, page }) => {
      try {
        const query = buildListQuery({ pageSize, page });
        const data = await request("GET", `/customers?${query}`, undefined, { company });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
