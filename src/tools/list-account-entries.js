import { z } from "zod";
import { request } from "../economic/api-client.js";
import { errorToContent } from "./tool-helpers.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ENTRIES_PAGE_SIZE = 1000;

/**
 * Builds an e-conomic filter expression for entries in a date range.
 *
 * The account itself is not part of the filter — the entries endpoint used by
 * this tool is already scoped to a single account, and the API rejects
 * filtering on `account.accountNumber`.
 *
 * Args:
 *   fromDate (string): Inclusive start date, `YYYY-MM-DD`.
 *   toDate (string): Inclusive end date, `YYYY-MM-DD`.
 *   amount (number|null|undefined): Optional exact match on `amountInBaseCurrency`.
 *
 * Returns:
 *   string: Filter expression using e-conomic `property$op:value` syntax joined with `$and:`.
 */
export const buildEntriesFilter = ({ fromDate, toDate, amount }) => {
  let filter = `date$gte:${fromDate}$and:date$lte:${toDate}`;

  if (amount !== null && amount !== undefined) {
    filter += `$and:amountInBaseCurrency$eq:${amount}`;
  }

  return filter;
};

/**
 * Finds the accounting year whose period fully covers the given date range.
 *
 * Args:
 *   collection (Array<object>): Accounting year objects with `fromDate` and `toDate`.
 *   fromDate (string): Inclusive start date, `YYYY-MM-DD`.
 *   toDate (string): Inclusive end date, `YYYY-MM-DD`.
 *
 * Returns:
 *   object|null: The matching accounting year, or null when no single year covers the range.
 */
export const findAccountingYear = (collection, fromDate, toDate) => {
  for (const year of collection ?? []) {
    if (year.fromDate <= fromDate && toDate <= year.toDate) {
      return year;
    }
  }
  return null;
};

/**
 * Builds the API path for one account's entries within an accounting year.
 *
 * Args:
 *   accountNumber (number): Account to list entries for.
 *   year (object): Accounting year object with a `year` identifier (e.g. "2022" or "2025/2026").
 *
 * Returns:
 *   string: Path (relative to the API base URL) for the account-scoped entries collection.
 */
export const accountEntriesPath = (accountNumber, year) =>
  `/accounts/${accountNumber}/accounting-years/${encodeURIComponent(
    year.year
  )}/entries`;

/**
 * Reduces raw entry objects to the fields needed for reconciliation plus a total.
 *
 * Args:
 *   accountNumber (number): Account the entries belong to, echoed in the result.
 *   rawEntries (Array<object>): Entry objects as returned by the e-conomic API.
 *
 * Returns:
 *   object: `{ account, count, sum, entries }` where `sum` is rounded to two decimals
 *   and each entry keeps date, text, amount, voucherNumber, entryNumber and entryType.
 */
export const summarizeEntries = (accountNumber, rawEntries) => {
  const entries = rawEntries.map((entry) => ({
    date: entry.date,
    text: entry.text,
    amount: entry.amountInBaseCurrency ?? entry.amount,
    voucherNumber: entry.voucherNumber,
    entryNumber: entry.entryNumber,
    entryType: entry.entryType,
  }));

  const sum = Number(
    entries.reduce((total, entry) => total + (entry.amount ?? 0), 0).toFixed(2)
  );

  return { account: accountNumber, count: entries.length, sum, entries };
};

export const registerListAccountEntriesTool = (server) => {
  server.registerTool(
    "list_account_entries",
    {
      title: "List account entries",
      description:
        "List booked finance entries on one account for a date range, with an optional exact amount match. Useful for chasing a bank reconciliation difference down to individual entries.",
      inputSchema: z.object({
        accountNumber: z
          .number()
          .int()
          .describe("Account number to list entries for (e.g. 5820)."),
        fromDate: z
          .string()
          .regex(DATE_PATTERN, "Must be formatted as YYYY-MM-DD")
          .describe("Inclusive start date (YYYY-MM-DD)."),
        toDate: z
          .string()
          .regex(DATE_PATTERN, "Must be formatted as YYYY-MM-DD")
          .describe("Inclusive end date (YYYY-MM-DD)."),
        amount: z
          .number()
          .nullable()
          .optional()
          .describe(
            "Optional exact match on the entry amount in base currency."
          ),
      }),
    },
    async ({ accountNumber, fromDate, toDate, amount }) => {
      try {
        const years = await request(
          "GET",
          `/accounting-years?pagesize=${ENTRIES_PAGE_SIZE}`
        );
        const year = findAccountingYear(years?.collection, fromDate, toDate);
        if (!year) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: `No accounting year covers ${fromDate}..${toDate}. Query one accounting year at a time.`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const filter = buildEntriesFilter({ fromDate, toDate, amount });
        const entriesPath = accountEntriesPath(accountNumber, year);

        const rawEntries = [];
        let skipPages = 0;
        while (true) {
          const query = new URLSearchParams({
            filter,
            pagesize: String(ENTRIES_PAGE_SIZE),
            skippages: String(skipPages),
          });
          const data = await request(
            "GET",
            `${entriesPath}?${query.toString()}`
          );
          rawEntries.push(...(data?.collection ?? []));
          if (!data?.pagination?.nextPage) {
            break;
          }
          skipPages += 1;
        }

        const result = summarizeEntries(accountNumber, rawEntries);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
