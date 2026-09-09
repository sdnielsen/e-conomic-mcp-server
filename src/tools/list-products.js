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

export const registerListProductsTool = (server) => {
  server.registerTool(
    "list_products",
    {
      title: "List products",
      description: "Fetch a page of products.",
      inputSchema: z.object({
        company: companySchema,
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, pageSize, page }) => {
      try {
        const query = buildListQuery({ pageSize, page });
        const data = await request("GET", `/products?${query}`, undefined, { company });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
