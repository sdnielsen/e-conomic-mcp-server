import { logDebug } from "../utils/logger.js";
import { EconomicApiError } from "./errors.js";
import { resolveCompany } from "./companies.js";

export { EconomicApiError } from "./errors.js";

const DEFAULT_BASE_URL = "https://restapi.e-conomic.com";
const ALLOWED_BASE_URL_PATTERN = /^https:\/\/restapi\.e-conomic\.com(:\d+)?$/;
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Returns the API base URL after checking it against the allowlist.
 *
 * Returns:
 *   string: Base URL without a trailing slash.
 *
 * Raises:
 *   EconomicApiError: `E_INVALID_BASE_URL` when `ECONOMIC_BASE_URL` points
 *     anywhere but the e-conomic REST host.
 */
const getBaseUrl = () => {
  const baseUrl =
    process.env.ECONOMIC_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_BASE_URL;

  if (!ALLOWED_BASE_URL_PATTERN.test(baseUrl)) {
    throw new EconomicApiError(
      `Invalid ECONOMIC_BASE_URL: ${baseUrl}. Must match https://restapi.e-conomic.com`,
      { status: 0, errorCode: "E_INVALID_BASE_URL" }
    );
  }

  return baseUrl;
};

/**
 * Reads the app secret token from the environment.
 *
 * Returns:
 *   {appSecretToken: string}: The trimmed app secret token.
 *
 * Raises:
 *   EconomicApiError: `E_NO_CREDENTIALS` when the variable is missing.
 */
export const validateCredentials = () => {
  const appSecretToken = process.env.ECONOMIC_APP_SECRET_TOKEN?.trim();

  if (!appSecretToken) {
    throw new EconomicApiError(
      "Missing ECONOMIC_APP_SECRET_TOKEN environment variable.",
      { status: 0, errorCode: "E_NO_CREDENTIALS" }
    );
  }

  return { appSecretToken };
};

/**
 * Resolves the company key a call will target, without making a request.
 *
 * Args:
 *   company (string|undefined): Company key given by the caller.
 *
 * Returns:
 *   string: The resolved company key.
 *
 * Raises:
 *   EconomicApiError: See `resolveCompany`.
 */
export const resolveCompanyName = (company) =>
  resolveCompany(process.env, company).name;

/**
 * Builds the authentication headers for one company.
 *
 * Args:
 *   company (string|undefined): Company key given by the caller.
 *   options (object): `json` (boolean, default true) adds the JSON
 *     content-type header.
 *
 * Returns:
 *   {headers: object, companyName: string}: Headers and the resolved key.
 */
const buildHeaders = (company, { json = true } = {}) => {
  const { appSecretToken } = validateCredentials();
  const resolved = resolveCompany(process.env, company);

  const headers = {
    "X-AppSecretToken": appSecretToken,
    "X-AgreementGrantToken": resolved.grantToken,
  };

  if (json) {
    headers["Content-Type"] = "application/json";
  }

  return { headers, companyName: resolved.name };
};

/**
 * Converts a failure thrown by `fetch` into an `EconomicApiError`.
 *
 * Args:
 *   error (Error): The thrown value.
 *
 * Returns:
 *   EconomicApiError: `E_TIMEOUT` for aborted requests, `E_NETWORK` for any
 *   other failure, or `error` itself when it already is an EconomicApiError.
 */
export const mapFetchError = (error) => {
  if (error instanceof EconomicApiError) {
    return error;
  }

  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return new EconomicApiError(
      `e-conomic API request timed out after ${REQUEST_TIMEOUT_MS} ms.`,
      { status: 0, errorCode: "E_TIMEOUT" }
    );
  }

  return new EconomicApiError(
    `Could not reach the e-conomic API: ${error?.message ?? String(error)}`,
    { status: 0, errorCode: "E_NETWORK" }
  );
};

/**
 * Performs a fetch with the standard timeout, mapping transport failures.
 *
 * Args:
 *   url (string): Absolute URL.
 *   init (object): Fetch options without a signal.
 *
 * Returns:
 *   Response: The fetch response, successful or not.
 *
 * Raises:
 *   EconomicApiError: On timeout or network failure.
 */
const performFetch = async (url, init) => {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw mapFetchError(error);
  }
};

/**
 * Throws an `EconomicApiError` describing a non-2xx response.
 *
 * Args:
 *   response (Response): A response with `ok === false`.
 *
 * Raises:
 *   EconomicApiError: Always.
 */
const throwForResponse = async (response) => {
  let errorPayload;
  try {
    errorPayload = await response.json();
  } catch (error) {
    errorPayload = { message: await response.text() };
  }

  const message =
    errorPayload?.message ??
    `e-conomic API request failed (${response.status}).`;

  throw new EconomicApiError(message, {
    status: response.status,
    errorCode: errorPayload?.errorCode,
    details: errorPayload,
    hint: errorPayload?.developerHint,
  });
};

/**
 * Sends a JSON request to the e-conomic REST API.
 *
 * Args:
 *   method (string): HTTP method.
 *   path (string): Path starting with "/", including any query string.
 *   body (object|undefined): JSON body, or undefined for none.
 *   options (object): `company` selects the company; may be omitted when
 *     exactly one company is configured.
 *
 * Returns:
 *   object|null: Parsed JSON body, or null for a 204 response.
 *
 * Raises:
 *   EconomicApiError: For configuration, transport and API errors.
 */
export const request = async (method, path, body, { company } = {}) => {
  const url = `${getBaseUrl()}${path}`;
  const { headers, companyName } = buildHeaders(company);
  logDebug("request", { method, path, company: companyName });

  const response = await performFetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    await throwForResponse(response);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

/**
 * Fetches a binary resource, such as an invoice PDF, from the REST API.
 *
 * Args:
 *   method (string): HTTP method.
 *   path (string): Path starting with "/".
 *   options (object): `company` selects the company; may be omitted when
 *     exactly one company is configured.
 *
 * Returns:
 *   {buffer: Buffer, contentType: string|null}: Response body and its
 *   content type header.
 *
 * Raises:
 *   EconomicApiError: For configuration, transport and API errors.
 */
export const requestBinary = async (method, path, { company } = {}) => {
  const url = `${getBaseUrl()}${path}`;
  const { headers, companyName } = buildHeaders(company, { json: false });
  logDebug("requestBinary", { method, path, company: companyName });

  const response = await performFetch(url, { method, headers });

  if (!response.ok) {
    await throwForResponse(response);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType: response.headers.get("content-type") };
};
