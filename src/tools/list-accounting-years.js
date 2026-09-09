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

export const registerListAccountingYearsTool = (server) => {
  server.registerTool(
    "list_accounting_years",
    {
      title: "List accounting years",
      description:
        "List the accounting years of a company with their date ranges. Use the `year` value (for example 2025 or 2025/2026) as accountingYear in list_booked_entries and list_account_totals.",
      inputSchema: z.object({
        company: companySchema,
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, pageSize, page }) => {
      try {
        const query = buildListQuery({ pageSize, page });
        const data = await request("GET", `/accounting-years?${query}`, undefined, {
          company,
        });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
