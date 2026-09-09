import { z } from "zod";
import { request } from "../economic/api-client.js";
import {
  accountingYearSchema,
  buildListQuery,
  companySchema,
  errorToContent,
  jsonContent,
  pageSchema,
  pageSizeSchema,
} from "./tool-helpers.js";

/**
 * Builds the path of the per-account totals of a year or of one period.
 *
 * Args:
 *   accountingYear (string): Year identifier such as "2025" or "2025/2026".
 *   periodNumber (number|undefined): Period within the year, or undefined
 *     for the whole year.
 *
 * Returns:
 *   string: Path relative to the API base URL.
 */
export const accountTotalsPath = (accountingYear, periodNumber) => {
  const year = encodeURIComponent(accountingYear);
  return periodNumber === undefined
    ? `/accounting-years/${year}/totals`
    : `/accounting-years/${year}/periods/${periodNumber}/totals`;
};

export const registerListAccountTotalsTool = (server) => {
  server.registerTool(
    "list_account_totals",
    {
      title: "List account totals",
      description:
        "List the booked total per account for an accounting year, or for one period of it. Use it to reconcile VAT account balances against sales and purchase accounts.",
      inputSchema: z.object({
        company: companySchema,
        accountingYear: accountingYearSchema,
        periodNumber: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Period number within the year (1-based). Omit for the whole year."),
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, accountingYear, periodNumber, pageSize, page }) => {
      try {
        const query = buildListQuery({ pageSize, page });
        const data = await request(
          "GET",
          `${accountTotalsPath(accountingYear, periodNumber)}?${query}`,
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
