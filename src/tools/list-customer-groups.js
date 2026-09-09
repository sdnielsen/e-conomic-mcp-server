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

export const registerListCustomerGroupsTool = (server) => {
  server.registerTool(
    "list_customer_groups",
    {
      title: "List customer groups",
      description: "Fetch a page of customer groups.",
      inputSchema: z.object({
        company: companySchema,
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, pageSize, page }) => {
      try {
        const query = buildListQuery({ pageSize, page });
        const data = await request("GET", `/customer-groups?${query}`, undefined, { company });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
