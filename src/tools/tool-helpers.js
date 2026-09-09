import { z } from "zod";
import { EconomicApiError } from "../economic/errors.js";
import { logEvent } from "../utils/logger.js";

const DEFAULT_PAGE_SIZE = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Escape table published by the e-conomic API for filter values.
 */
const FILTER_ESCAPES = {
  $: "$$",
  "(": "$(",
  ")": "$)",
  "*": "$*",
  "[": "$[",
  "]": "$]",
  ",": "$,",
};

export const companySchema = z
  .string()
  .min(1)
  .max(50)
  .optional()
  .describe(
    "Company key as configured in ECONOMIC_GRANT_<NAME>. Required when more than one company is configured. Use list_companies to see them."
  );

export const pageSizeSchema = z
  .number()
  .int()
  .min(1)
  .max(1000)
  .optional()
  .describe("Number of items per page (default 100, max 1000).");

export const pageSchema = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe("Page number to fetch (default 1).");

export const dateSchema = z
  .string()
  .regex(DATE_PATTERN, "Must be formatted as YYYY-MM-DD");

/**
 * Wraps a JSON-serialisable value as MCP text content.
 *
 * Args:
 *   data (any): Value to serialise.
 *
 * Returns:
 *   object: `{ content: [{ type: "text", text }] }` with pretty-printed JSON.
 */
export const jsonContent = (data) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(data, null, 2),
    },
  ],
});

/**
 * Converts an API error into an MCP error result.
 *
 * Full details are logged to stderr; the model receives only the message,
 * status and error code.
 *
 * Args:
 *   error (Error): The caught error.
 *
 * Returns:
 *   object: Tool result with `isError: true`.
 *
 * Raises:
 *   Error: Rethrows `error` when it is not an `EconomicApiError`.
 */
export const errorToContent = (error) => {
  if (!(error instanceof EconomicApiError)) {
    throw error;
  }

  // Log full error details server-side for debugging
  logEvent("error", "API error occurred", {
    message: error.message,
    status: error.status,
    errorCode: error.errorCode,
    hint: error.hint,
    details: error.details,
  });

  // Return sanitized error to client (exclude internal hints and details)
  return {
    isError: true,
    ...jsonContent({
      error: error.message,
      status: error.status,
      errorCode: error.errorCode,
    }),
  };
};

/**
 * Builds the pagination (and optional filter) query for a collection endpoint.
 *
 * Args:
 *   options (object): `pageSize` (default 100), `page` (1-based, default 1)
 *     and `filter` (e-conomic filter expression, optional).
 *
 * Returns:
 *   URLSearchParams: Query with `pagesize`, `skippages` and maybe `filter`.
 */
export const buildListQuery = ({ pageSize, page, filter } = {}) => {
  const query = new URLSearchParams({
    pagesize: String(pageSize ?? DEFAULT_PAGE_SIZE),
    skippages: String((page ?? 1) - 1),
  });

  if (filter) {
    query.set("filter", filter);
  }

  return query;
};

/**
 * Escapes a value for use inside an e-conomic filter expression.
 *
 * Args:
 *   value (string|number): Raw value.
 *
 * Returns:
 *   string: Value with `$ ( ) * [ ] ,` escaped per the API's escape table.
 */
export const escapeFilterValue = (value) =>
  String(value).replace(/[$()*\[\],]/g, (char) => FILTER_ESCAPES[char]);

/**
 * Joins filter clauses with the API's `$and:` operator.
 *
 * Args:
 *   clauses (Array<string|undefined>): Clauses such as `date$gte:2025-01-01`.
 *     Empty and undefined entries are skipped.
 *
 * Returns:
 *   string|undefined: The combined filter, or undefined when nothing remains.
 */
export const joinFilters = (clauses) => {
  const kept = clauses.filter((clause) => Boolean(clause));
  return kept.length > 0 ? kept.join("$and:") : undefined;
};

/**
 * Builds inclusive date-range filter clauses.
 *
 * Args:
 *   fromDate (string|undefined): Inclusive start date, `YYYY-MM-DD`.
 *   toDate (string|undefined): Inclusive end date, `YYYY-MM-DD`.
 *
 * Returns:
 *   string[]: Zero, one or two clauses on the `date` property.
 */
export const dateRangeClauses = (fromDate, toDate) => {
  const clauses = [];
  if (fromDate) {
    clauses.push(`date$gte:${fromDate}`);
  }
  if (toDate) {
    clauses.push(`date$lte:${toDate}`);
  }
  return clauses;
};
