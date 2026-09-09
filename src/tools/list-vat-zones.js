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

export const registerListVatZonesTool = (server) => {
  server.registerTool(
    "list_vat_zones",
    {
      title: "List VAT zones",
      description: "Fetch a page of VAT zones.",
      inputSchema: z.object({
        company: companySchema,
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, pageSize, page }) => {
      try {
        const query = buildListQuery({ pageSize, page });
        const data = await request("GET", `/vat-zones?${query}`, undefined, { company });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
