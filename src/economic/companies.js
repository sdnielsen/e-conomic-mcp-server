import { EconomicApiError } from "./errors.js";

const GRANT_PREFIX = "ECONOMIC_GRANT_";
const GRANT_SUFFIX_PATTERN = /^[A-Z0-9_]+$/;
const LEGACY_GRANT_VARIABLE = "ECONOMIC_AGREEMENT_GRANT_TOKEN";
const LEGACY_COMPANY_KEY = "default";

/**
 * Collects the configured companies from environment variables.
 *
 * Each `ECONOMIC_GRANT_<NAME>` variable holds the agreement grant token of one
 * company; the company key is `<NAME>` in lower case. The legacy
 * `ECONOMIC_AGREEMENT_GRANT_TOKEN` variable is exposed as the company
 * "default". Empty values and suffixes outside `[A-Z0-9_]` are ignored.
 *
 * Args:
 *   env (object): Environment variables, usually `process.env`.
 *
 * Returns:
 *   Map<string, string>: Company key mapped to its agreement grant token, in
 *   the order the variables appear in `env`.
 */
export const loadCompanies = (env) => {
  const companies = new Map();

  for (const [name, rawValue] of Object.entries(env)) {
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) {
      continue;
    }

    if (name === LEGACY_GRANT_VARIABLE) {
      companies.set(LEGACY_COMPANY_KEY, value);
      continue;
    }

    if (name.startsWith(GRANT_PREFIX)) {
      const suffix = name.slice(GRANT_PREFIX.length);
      if (GRANT_SUFFIX_PATTERN.test(suffix)) {
        companies.set(suffix.toLowerCase(), value);
      }
    }
  }

  return companies;
};

/**
 * Formats the configured company keys for error messages.
 *
 * Args:
 *   companies (Map<string, string>): Output of `loadCompanies`.
 *
 * Returns:
 *   string: Sorted, comma-separated company keys.
 */
const describeCompanies = (companies) => [...companies.keys()].sort().join(", ");

/**
 * Resolves which company a request should target.
 *
 * Args:
 *   env (object): Environment variables, usually `process.env`.
 *   company (string|undefined): Company key given by the caller. Matched
 *     case-insensitively after trimming. May be omitted when exactly one
 *     company is configured.
 *
 * Returns:
 *   {name: string, grantToken: string}: The resolved company key and its
 *   agreement grant token.
 *
 * Raises:
 *   EconomicApiError: `E_NO_CREDENTIALS` when no company is configured,
 *     `E_UNKNOWN_COMPANY` when `company` is not configured, and
 *     `E_COMPANY_REQUIRED` when `company` is omitted but several companies
 *     are configured.
 */
export const resolveCompany = (env, company) => {
  const companies = loadCompanies(env);

  if (companies.size === 0) {
    throw new EconomicApiError(
      "No company configured. Set ECONOMIC_GRANT_<NAME> for each company (or ECONOMIC_AGREEMENT_GRANT_TOKEN for a single company).",
      { status: 0, errorCode: "E_NO_CREDENTIALS" }
    );
  }

  const requested = typeof company === "string" ? company.trim().toLowerCase() : "";

  if (requested) {
    const grantToken = companies.get(requested);
    if (!grantToken) {
      throw new EconomicApiError(
        `Unknown company "${company.trim()}". Configured companies: ${describeCompanies(companies)}.`,
        { status: 0, errorCode: "E_UNKNOWN_COMPANY" }
      );
    }
    return { name: requested, grantToken };
  }

  if (companies.size === 1) {
    const [[name, grantToken]] = companies.entries();
    return { name, grantToken };
  }

  throw new EconomicApiError(
    `Several companies are configured; pass the company argument. Configured companies: ${describeCompanies(companies)}.`,
    { status: 0, errorCode: "E_COMPANY_REQUIRED" }
  );
};
