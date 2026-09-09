import { z } from "zod";
import { request } from "../economic/api-client.js";
import {
  buildListQuery,
  companySchema,
  dateRangeClauses,
  dateSchema,
  errorToContent,
  escapeFilterValue,
  joinFilters,
  jsonContent,
  pageSchema,
  pageSizeSchema,
} from "./tool-helpers.js";

/**
 * Builds the filter for the booked entries of an accounting year.
 *
 * All fields are optional; only given ones become clauses. Field names come
 * from the API's `allowedFilteringFields` for the entries collection.
 *
 * Args:
 *   options (object): `fromDate`, `toDate`, `voucherNumber`, `text`,
 *     `entryType`, `amount`, `customerNumber`, `supplierNumber`.
 *
 * Returns:
 *   string|undefined: Filter expression, or undefined when nothing was given.
 */
export const buildBookedEntriesFilter = ({
  fromDate,
  toDate,
  voucherNumber,
  text,
  entryType,
  amount,
  customerNumber,
  supplierNumber,
} = {}) =>
  joinFilters([
    ...dateRangeClauses(fromDate, toDate),
    voucherNumber !== undefined ? `voucherNumber$eq:${voucherNumber}` : undefined,
    text ? `text$like:*${escapeFilterValue(text)}*` : undefined,
    entryType ? `entryType$eq:${escapeFilterValue(entryType)}` : undefined,
    amount !== undefined ? `amount$eq:${amount}` : undefined,
    customerNumber !== undefined ? `customer.customerNumber$eq:${customerNumber}` : undefined,
    supplierNumber !== undefined ? `supplier.supplierNumber$eq:${supplierNumber}` : undefined,
  ]);

/**
 * Builds the path of an accounting year's booked entries.
 *
 * Args:
 *   accountingYear (string): Year identifier such as "2025" or "2025/2026".
 *
 * Returns:
 *   string: Path relative to the API base URL, with the year URL-encoded.
 */
export const bookedEntriesPath = (accountingYear) =>
  `/accounting-years/${encodeURIComponent(accountingYear)}/entries`;

export const registerListBookedEntriesTool = (server) => {
  server.registerTool(
    "list_booked_entries",
    {
      title: "List booked entries",
      description:
        "List booked ledger entries of one accounting year, optionally narrowed by date range, voucher number, text, entry type, amount, customer or supplier. This is the main lookup for checking VAT and finding bookkeeping errors. Get the year identifier from list_accounting_years.",
      inputSchema: z.object({
        company: companySchema,
        accountingYear: z
          .string()
          .min(4)
          .max(9)
          .describe("Accounting year identifier, for example 2025 or 2025/2026."),
        fromDate: dateSchema.optional().describe("Inclusive start date (YYYY-MM-DD)."),
        toDate: dateSchema.optional().describe("Inclusive end date (YYYY-MM-DD)."),
        voucherNumber: z.number().int().optional().describe("Only entries of this voucher."),
        text: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe("Substring to search for in the entry text."),
        entryType: z
          .string()
          .min(1)
          .max(50)
          .optional()
          .describe(
            "Entry type such as customerInvoice, supplierInvoice, customerPayment, supplierPayment, financeVoucher, systemEntry."
          ),
        amount: z.number().optional().describe("Exact amount in the entry currency."),
        customerNumber: z.number().int().optional().describe("Only entries of this customer."),
        supplierNumber: z.number().int().optional().describe("Only entries of this supplier."),
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, accountingYear, pageSize, page, ...criteria }) => {
      try {
        const query = buildListQuery({
          pageSize,
          page,
          filter: buildBookedEntriesFilter(criteria),
        });
        const data = await request(
          "GET",
          `${bookedEntriesPath(accountingYear)}?${query}`,
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
