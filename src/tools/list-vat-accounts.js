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

export const registerListVatAccountsTool = (server) => {
  server.registerTool(
    "list_vat_accounts",
    {
      title: "List VAT accounts",
      description:
        "List VAT codes with their rate, VAT type and the ledger account each one posts to. Use it to check that entries carry the right VAT code.",
      inputSchema: z.object({
        company: companySchema,
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, pageSize, page }) => {
      try {
        const query = buildListQuery({ pageSize, page });
        const data = await request("GET", `/vat-accounts?${query}`, undefined, { company });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
