import { z } from "zod";
import { request } from "../economic/api-client.js";
import {
  buildListQuery,
  companySchema,
  errorToContent,
  escapeFilterValue,
  jsonContent,
  pageSchema,
  pageSizeSchema,
} from "./tool-helpers.js";

/**
 * Builds the filter for the accounts collection.
 *
 * Args:
 *   options (object): `accountType`, optional.
 *
 * Returns:
 *   string|undefined: `accountType$eq:<type>` or undefined when unfiltered.
 */
export const buildAccountsFilter = ({ accountType } = {}) =>
  accountType ? `accountType$eq:${escapeFilterValue(accountType)}` : undefined;

export const registerListAccountsTool = (server) => {
  server.registerTool(
    "list_accounts",
    {
      title: "List accounts",
      description:
        "List the chart of accounts with balances. Filter by accountType: profitAndLoss, status, totalFrom, heading, headingStart, sumInterval or sumAlpha.",
      inputSchema: z.object({
        company: companySchema,
        accountType: z
          .string()
          .min(1)
          .max(50)
          .optional()
          .describe("Only accounts of this type, for example profitAndLoss or status."),
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, accountType, pageSize, page }) => {
      try {
        const query = buildListQuery({
          pageSize,
          page,
          filter: buildAccountsFilter({ accountType }),
        });
        const data = await request("GET", `/accounts?${query}`, undefined, { company });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
