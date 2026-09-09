# Multi-company plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the e-conomic MCP server into a Claude Code plugin that serves several e-conomic companies from one process, with safe tests, correct field names, read-only bookkeeping lookups and a committed single-file bundle.

**Architecture:** Grant tokens are discovered from `ECONOMIC_GRANT_<NAME>` environment variables and resolved per tool call through a `company` argument in the API client. Tools stay one-file-per-tool and register through `src/tools/index.js`; shared Zod fields, query and filter helpers live in `src/tools/tool-helpers.js`. Tests run with Node's built-in runner in three layers against the real e-conomic demo API.

**Tech Stack:** Node 20+, plain ESM JavaScript, `@modelcontextprotocol/sdk` 1.25, `zod` 3, `dotenv` 16, `esbuild` (dev only), `node --test`.

Spec: `docs/superpowers/specs/2026-09-09-plugin-multi-company-design.md`.

## Global Constraints

- Plain ESM JavaScript, no TypeScript, no build step for development. Only `dist/server.mjs` is built, with esbuild, and committed.
- Every function gets a Google-style docstring (`Args:` / `Returns:` / `Raises:` sections in a JSDoc block). Existing comments are never removed.
- No mocks anywhere. Unit tests cover pure functions; integration and e2e tests call the real demo API with `ECONOMIC_APP_SECRET_TOKEN=demo` and `ECONOMIC_GRANT_DEMO=demo`.
- Test output must be pristine. Tests that trigger error logs capture `console.error` and assert on the captured line.
- `npm test` must never write to any e-conomic agreement. The demo licence rejects writes with 403 `E02002`; only that path may attempt a write.
- Node version floor: `"engines": { "node": ">=20" }`.
- Company keys are lower-case; env variable suffix pattern `^[A-Z0-9_]+$`; legacy `ECONOMIC_AGREEMENT_GRANT_TOKEN` becomes company `default`.
- Error codes introduced here: `E_NO_CREDENTIALS`, `E_COMPANY_REQUIRED`, `E_UNKNOWN_COMPANY`, `E_TIMEOUT`, `E_NETWORK`, `E_ACCOUNTING_YEAR_RANGE`.
- Base URL allowlist stays `^https:\/\/restapi\.e-conomic\.com(:\d+)?$`.
- Version `1.1.0` in both `package.json` and `.claude-plugin/plugin.json`.
- Commit after every task. Commits go to branch `worktree-plugin-multi-company`; never to `main`.
- Run commands from the worktree root `/Users/mike/development/e-conomic-mcp-server/.claude/worktrees/plugin-multi-company`.

## File structure

Created:
- `src/economic/errors.js`: `EconomicApiError` only, so other modules can import it without pulling in the HTTP client.
- `src/economic/companies.js`: company discovery and resolution from environment variables.
- `src/tools/invoice-lines.js`: shared invoice line schema and payload builder used by create and update draft tools.
- `src/tools/list-companies.js`, `src/tools/list-accounting-years.js`, `src/tools/list-accounts.js`, `src/tools/list-vat-accounts.js`, `src/tools/list-journals.js`, `src/tools/list-booked-entries.js`, `src/tools/list-account-entries.js`, `src/tools/list-account-totals.js`, `src/tools/list-journal-draft-entries.js`: one read-only tool each.
- `test/helpers/capture-server.js`: shared test helpers (capture server, tool invocation, demo env, log capture).
- `test/unit/*.test.js`, `test/integration/*.test.js`, `test/e2e/server.test.js`.
- `scripts/build.js`, `dist/server.mjs`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`.

Modified:
- `src/economic/api-client.js`: company option, binary requests, network error mapping.
- `src/tools/tool-helpers.js`: shared schemas, `jsonContent`, `isError`, list query and filter helpers.
- Every existing tool file except `hello.js`: `company` argument.
- `src/tools/create-invoice-draft.js`, `src/tools/update-invoice-draft.js`, `src/tools/update-customer.js`, `src/tools/download-invoice-pdf.js`: correctness fixes described in the spec.
- `src/tools/index.js`, `src/server.js`, `scripts/test-harness.js`, `package.json`, `.gitignore`, `README.md`, `CLAUDE.md`, `docs/creating-auth-tokens.md`, `docs/test-harness.md`.

---

### Task 1: Errors module, companies module, test scaffolding

**Files:**
- Create: `src/economic/errors.js`
- Create: `src/economic/companies.js`
- Create: `test/unit/companies.test.js`
- Modify: `package.json` (scripts and engines only)

**Interfaces:**
- Produces: `EconomicApiError(message, { status, errorCode, details, hint })` from `src/economic/errors.js`.
- Produces: `loadCompanies(env) -> Map<string, string>` and `resolveCompany(env, company) -> { name, grantToken }` from `src/economic/companies.js`.

- [ ] **Step 1: Add test scripts and engines to package.json**

Replace the `scripts` block and add `engines` so the file reads:

```json
{
  "name": "e-conomic-mcp-server",
  "version": "1.0.0",
  "description": "",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "node --test \"test/unit/*.test.js\"",
    "test:integration": "node --test \"test/integration/*.test.js\"",
    "test:e2e": "node --test \"test/e2e/*.test.js\"",
    "harness": "node scripts/test-harness.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  }
}
```

The `test:harness` script is gone on purpose: the harness is a manual live tool, not a test.

- [ ] **Step 2: Write the failing unit test**

Create `test/unit/companies.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  loadCompanies,
  resolveCompany,
} from "../../src/economic/companies.js";

test("loadCompanies reads ECONOMIC_GRANT_<NAME> variables as lower-case keys", () => {
  const companies = loadCompanies({
    ECONOMIC_GRANT_ACME: "token-a",
    ECONOMIC_GRANT_BETA_APS: " token-b ",
    UNRELATED: "x",
  });

  assert.deepEqual(
    [...companies.entries()],
    [
      ["acme", "token-a"],
      ["beta_aps", "token-b"],
    ]
  );
});

test("loadCompanies maps the legacy variable to the default company", () => {
  const companies = loadCompanies({
    ECONOMIC_AGREEMENT_GRANT_TOKEN: "legacy-token",
  });

  assert.deepEqual([...companies.entries()], [["default", "legacy-token"]]);
});

test("loadCompanies ignores empty values and invalid suffixes", () => {
  const companies = loadCompanies({
    ECONOMIC_GRANT_: "x",
    ECONOMIC_GRANT_lower: "x",
    "ECONOMIC_GRANT_WITH-DASH": "x",
    ECONOMIC_GRANT_EMPTY: "   ",
    ECONOMIC_AGREEMENT_GRANT_TOKEN: "",
  });

  assert.equal(companies.size, 0);
});

test("resolveCompany returns the only company when none is named", () => {
  const resolved = resolveCompany({ ECONOMIC_GRANT_ACME: "token-a" });

  assert.deepEqual(resolved, { name: "acme", grantToken: "token-a" });
});

test("resolveCompany matches names case-insensitively and trims them", () => {
  const env = { ECONOMIC_GRANT_ACME: "token-a", ECONOMIC_GRANT_BETA: "token-b" };

  assert.deepEqual(resolveCompany(env, " Acme "), {
    name: "acme",
    grantToken: "token-a",
  });
});

test("resolveCompany requires a company when several are configured", () => {
  const env = { ECONOMIC_GRANT_BETA: "token-b", ECONOMIC_GRANT_ACME: "token-a" };

  assert.throws(
    () => resolveCompany(env),
    (error) =>
      error.name === "EconomicApiError" &&
      error.errorCode === "E_COMPANY_REQUIRED" &&
      error.status === 0 &&
      error.message.includes("acme, beta")
  );
});

test("resolveCompany rejects an unknown company and lists the known ones", () => {
  const env = { ECONOMIC_GRANT_ACME: "token-a" };

  assert.throws(
    () => resolveCompany(env, "nope"),
    (error) =>
      error.errorCode === "E_UNKNOWN_COMPANY" &&
      error.message.includes('"nope"') &&
      error.message.includes("acme")
  );
});

test("resolveCompany fails when no company is configured", () => {
  assert.throws(
    () => resolveCompany({}),
    (error) => error.errorCode === "E_NO_CREDENTIALS"
  );
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module '.../src/economic/companies.js'`.

- [ ] **Step 4: Create the errors module**

Create `src/economic/errors.js`:

```js
/**
 * Error raised for any failure while talking to the e-conomic API or while
 * resolving the credentials for a call.
 *
 * Attributes:
 *   status (number): HTTP status of the failed response, or 0 when no
 *     response was received (network failure, timeout, configuration error).
 *   errorCode (string|undefined): e-conomic error code such as "E06000", or a
 *     local code prefixed with "E_" such as "E_COMPANY_REQUIRED".
 *   details (object|undefined): Raw error payload from the API. Logged to
 *     stderr only, never returned to the model.
 *   hint (string|undefined): Developer hint from the API. Logged only.
 */
export class EconomicApiError extends Error {
  constructor(message, { status, errorCode, details, hint } = {}) {
    super(message);
    this.name = "EconomicApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
    this.hint = hint;
  }
}
```

- [ ] **Step 5: Create the companies module**

Create `src/economic/companies.js`:

```js
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add package.json src/economic/errors.js src/economic/companies.js test/unit/companies.test.js
git commit -m "Add company resolution from ECONOMIC_GRANT variables"
```

---

### Task 2: API client with company option, binary requests and network error mapping

**Files:**
- Modify: `src/economic/api-client.js` (whole file)
- Create: `test/unit/api-client.test.js`
- Create: `test/integration/api-client.test.js`

**Interfaces:**
- Consumes: `resolveCompany(env, company)` from Task 1, `EconomicApiError` from `src/economic/errors.js`.
- Produces: `request(method, path, body, { company } = {})`, `requestBinary(method, path, { company } = {}) -> { buffer: Buffer, contentType: string|null }`, `validateCredentials() -> { appSecretToken }`, `resolveCompanyName(company) -> string`, `mapFetchError(error) -> EconomicApiError`, and re-exported `EconomicApiError`.

- [ ] **Step 1: Write the failing unit test**

Create `test/unit/api-client.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { mapFetchError, EconomicApiError } from "../../src/economic/api-client.js";

test("mapFetchError turns a timeout into E_TIMEOUT", () => {
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";

  const mapped = mapFetchError(timeout);

  assert.ok(mapped instanceof EconomicApiError);
  assert.equal(mapped.errorCode, "E_TIMEOUT");
  assert.equal(mapped.status, 0);
  assert.match(mapped.message, /timed out after 30000 ms/);
});

test("mapFetchError turns other fetch failures into E_NETWORK", () => {
  const failure = new TypeError("fetch failed");

  const mapped = mapFetchError(failure);

  assert.equal(mapped.errorCode, "E_NETWORK");
  assert.equal(mapped.status, 0);
  assert.equal(mapped.message, "Could not reach the e-conomic API: fetch failed");
});

test("mapFetchError leaves EconomicApiError untouched", () => {
  const original = new EconomicApiError("boom", { status: 0, errorCode: "E_X" });

  assert.equal(mapFetchError(original), original);
});
```

- [ ] **Step 2: Write the failing integration test**

Create `test/integration/api-client.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  request,
  requestBinary,
  resolveCompanyName,
  EconomicApiError,
} from "../../src/economic/api-client.js";

for (const key of Object.keys(process.env)) {
  if (key.startsWith("ECONOMIC_GRANT_")) {
    delete process.env[key];
  }
}
delete process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN;
delete process.env.ECONOMIC_BASE_URL;
process.env.ECONOMIC_APP_SECRET_TOKEN = "demo";
process.env.ECONOMIC_GRANT_DEMO = "demo";

test("request targets the named company", async () => {
  const self = await request("GET", "/self", undefined, { company: "demo" });

  assert.equal(typeof self.agreementNumber, "number");
  assert.equal(self.company.name, "Demo Company");
});

test("request uses the only configured company when none is named", async () => {
  const data = await request("GET", "/customers?pagesize=1");

  assert.equal(data.collection.length, 1);
});

test("resolveCompanyName returns the resolved key", () => {
  assert.equal(resolveCompanyName(), "demo");
  assert.equal(resolveCompanyName("DEMO"), "demo");
});

test("request rejects an unknown company before calling the API", async () => {
  await assert.rejects(
    request("GET", "/self", undefined, { company: "nope" }),
    (error) => error instanceof EconomicApiError && error.errorCode === "E_UNKNOWN_COMPANY"
  );
});

test("request requires a company when two are configured", async () => {
  process.env.ECONOMIC_GRANT_OTHER = "demo";
  try {
    await assert.rejects(
      request("GET", "/self"),
      (error) => error.errorCode === "E_COMPANY_REQUIRED"
    );
  } finally {
    delete process.env.ECONOMIC_GRANT_OTHER;
  }
});

test("request maps API errors to EconomicApiError with status and code", async () => {
  await assert.rejects(
    request("GET", "/customers/999999999"),
    (error) =>
      error instanceof EconomicApiError &&
      error.status === 404 &&
      error.errorCode === "E06000"
  );
});

test("requestBinary returns the PDF of a booked invoice", async () => {
  const { buffer, contentType } = await requestBinary("GET", "/invoices/booked/1/pdf");

  assert.ok(contentType.startsWith("application/pdf"));
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm run test:unit && npm run test:integration`
Expected: unit FAIL with `does not provide an export named 'mapFetchError'`; integration FAIL because `request` ignores the company option and `requestBinary` is missing.

- [ ] **Step 4: Rewrite the API client**

Replace `src/economic/api-client.js` with:

```js
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit && npm run test:integration`
Expected: unit `# pass 11`, integration `# pass 7`, no failures. The old `download-invoice-pdf.js` still imports `validateCredentials` and destructures `agreementGrantToken`; it is rewritten in Task 8 and is not exercised here.

- [ ] **Step 6: Commit**

```bash
git add src/economic/api-client.js test/unit/api-client.test.js test/integration/api-client.test.js
git commit -m "Route API requests through a per-call company and add binary requests"
```

---

### Task 3: Tool helpers and shared test helpers

**Files:**
- Modify: `src/tools/tool-helpers.js` (whole file)
- Create: `test/helpers/capture-server.js`
- Create: `test/unit/tool-helpers.test.js`
- Create: `test/integration/tool-errors.test.js`

**Interfaces:**
- Consumes: `EconomicApiError` from `src/economic/errors.js`.
- Produces from `src/tools/tool-helpers.js`: `companySchema`, `pageSizeSchema`, `pageSchema`, `dateSchema`, `jsonContent(data)`, `errorToContent(error)` (now with `isError: true`), `buildListQuery({ pageSize, page, filter })`, `escapeFilterValue(value)`, `joinFilters(clauses)`, `dateRangeClauses(fromDate, toDate)`.
- Produces from `test/helpers/capture-server.js`: `createCaptureServer()`, `invokeTool(server, name, input)`, `parseResult(result)`, `useDemoCompany()`, `captureErrorLogs(fn) -> { value, lines }`.

- [ ] **Step 1: Write the failing unit test**

Create `test/unit/tool-helpers.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { EconomicApiError } from "../../src/economic/errors.js";
import {
  buildListQuery,
  dateRangeClauses,
  errorToContent,
  escapeFilterValue,
  joinFilters,
  jsonContent,
} from "../../src/tools/tool-helpers.js";
import { captureErrorLogs } from "../helpers/capture-server.js";

test("buildListQuery defaults to page size 100 and the first page", () => {
  assert.equal(buildListQuery().toString(), "pagesize=100&skippages=0");
});

test("buildListQuery converts page numbers to skipped pages and adds a filter", () => {
  const query = buildListQuery({ pageSize: 25, page: 3, filter: "date$gte:2025-01-01" });

  assert.equal(query.get("pagesize"), "25");
  assert.equal(query.get("skippages"), "2");
  assert.equal(query.get("filter"), "date$gte:2025-01-01");
});

test("escapeFilterValue escapes every reserved character", () => {
  assert.equal(escapeFilterValue("a$b(c)d*e[f]g,h"), "a$$b$(c$)d$*e$[f$]g$,h");
  assert.equal(escapeFilterValue(42), "42");
});

test("joinFilters drops empty clauses and joins with $and:", () => {
  assert.equal(joinFilters(["a$eq:1", undefined, "", "b$eq:2"]), "a$eq:1$and:b$eq:2");
  assert.equal(joinFilters([]), undefined);
});

test("dateRangeClauses builds inclusive bounds only for given dates", () => {
  assert.deepEqual(dateRangeClauses("2025-01-01", "2025-01-31"), [
    "date$gte:2025-01-01",
    "date$lte:2025-01-31",
  ]);
  assert.deepEqual(dateRangeClauses(undefined, "2025-01-31"), ["date$lte:2025-01-31"]);
  assert.deepEqual(dateRangeClauses(), []);
});

test("jsonContent wraps data as pretty-printed text content", () => {
  assert.deepEqual(jsonContent({ a: 1 }), {
    content: [{ type: "text", text: '{\n  "a": 1\n}' }],
  });
});

test("errorToContent flags the result as an error and logs the details", async () => {
  const error = new EconomicApiError("Customer '9' was not found!", {
    status: 404,
    errorCode: "E06000",
    details: { logId: "abc" },
    hint: "look it up",
  });

  const { value, lines } = await captureErrorLogs(() => errorToContent(error));

  assert.equal(value.isError, true);
  assert.deepEqual(JSON.parse(value.content[0].text), {
    error: "Customer '9' was not found!",
    status: 404,
    errorCode: "E06000",
  });
  assert.equal(lines.length, 1);
  const logged = JSON.parse(lines[0]);
  assert.equal(logged.level, "error");
  assert.equal(logged.status, 404);
  assert.equal(logged.hint, "look it up");
});

test("errorToContent rethrows anything that is not an EconomicApiError", () => {
  assert.throws(() => errorToContent(new TypeError("nope")), TypeError);
});
```

- [ ] **Step 2: Create the shared test helpers**

Create `test/helpers/capture-server.js`:

```js
/**
 * Creates a stand-in for `McpServer` that records registered tools so tests
 * can call handlers directly, without a transport.
 *
 * Returns:
 *   {tools: Map, registerTool: Function}: `tools` maps tool name to
 *   `{ config, handler }`.
 */
export const createCaptureServer = () => {
  const tools = new Map();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
};

/**
 * Invokes a captured tool the way the MCP SDK would: input is validated and
 * transformed by the tool's Zod schema before the handler runs.
 *
 * Args:
 *   server (object): Output of `createCaptureServer` after registration.
 *   name (string): Tool name.
 *   input (object): Raw tool arguments.
 *
 * Returns:
 *   object: The tool result (`content`, optional `isError`).
 *
 * Raises:
 *   Error: When the tool is not registered.
 *   ZodError: When `input` does not match the schema.
 */
export const invokeTool = async (server, name, input = {}) => {
  const tool = server.tools.get(name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }
  const parsed = tool.config.inputSchema.parse(input);
  return tool.handler(parsed);
};

/**
 * Parses the JSON text of the first content block of a tool result.
 *
 * Args:
 *   result (object): A tool result.
 *
 * Returns:
 *   any: The parsed JSON value.
 */
export const parseResult = (result) => JSON.parse(result.content[0].text);

/**
 * Points the process at the e-conomic demo agreement as the only company.
 *
 * Removes any real grant tokens inherited from the shell so tests can never
 * touch a real agreement.
 */
export const useDemoCompany = () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("ECONOMIC_GRANT_")) {
      delete process.env[key];
    }
  }
  delete process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN;
  delete process.env.ECONOMIC_BASE_URL;
  process.env.ECONOMIC_APP_SECRET_TOKEN = "demo";
  process.env.ECONOMIC_GRANT_DEMO = "demo";
};

/**
 * Runs `fn` while capturing everything written through `console.error`, so a
 * test that expects an error log keeps the test output pristine and can
 * assert on the log line.
 *
 * Args:
 *   fn (Function): Sync or async function to run.
 *
 * Returns:
 *   {value: any, lines: string[]}: The function result and captured lines.
 */
export const captureErrorLogs = async (fn) => {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.map(String).join(" "));
  try {
    const value = await fn();
    return { value, lines };
  } finally {
    console.error = original;
  }
};
```

- [ ] **Step 3: Write the failing integration test**

Create `test/integration/tool-errors.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import registerTools from "../../src/tools/index.js";
import {
  captureErrorLogs,
  createCaptureServer,
  invokeTool,
  parseResult,
  useDemoCompany,
} from "../helpers/capture-server.js";

useDemoCompany();
const server = createCaptureServer();
registerTools(server);

test("a missing customer comes back as an error result", async () => {
  const { value, lines } = await captureErrorLogs(() =>
    invokeTool(server, "get_customer", { customerNumber: 999999999 })
  );

  assert.equal(value.isError, true);
  const body = parseResult(value);
  assert.equal(body.status, 404);
  assert.equal(body.errorCode, "E06000");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /"status":404/);
});

test("a write against the read-only demo licence comes back as an error result", async () => {
  const { value, lines } = await captureErrorLogs(() =>
    invokeTool(server, "upsert_product", {
      productNumber: "TEST-NEVER-CREATED",
      name: "Never created",
      productGroupNumber: 1,
    })
  );

  assert.equal(value.isError, true);
  const body = parseResult(value);
  assert.equal(body.status, 403);
  assert.equal(body.errorCode, "E02002");
  assert.equal(lines.length, 1);
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:unit && npm run test:integration`
Expected: unit FAIL with `does not provide an export named 'buildListQuery'`; integration FAIL on `value.isError` being `undefined`.

- [ ] **Step 5: Rewrite the tool helpers**

Replace `src/tools/tool-helpers.js` with:

```js
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit && npm run test:integration`
Expected: unit `# pass 19`, integration `# pass 9`, no failures.

- [ ] **Step 7: Commit**

```bash
git add src/tools/tool-helpers.js test/helpers/capture-server.js test/unit/tool-helpers.test.js test/integration/tool-errors.test.js
git commit -m "Flag tool errors with isError and add shared schema and filter helpers"
```

---
### Task 4: Shared invoice lines and a corrected create_invoice_draft

**Files:**
- Create: `src/tools/invoice-lines.js`
- Modify: `src/tools/create-invoice-draft.js` (whole file)
- Create: `test/unit/invoice-lines.test.js`
- Create: `test/unit/create-invoice-draft.test.js`

**Interfaces:**
- Consumes: `request`, `resolveCompanyName`, `EconomicApiError` from `src/economic/api-client.js`; `companySchema`, `dateSchema`, `errorToContent`, `jsonContent` from `src/tools/tool-helpers.js`.
- Produces: `lineSchema` (Zod object, `productNumber` required) and `buildLine(line, index)` from `src/tools/invoice-lines.js`; `buildNewCustomerPayload(customerNumber, currency, newCustomer)`, `buildDraftCreatePayload(base, input)`, `needsInvoiceTemplate(input)` from `src/tools/create-invoice-draft.js`.

- [ ] **Step 1: Write the failing unit tests**

Create `test/unit/invoice-lines.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { buildLine, lineSchema } from "../../src/tools/invoice-lines.js";

test("lineSchema requires a productNumber", () => {
  const result = lineSchema.safeParse({
    description: "Consulting",
    quantity: 1,
    unitPrice: 100,
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues[0].path, ["productNumber"]);
});

test("lineSchema trims the description", () => {
  const parsed = lineSchema.parse({
    description: "  Consulting  ",
    quantity: 1,
    unitPrice: 100,
    productNumber: "CONS",
  });

  assert.equal(parsed.description, "Consulting");
});

test("buildLine numbers lines from one and maps the product reference", () => {
  const line = buildLine(
    { description: "Consulting", quantity: 2, unitPrice: 500, productNumber: "CONS" },
    0
  );

  assert.deepEqual(line, {
    lineNumber: 1,
    sortKey: 1,
    description: "Consulting",
    quantity: 2,
    unitNetPrice: 500,
    product: { productNumber: "CONS" },
  });
});

test("buildLine includes discount and unit only when given", () => {
  const line = buildLine(
    {
      description: "Hours",
      quantity: 3,
      unitPrice: 800,
      productNumber: "HOURS",
      unitNumber: 2,
      discountPercentage: 0,
    },
    4
  );

  assert.equal(line.lineNumber, 5);
  assert.equal(line.sortKey, 5);
  assert.equal(line.discountPercentage, 0);
  assert.deepEqual(line.unit, { unitNumber: 2 });
});
```

Create `test/unit/create-invoice-draft.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftCreatePayload,
  buildNewCustomerPayload,
  needsInvoiceTemplate,
} from "../../src/tools/create-invoice-draft.js";

test("buildNewCustomerPayload uses the API field name for the company registration number", () => {
  const payload = buildNewCustomerPayload(90001, "DKK", {
    name: "Sandbox ApS",
    paymentTermsNumber: 1,
    customerGroupNumber: 2,
    vatZoneNumber: 3,
    corporateIdentificationNumber: "12345678",
    email: "billing@example.com",
  });

  assert.deepEqual(payload, {
    customerNumber: 90001,
    name: "Sandbox ApS",
    currency: "DKK",
    paymentTerms: { paymentTermsNumber: 1 },
    customerGroup: { customerGroupNumber: 2 },
    vatZone: { vatZoneNumber: 3 },
    corporateIdentificationNumber: "12345678",
    email: "billing@example.com",
  });
  assert.equal("cvr" in payload, false);
});

test("buildNewCustomerPayload prefers the customer's own currency", () => {
  const payload = buildNewCustomerPayload(1, "DKK", { name: "Euro Kunde", currency: "eur" });

  assert.equal(payload.currency, "EUR");
});

test("needsInvoiceTemplate is false only when every template field is given", () => {
  assert.equal(
    needsInvoiceTemplate({
      layoutNumber: 1,
      paymentTermsNumber: 1,
      recipientName: "A",
      recipientVatZoneNumber: 1,
    }),
    false
  );
  assert.equal(needsInvoiceTemplate({ layoutNumber: 1, paymentTermsNumber: 1 }), true);
});

test("buildDraftCreatePayload keeps template fields and applies the input", () => {
  const template = {
    customer: { customerNumber: 1, self: "x" },
    layout: { layoutNumber: 21 },
    paymentTerms: { paymentTermsNumber: 1 },
    recipient: { name: "Decathlon", address: "Avenue 5", vatZone: { vatZoneNumber: 1 } },
    notes: { heading: "Thanks" },
    currency: "EUR",
  };

  const payload = buildDraftCreatePayload(template, {
    customerNumber: 1,
    currency: "DKK",
    date: "2026-09-09",
    dueDate: "2026-09-30",
    recipientName: "Decathlon HQ",
    lines: [{ description: "Consulting", quantity: 1, unitPrice: 100, productNumber: "1" }],
  });

  assert.equal(payload.date, "2026-09-09");
  assert.equal(payload.currency, "DKK");
  assert.equal(payload.dueDate, "2026-09-30");
  assert.deepEqual(payload.customer, { customerNumber: 1 });
  assert.deepEqual(payload.layout, { layoutNumber: 21 });
  assert.equal(payload.recipient.name, "Decathlon HQ");
  assert.equal(payload.recipient.address, "Avenue 5");
  assert.deepEqual(payload.notes, { heading: "Thanks" });
  assert.equal(payload.lines.length, 1);
  assert.deepEqual(payload.lines[0].product, { productNumber: "1" });
  assert.notEqual(payload.recipient, template.recipient, "template object is not mutated");
});

test("buildDraftCreatePayload builds a complete payload without a template", () => {
  const payload = buildDraftCreatePayload({}, {
    customerNumber: 7,
    currency: "DKK",
    date: "2026-09-09",
    layoutNumber: 21,
    paymentTermsNumber: 2,
    recipientName: "ACME",
    recipientVatZoneNumber: 1,
    lines: [{ description: "Widget", quantity: 2, unitPrice: 10, productNumber: "W" }],
  });

  assert.deepEqual(payload, {
    date: "2026-09-09",
    currency: "DKK",
    customer: { customerNumber: 7 },
    layout: { layoutNumber: 21 },
    paymentTerms: { paymentTermsNumber: 2 },
    recipient: { name: "ACME", vatZone: { vatZoneNumber: 1 } },
    lines: [
      {
        lineNumber: 1,
        sortKey: 1,
        description: "Widget",
        quantity: 2,
        unitNetPrice: 10,
        product: { productNumber: "W" },
      },
    ],
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module '.../src/tools/invoice-lines.js'` and `does not provide an export named 'buildDraftCreatePayload'`.

- [ ] **Step 3: Create the shared invoice line module**

Create `src/tools/invoice-lines.js`:

```js
import { z } from "zod";

export const lineSchema = z.object({
  description: z
    .string()
    .min(1)
    .max(2000)
    .transform((s) => s.trim())
    .describe("Line description"),
  quantity: z.number().positive().describe("Quantity"),
  unitPrice: z.number().describe("Unit net price"),
  productNumber: z
    .string()
    .min(1)
    .max(50)
    .describe("Product number of an existing product. Use list_products to find one."),
  unitNumber: z.number().int().positive().optional().describe("Optional unit number"),
  discountPercentage: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Optional discount percentage"),
});

/**
 * Converts a validated tool line into an e-conomic invoice line.
 *
 * Args:
 *   line (object): Parsed `lineSchema` value.
 *   index (number): Zero-based position; line numbers start at one.
 *
 * Returns:
 *   object: Invoice line payload with `product`, and `discountPercentage` and
 *   `unit` only when they were given.
 */
export const buildLine = (line, index) => {
  const payload = {
    lineNumber: index + 1,
    sortKey: index + 1,
    description: line.description,
    quantity: line.quantity,
    unitNetPrice: line.unitPrice,
    product: { productNumber: line.productNumber },
  };

  if (line.discountPercentage !== undefined) {
    payload.discountPercentage = line.discountPercentage;
  }

  if (line.unitNumber) {
    payload.unit = { unitNumber: line.unitNumber };
  }

  return payload;
};
```

- [ ] **Step 4: Rewrite create_invoice_draft**

Replace `src/tools/create-invoice-draft.js` with:

```js
import { z } from "zod";
import {
  EconomicApiError,
  request,
  resolveCompanyName,
} from "../economic/api-client.js";
import {
  companySchema,
  dateSchema,
  errorToContent,
  jsonContent,
} from "./tool-helpers.js";
import { buildLine, lineSchema } from "./invoice-lines.js";

const newCustomerSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(250)
    .transform((s) => s.trim())
    .describe("Customer name"),
  currency: z
    .string()
    .length(3)
    .optional()
    .describe("Customer currency (ISO 4217)"),
  paymentTermsNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Payment terms number"),
  customerGroupNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Customer group number"),
  vatZoneNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("VAT zone number"),
  address: z.string().max(500).optional(),
  zip: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  email: z.string().email().max(254).toLowerCase().optional(),
  telephoneAndFaxNumber: z.string().max(50).optional(),
  ean: z.string().max(20).optional(),
  corporateIdentificationNumber: z
    .string()
    .max(40)
    .optional()
    .describe("Company registration number (CVR number in Denmark)"),
  website: z
    .string()
    .url()
    .max(500)
    .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
      message: "Website must be a valid HTTP/HTTPS URL",
    })
    .optional(),
});

const NEW_CUSTOMER_OPTIONAL_FIELDS = [
  "address",
  "zip",
  "city",
  "country",
  "email",
  "telephoneAndFaxNumber",
  "ean",
  "corporateIdentificationNumber",
  "website",
];

/**
 * Builds the payload for creating a customer that an invoice refers to.
 *
 * Args:
 *   customerNumber (number): Customer number to create.
 *   currency (string): Invoice currency, used when the customer has none.
 *   newCustomer (object): Parsed `newCustomerSchema` value.
 *
 * Returns:
 *   object: Customer payload for `POST /customers`.
 */
export const buildNewCustomerPayload = (customerNumber, currency, newCustomer) => {
  const payload = {
    customerNumber,
    name: newCustomer.name,
    currency: (newCustomer.currency ?? currency)?.toUpperCase(),
  };

  if (newCustomer.paymentTermsNumber) {
    payload.paymentTerms = {
      paymentTermsNumber: newCustomer.paymentTermsNumber,
    };
  }

  if (newCustomer.customerGroupNumber) {
    payload.customerGroup = {
      customerGroupNumber: newCustomer.customerGroupNumber,
    };
  }

  if (newCustomer.vatZoneNumber) {
    payload.vatZone = { vatZoneNumber: newCustomer.vatZoneNumber };
  }

  for (const field of NEW_CUSTOMER_OPTIONAL_FIELDS) {
    if (newCustomer[field]) {
      payload[field] = newCustomer[field];
    }
  }

  return payload;
};

/**
 * Makes sure the invoice customer exists, creating it when allowed.
 *
 * Args:
 *   options (object): `customerNumber`, `currency`, `createCustomerIfMissing`,
 *     `newCustomer` and `company`.
 *
 * Raises:
 *   EconomicApiError: The original 404 when creation is not allowed,
 *     `E_CUSTOMER_MISSING` when allowed but no `newCustomer` was given, or
 *     any other API error.
 */
const ensureCustomer = async ({
  customerNumber,
  currency,
  createCustomerIfMissing,
  newCustomer,
  company,
}) => {
  try {
    await request("GET", `/customers/${customerNumber}`, undefined, { company });
    return;
  } catch (error) {
    if (!(error instanceof EconomicApiError) || error.status !== 404) {
      throw error;
    }

    if (!createCustomerIfMissing) {
      throw error;
    }

    if (!newCustomer) {
      throw new EconomicApiError(
        "Customer does not exist. Provide newCustomer details to create it.",
        { status: 404, errorCode: "E_CUSTOMER_MISSING" }
      );
    }

    await request(
      "POST",
      "/customers",
      buildNewCustomerPayload(customerNumber, currency, newCustomer),
      { company }
    );
  }
};

/**
 * Fetches e-conomic's invoice template for a customer.
 *
 * Args:
 *   customerNumber (number): Customer number.
 *   currency (string|undefined): Optional currency for the template.
 *   company (string|undefined): Company key.
 *
 * Returns:
 *   object: Template draft with layout, payment terms and recipient filled in.
 */
const fetchInvoiceTemplate = async (customerNumber, currency, company) => {
  const query = new URLSearchParams();
  if (currency) {
    query.set("currency", currency);
  }
  const url = query.toString()
    ? `/customers/${customerNumber}/templates/invoice?${query.toString()}`
    : `/customers/${customerNumber}/templates/invoice`;

  return request("GET", url, undefined, { company });
};

/**
 * Decides whether the template is needed to complete the draft.
 *
 * Args:
 *   input (object): Tool input.
 *
 * Returns:
 *   boolean: True unless layout, payment terms, recipient name and recipient
 *   VAT zone were all given.
 */
export const needsInvoiceTemplate = ({
  layoutNumber,
  paymentTermsNumber,
  recipientName,
  recipientVatZoneNumber,
}) =>
  !layoutNumber || !paymentTermsNumber || !recipientName || !recipientVatZoneNumber;

/**
 * Builds the draft invoice payload from a base object and the tool input.
 *
 * Args:
 *   base (object): The invoice template, or an empty object when every
 *     required field was given explicitly. Not mutated.
 *   input (object): Parsed tool input.
 *
 * Returns:
 *   object: Payload for `POST /invoices/drafts`.
 */
export const buildDraftCreatePayload = (base, input) => {
  const {
    customerNumber,
    currency,
    date,
    layoutNumber,
    paymentTermsNumber,
    recipientName,
    recipientVatZoneNumber,
    dueDate,
    lines,
  } = input;

  const payload = { ...base };

  payload.date = date;
  payload.currency = currency;
  payload.customer = { customerNumber };

  if (layoutNumber) {
    payload.layout = { layoutNumber };
  }

  if (paymentTermsNumber) {
    payload.paymentTerms = { paymentTermsNumber };
  }

  payload.recipient = { ...(base.recipient ?? {}) };

  if (recipientName) {
    payload.recipient.name = recipientName;
  }

  if (recipientVatZoneNumber) {
    payload.recipient.vatZone = { vatZoneNumber: recipientVatZoneNumber };
  }

  if (dueDate) {
    payload.dueDate = dueDate;
  }

  payload.lines = lines.map(buildLine);

  return payload;
};

export const registerCreateInvoiceDraftTool = (server) => {
  server.registerTool(
    "create_invoice_draft",
    {
      title: "Create invoice draft",
      description:
        "Create a draft invoice in e-conomic. Every line needs an existing productNumber; use list_products to find one.",
      inputSchema: z.object({
        company: companySchema,
        customerNumber: z
          .number()
          .int()
          .positive()
          .describe("Customer number in e-conomic"),
        createCustomerIfMissing: z
          .boolean()
          .optional()
          .describe("Create customer if it does not exist"),
        newCustomer: newCustomerSchema
          .optional()
          .describe("Customer payload when creating a missing customer"),
        currency: z
          .string()
          .length(3)
          .describe("Invoice currency (ISO 4217)")
          .transform((value) => value.toUpperCase()),
        date: dateSchema.describe("Invoice date (YYYY-MM-DD)"),
        lines: z.array(lineSchema).min(1).describe("Invoice lines"),
        layoutNumber: z.number().int().positive().optional(),
        paymentTermsNumber: z.number().int().positive().optional(),
        recipientName: z.string().min(1).optional(),
        recipientVatZoneNumber: z.number().int().positive().optional(),
        dueDate: dateSchema.optional(),
      }),
    },
    async (input) => {
      const { company, customerNumber, createCustomerIfMissing, newCustomer, currency } =
        input;
      try {
        await ensureCustomer({
          customerNumber,
          currency,
          createCustomerIfMissing,
          newCustomer,
          company,
        });

        const base = needsInvoiceTemplate(input)
          ? await fetchInvoiceTemplate(customerNumber, currency, company)
          : {};

        const payload = buildDraftCreatePayload(base, input);
        const data = await request("POST", "/invoices/drafts", payload, { company });

        return jsonContent({
          company: resolveCompanyName(company),
          draftInvoiceNumber: data?.draftInvoiceNumber,
          customerNumber: data?.customer?.customerNumber,
          status: "draft",
          self: data?.self,
        });
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit && npm run test:integration`
Expected: unit `# pass 28`, integration `# pass 9`.

- [ ] **Step 6: Commit**

```bash
git add src/tools/invoice-lines.js src/tools/create-invoice-draft.js test/unit/invoice-lines.test.js test/unit/create-invoice-draft.test.js
git commit -m "Require product numbers on invoice lines and fix customer field names"
```

---

### Task 5: update_invoice_draft preserves every writable field

**Files:**
- Modify: `src/tools/update-invoice-draft.js` (whole file)
- Create: `test/unit/update-invoice-draft.test.js`

**Interfaces:**
- Consumes: `lineSchema`, `buildLine` from Task 4; helpers from Task 3; `request`, `resolveCompanyName` from Task 2.
- Produces: `DRAFT_WRITABLE_FIELDS` (string[]) and `buildDraftUpdatePayload(current, input)` from `src/tools/update-invoice-draft.js`.

- [ ] **Step 1: Write the failing unit test**

Create `test/unit/update-invoice-draft.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  DRAFT_WRITABLE_FIELDS,
  buildDraftUpdatePayload,
} from "../../src/tools/update-invoice-draft.js";

const current = {
  draftInvoiceNumber: 55,
  soap: { currentInvoiceHandle: { id: 55 } },
  templates: { bookingInstructions: "https://..." },
  date: "2026-01-10",
  currency: "DKK",
  exchangeRate: 100,
  netAmount: 100,
  grossAmount: 125,
  vatAmount: 25,
  roundingAmount: 0,
  dueDate: "2026-01-24",
  paymentTerms: { paymentTermsNumber: 1, self: "pt" },
  customer: { customerNumber: 1, self: "c" },
  recipient: { name: "Decathlon", address: "Avenue 5", vatZone: { vatZoneNumber: 1 } },
  deliveryLocation: { deliveryLocationNumber: 1 },
  delivery: { address: "Dock 3" },
  notes: { heading: "Thanks", textLine1: "Pay soon" },
  references: { other: "PO-77" },
  layout: { layoutNumber: 21 },
  project: { projectNumber: 7 },
  pdf: { download: "https://..." },
  lines: [{ lineNumber: 1, sortKey: 1, description: "Old", quantity: 1, unitNetPrice: 100, product: { productNumber: "1" } }],
  lastUpdated: "2026-01-10T10:00:00Z",
  self: "https://...",
};

test("DRAFT_WRITABLE_FIELDS matches the published PUT schema minus computed fields", () => {
  assert.deepEqual(DRAFT_WRITABLE_FIELDS, [
    "draftInvoiceNumber",
    "date",
    "currency",
    "exchangeRate",
    "dueDate",
    "layout",
    "project",
    "paymentTerms",
    "customer",
    "recipient",
    "deliveryLocation",
    "delivery",
    "notes",
    "references",
    "lines",
  ]);
});

test("buildDraftUpdatePayload keeps notes, references, delivery and project when only the date changes", () => {
  const payload = buildDraftUpdatePayload(current, { draftInvoiceNumber: 55, date: "2026-02-01" });

  assert.equal(payload.date, "2026-02-01");
  assert.deepEqual(payload.notes, current.notes);
  assert.deepEqual(payload.references, current.references);
  assert.deepEqual(payload.delivery, current.delivery);
  assert.deepEqual(payload.project, current.project);
  assert.deepEqual(payload.lines, current.lines);
  assert.equal(payload.dueDate, "2026-01-24");
});

test("buildDraftUpdatePayload drops computed and read-only fields", () => {
  const payload = buildDraftUpdatePayload(current, { draftInvoiceNumber: 55 });

  for (const field of ["netAmount", "grossAmount", "vatAmount", "roundingAmount", "pdf", "soap", "templates", "lastUpdated", "self"]) {
    assert.equal(field in payload, false, `${field} must not be sent`);
  }
});

test("buildDraftUpdatePayload applies every supported change", () => {
  const payload = buildDraftUpdatePayload(current, {
    draftInvoiceNumber: 55,
    dueDate: "2026-03-01",
    currency: "EUR",
    paymentTermsNumber: 3,
    layoutNumber: 22,
    recipientName: "Decathlon HQ",
    recipientVatZoneNumber: 2,
    lines: [{ description: "New", quantity: 2, unitPrice: 50, productNumber: "2" }],
  });

  assert.equal(payload.dueDate, "2026-03-01");
  assert.equal(payload.currency, "EUR");
  assert.deepEqual(payload.paymentTerms, { paymentTermsNumber: 3 });
  assert.deepEqual(payload.layout, { layoutNumber: 22 });
  assert.equal(payload.recipient.name, "Decathlon HQ");
  assert.equal(payload.recipient.address, "Avenue 5");
  assert.deepEqual(payload.recipient.vatZone, { vatZoneNumber: 2 });
  assert.deepEqual(payload.lines, [
    {
      lineNumber: 1,
      sortKey: 1,
      description: "New",
      quantity: 2,
      unitNetPrice: 50,
      product: { productNumber: "2" },
    },
  ]);
  assert.equal(current.recipient.name, "Decathlon", "current draft is not mutated");
});

test("buildDraftUpdatePayload creates a recipient when the draft has none", () => {
  const payload = buildDraftUpdatePayload(
    { draftInvoiceNumber: 1, date: "2026-01-01", currency: "DKK", customer: { customerNumber: 1 }, lines: [] },
    { draftInvoiceNumber: 1, recipientName: "New Name" }
  );

  assert.deepEqual(payload.recipient, { name: "New Name" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL with `does not provide an export named 'DRAFT_WRITABLE_FIELDS'`.

- [ ] **Step 3: Rewrite update_invoice_draft**

Replace `src/tools/update-invoice-draft.js` with:

```js
import { z } from "zod";
import { request, resolveCompanyName } from "../economic/api-client.js";
import {
  companySchema,
  dateSchema,
  errorToContent,
  jsonContent,
} from "./tool-helpers.js";
import { buildLine, lineSchema } from "./invoice-lines.js";

/**
 * Fields of a draft invoice that may be sent back on PUT. Taken from the
 * published schema `invoices.drafts.draftInvoiceNumber.put`, without the
 * computed amount fields and `pdf`, plus `layout`, which the API accepts on
 * update even though the PUT schema omits it.
 */
export const DRAFT_WRITABLE_FIELDS = [
  "draftInvoiceNumber",
  "date",
  "currency",
  "exchangeRate",
  "dueDate",
  "layout",
  "project",
  "paymentTerms",
  "customer",
  "recipient",
  "deliveryLocation",
  "delivery",
  "notes",
  "references",
  "lines",
];

/**
 * Fetches a draft invoice.
 *
 * Args:
 *   draftInvoiceNumber (number): Draft number.
 *   company (string|undefined): Company key.
 *
 * Returns:
 *   object: The draft as returned by the API.
 */
const fetchDraft = (draftInvoiceNumber, company) =>
  request("GET", `/invoices/drafts/${draftInvoiceNumber}`, undefined, { company });

/**
 * Builds the PUT payload for a draft: the current writable fields with the
 * requested changes applied on top.
 *
 * Args:
 *   current (object): The draft as returned by the API. Not mutated.
 *   input (object): Parsed tool input.
 *
 * Returns:
 *   object: Payload for `PUT /invoices/drafts/{draftInvoiceNumber}`.
 */
export const buildDraftUpdatePayload = (current, input) => {
  const payload = {};

  for (const field of DRAFT_WRITABLE_FIELDS) {
    if (current[field] !== undefined) {
      payload[field] = current[field];
    }
  }

  if (input.date) {
    payload.date = input.date;
  }

  if (input.dueDate) {
    payload.dueDate = input.dueDate;
  }

  if (input.currency) {
    payload.currency = input.currency;
  }

  if (input.paymentTermsNumber) {
    payload.paymentTerms = { paymentTermsNumber: input.paymentTermsNumber };
  }

  if (input.layoutNumber) {
    payload.layout = { layoutNumber: input.layoutNumber };
  }

  if (input.recipientName || input.recipientVatZoneNumber) {
    payload.recipient = { ...(payload.recipient ?? {}) };
  }

  if (input.recipientName) {
    payload.recipient.name = input.recipientName;
  }

  if (input.recipientVatZoneNumber) {
    payload.recipient.vatZone = { vatZoneNumber: input.recipientVatZoneNumber };
  }

  if (input.lines) {
    payload.lines = input.lines.map(buildLine);
  }

  return payload;
};

export const registerUpdateInvoiceDraftTool = (server) => {
  server.registerTool(
    "update_invoice_draft",
    {
      title: "Update invoice draft",
      description:
        "Update an existing draft invoice in e-conomic. Fields that are not given keep their current values. Giving lines replaces all lines.",
      inputSchema: z.object({
        company: companySchema,
        draftInvoiceNumber: z
          .number()
          .int()
          .positive()
          .describe("Draft invoice number"),
        date: dateSchema.optional().describe("Invoice date (YYYY-MM-DD)"),
        dueDate: dateSchema.optional().describe("Due date (YYYY-MM-DD)"),
        currency: z
          .string()
          .length(3)
          .optional()
          .describe("Invoice currency (ISO 4217)")
          .transform((value) => (value ? value.toUpperCase() : value)),
        paymentTermsNumber: z.number().int().positive().optional(),
        layoutNumber: z.number().int().positive().optional(),
        recipientName: z
          .string()
          .min(1)
          .max(250)
          .transform((s) => s.trim())
          .optional(),
        recipientVatZoneNumber: z.number().int().positive().optional(),
        lines: z.array(lineSchema).min(1).optional().describe("Invoice lines"),
      }),
    },
    async (input) => {
      const { company, draftInvoiceNumber } = input;
      try {
        const current = await fetchDraft(draftInvoiceNumber, company);
        const payload = buildDraftUpdatePayload(current, input);

        const data = await request(
          "PUT",
          `/invoices/drafts/${draftInvoiceNumber}`,
          payload,
          { company }
        );

        return jsonContent({
          company: resolveCompanyName(company),
          draftInvoiceNumber: data?.draftInvoiceNumber,
          customerNumber: data?.customer?.customerNumber,
          status: "draft",
          self: data?.self,
        });
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `# pass 33`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/update-invoice-draft.js test/unit/update-invoice-draft.test.js
git commit -m "Preserve all writable draft fields when updating an invoice draft"
```

---

### Task 6: update_customer preserves every writable field and uses real field names

**Files:**
- Modify: `src/tools/update-customer.js` (whole file)
- Create: `test/unit/update-customer.test.js`

**Interfaces:**
- Consumes: helpers from Task 3; `request`, `resolveCompanyName` from Task 2.
- Produces: `CUSTOMER_WRITABLE_FIELDS` (string[]) and `buildCustomerUpdatePayload(current, input)` from `src/tools/update-customer.js`.

- [ ] **Step 1: Write the failing unit test**

Create `test/unit/update-customer.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  CUSTOMER_WRITABLE_FIELDS,
  buildCustomerUpdatePayload,
} from "../../src/tools/update-customer.js";

const current = {
  customerNumber: 1,
  currency: "DKK",
  paymentTerms: { paymentTermsNumber: 1, self: "pt" },
  customerGroup: { customerGroupNumber: 1, self: "cg" },
  vatZone: { vatZoneNumber: 1, self: "vz" },
  name: "Decathlon",
  address: "Avenue des Arts No 5",
  zip: "1040",
  city: "Brussels",
  country: "Belgium",
  email: "customerone@mailinator.com",
  telephoneAndFaxNumber: "08343242525",
  mobilePhone: "12345678",
  website: "https://example.com",
  ean: "5790000000000",
  corporateIdentificationNumber: "BE0123",
  pNumber: "1001",
  vatNumber: "BE0123456789",
  publicEntryNumber: "PE-1",
  creditLimit: 50000,
  barred: false,
  layout: { layoutNumber: 21 },
  salesPerson: { employeeNumber: 1, self: "sp" },
  priceGroup: { priceGroupNumber: 2 },
  eInvoicingDisabledByDefault: false,
  attention: { customerContactNumber: 1, self: "ct" },
  customerContact: { customerContactNumber: 2, self: "ct2" },
  defaultDeliveryLocation: { deliveryLocationNumber: 1 },
  balance: -1600,
  dueAmount: 0,
  contacts: "https://...",
  templates: { invoice: "https://..." },
  totals: { drafts: "https://..." },
  deliveryLocations: "https://...",
  invoices: { drafts: "https://..." },
  lastUpdated: "2022-06-02T08:53:29Z",
  self: "https://...",
};

test("CUSTOMER_WRITABLE_FIELDS lists the published customer fields", () => {
  assert.deepEqual(CUSTOMER_WRITABLE_FIELDS, [
    "customerNumber",
    "name",
    "currency",
    "paymentTerms",
    "customerGroup",
    "vatZone",
    "address",
    "zip",
    "city",
    "country",
    "email",
    "telephoneAndFaxNumber",
    "mobilePhone",
    "website",
    "ean",
    "corporateIdentificationNumber",
    "pNumber",
    "vatNumber",
    "publicEntryNumber",
    "creditLimit",
    "barred",
    "layout",
    "salesPerson",
    "priceGroup",
    "eInvoicingDisabledByDefault",
    "attention",
    "customerContact",
    "defaultDeliveryLocation",
  ]);
});

test("buildCustomerUpdatePayload keeps credit limit, sales person and contacts when only the name changes", () => {
  const payload = buildCustomerUpdatePayload(current, { customerNumber: 1, name: "Decathlon Belgium" });

  assert.equal(payload.name, "Decathlon Belgium");
  assert.equal(payload.creditLimit, 50000);
  assert.deepEqual(payload.salesPerson, current.salesPerson);
  assert.deepEqual(payload.attention, current.attention);
  assert.deepEqual(payload.customerContact, current.customerContact);
  assert.equal(payload.mobilePhone, "12345678");
});

test("buildCustomerUpdatePayload drops computed and link fields", () => {
  const payload = buildCustomerUpdatePayload(current, { customerNumber: 1 });

  for (const field of ["balance", "dueAmount", "contacts", "templates", "totals", "deliveryLocations", "invoices", "lastUpdated", "self"]) {
    assert.equal(field in payload, false, `${field} must not be sent`);
  }
  assert.equal("cvr" in payload, false);
});

test("buildCustomerUpdatePayload applies every supported change", () => {
  const payload = buildCustomerUpdatePayload(current, {
    customerNumber: 1,
    currency: "EUR",
    paymentTermsNumber: 3,
    customerGroupNumber: 4,
    vatZoneNumber: 2,
    email: "billing@example.com",
    corporateIdentificationNumber: "BE0999",
    website: "https://new.example.com",
  });

  assert.equal(payload.currency, "EUR");
  assert.deepEqual(payload.paymentTerms, { paymentTermsNumber: 3 });
  assert.deepEqual(payload.customerGroup, { customerGroupNumber: 4 });
  assert.deepEqual(payload.vatZone, { vatZoneNumber: 2 });
  assert.equal(payload.email, "billing@example.com");
  assert.equal(payload.corporateIdentificationNumber, "BE0999");
  assert.equal(payload.website, "https://new.example.com");
  assert.equal(current.currency, "DKK", "current customer is not mutated");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL with `does not provide an export named 'CUSTOMER_WRITABLE_FIELDS'`.

- [ ] **Step 3: Rewrite update_customer**

Replace `src/tools/update-customer.js` with:

```js
import { z } from "zod";
import { request, resolveCompanyName } from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";

/**
 * Fields of a customer that may be sent back on PUT. Taken from the published
 * `customers.post` schema (the PUT schema is not published) plus the
 * reference fields `attention`, `customerContact` and
 * `defaultDeliveryLocation`, which the API returns and accepts on update.
 * Computed fields such as `balance` and link fields such as `templates` are
 * left out.
 */
export const CUSTOMER_WRITABLE_FIELDS = [
  "customerNumber",
  "name",
  "currency",
  "paymentTerms",
  "customerGroup",
  "vatZone",
  "address",
  "zip",
  "city",
  "country",
  "email",
  "telephoneAndFaxNumber",
  "mobilePhone",
  "website",
  "ean",
  "corporateIdentificationNumber",
  "pNumber",
  "vatNumber",
  "publicEntryNumber",
  "creditLimit",
  "barred",
  "layout",
  "salesPerson",
  "priceGroup",
  "eInvoicingDisabledByDefault",
  "attention",
  "customerContact",
  "defaultDeliveryLocation",
];

/**
 * Input fields that are copied onto the payload under the same name.
 */
const DIRECT_FIELDS = [
  "name",
  "address",
  "zip",
  "city",
  "country",
  "email",
  "telephoneAndFaxNumber",
  "ean",
  "corporateIdentificationNumber",
  "website",
];

const updateSchema = z.object({
  company: companySchema,
  customerNumber: z
    .number()
    .int()
    .positive()
    .describe("Customer number to update"),
  name: z
    .string()
    .min(1)
    .max(250)
    .transform((s) => s.trim())
    .optional(),
  currency: z
    .string()
    .length(3)
    .optional()
    .describe("Customer currency (ISO 4217)")
    .transform((value) => (value ? value.toUpperCase() : value)),
  paymentTermsNumber: z.number().int().positive().optional(),
  customerGroupNumber: z.number().int().positive().optional(),
  vatZoneNumber: z.number().int().positive().optional(),
  address: z.string().max(500).optional(),
  zip: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  email: z.string().email().max(254).toLowerCase().optional(),
  telephoneAndFaxNumber: z.string().max(50).optional(),
  ean: z.string().max(20).optional(),
  corporateIdentificationNumber: z
    .string()
    .max(40)
    .optional()
    .describe("Company registration number (CVR number in Denmark)"),
  website: z
    .string()
    .url()
    .max(500)
    .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
      message: "Website must be a valid HTTP/HTTPS URL",
    })
    .optional(),
});

/**
 * Fetches a customer.
 *
 * Args:
 *   customerNumber (number): Customer number.
 *   company (string|undefined): Company key.
 *
 * Returns:
 *   object: The customer as returned by the API.
 */
const fetchCustomer = (customerNumber, company) =>
  request("GET", `/customers/${customerNumber}`, undefined, { company });

/**
 * Builds the PUT payload for a customer: the current writable fields with the
 * requested changes applied on top.
 *
 * Args:
 *   current (object): The customer as returned by the API. Not mutated.
 *   input (object): Parsed tool input.
 *
 * Returns:
 *   object: Payload for `PUT /customers/{customerNumber}`.
 */
export const buildCustomerUpdatePayload = (current, input) => {
  const payload = {};

  for (const field of CUSTOMER_WRITABLE_FIELDS) {
    if (current[field] !== undefined) {
      payload[field] = current[field];
    }
  }

  for (const field of DIRECT_FIELDS) {
    if (input[field] !== undefined) {
      payload[field] = input[field];
    }
  }

  if (input.currency) {
    payload.currency = input.currency;
  }

  if (input.paymentTermsNumber) {
    payload.paymentTerms = { paymentTermsNumber: input.paymentTermsNumber };
  }

  if (input.customerGroupNumber) {
    payload.customerGroup = { customerGroupNumber: input.customerGroupNumber };
  }

  if (input.vatZoneNumber) {
    payload.vatZone = { vatZoneNumber: input.vatZoneNumber };
  }

  return payload;
};

export const registerUpdateCustomerTool = (server) => {
  server.registerTool(
    "update_customer",
    {
      title: "Update customer",
      description:
        "Update an existing customer in e-conomic. Fields that are not given keep their current values.",
      inputSchema: updateSchema,
    },
    async (input) => {
      const { company, customerNumber } = input;
      try {
        const current = await fetchCustomer(customerNumber, company);
        const payload = buildCustomerUpdatePayload(current, input);

        const data = await request("PUT", `/customers/${customerNumber}`, payload, {
          company,
        });

        return jsonContent({
          company: resolveCompanyName(company),
          customerNumber: data?.customerNumber,
          name: data?.name,
          self: data?.self,
        });
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: `# pass 37`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/update-customer.js test/unit/update-customer.test.js
git commit -m "Preserve all writable customer fields and use the API's registration number field"
```

---
### Task 7: The company argument on every remaining existing tool

**Files:**
- Modify: `src/tools/list-customers.js`, `src/tools/get-customer.js`, `src/tools/list-products.js`, `src/tools/upsert-product.js`, `src/tools/list-invoice-drafts.js`, `src/tools/get-invoice-draft.js`, `src/tools/book-invoice-draft.js`, `src/tools/list-booked-invoices.js`, `src/tools/get-booked-invoice.js`, `src/tools/list-payment-terms.js`, `src/tools/list-customer-groups.js`, `src/tools/list-vat-zones.js`
- Create: `test/integration/company-selection.test.js`

`hello.js` does not call the API and is left alone. `download-invoice-pdf.js` is rewritten in Task 8.

**Interfaces:**
- Consumes: `companySchema`, `errorToContent`, `jsonContent` from Task 3; `request`, `resolveCompanyName` from Task 2.
- Produces: every tool accepts an optional `company` string; `upsert_product` returns `{ company, product }`; `book_invoice_draft` adds `company` to its summary.

- [ ] **Step 1: Write the failing integration test**

Create `test/integration/company-selection.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import registerTools from "../../src/tools/index.js";
import {
  captureErrorLogs,
  createCaptureServer,
  invokeTool,
  parseResult,
  useDemoCompany,
} from "../helpers/capture-server.js";

useDemoCompany();
const server = createCaptureServer();
registerTools(server);

const READ_TOOLS_WITH_PAGING = [
  "list_customers",
  "list_products",
  "list_invoice_drafts",
  "list_booked_invoices",
  "list_payment_terms",
  "list_customer_groups",
  "list_vat_zones",
];

for (const name of READ_TOOLS_WITH_PAGING) {
  test(`${name} accepts the company argument`, async () => {
    const result = await invokeTool(server, name, { company: "demo", pageSize: 1 });

    assert.notEqual(result.isError, true);
    const body = parseResult(result);
    assert.ok(Array.isArray(body.collection));
  });
}

test("get_customer, get_invoice_draft and get_booked_invoice accept the company argument", async () => {
  const customer = parseResult(
    await invokeTool(server, "get_customer", { company: "demo", customerNumber: 1 })
  );
  assert.equal(customer.customerNumber, 1);

  const booked = parseResult(
    await invokeTool(server, "get_booked_invoice", { company: "demo", bookedInvoiceNumber: 1 })
  );
  assert.equal(booked.bookedInvoiceNumber, 1);

  const drafts = parseResult(
    await invokeTool(server, "list_invoice_drafts", { company: "demo", pageSize: 1 })
  );
  const draftNumber = drafts.collection[0]?.draftInvoiceNumber;
  assert.ok(draftNumber, "demo agreement has at least one draft");
  const draft = parseResult(
    await invokeTool(server, "get_invoice_draft", { company: "demo", draftInvoiceNumber: draftNumber })
  );
  assert.equal(draft.draftInvoiceNumber, draftNumber);
});

test("an unknown company is reported as an error result", async () => {
  const { value, lines } = await captureErrorLogs(() =>
    invokeTool(server, "list_customers", { company: "nope", pageSize: 1 })
  );

  assert.equal(value.isError, true);
  assert.equal(parseResult(value).errorCode, "E_UNKNOWN_COMPANY");
  assert.equal(lines.length, 1);
});

test("omitting the company with two companies configured is reported as an error result", async () => {
  process.env.ECONOMIC_GRANT_OTHER = "demo";
  try {
    const { value } = await captureErrorLogs(() =>
      invokeTool(server, "get_customer", { customerNumber: 1 })
    );

    assert.equal(value.isError, true);
    assert.equal(parseResult(value).errorCode, "E_COMPANY_REQUIRED");
  } finally {
    delete process.env.ECONOMIC_GRANT_OTHER;
  }
});

test("write tools report which company they would act on", async () => {
  const { value } = await captureErrorLogs(() =>
    invokeTool(server, "book_invoice_draft", { company: "demo", draftInvoiceNumber: 999999999 })
  );

  assert.equal(value.isError, true);
  assert.equal(parseResult(value).status, 404);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:integration`
Expected: FAIL on the `company` tests with `ZodError: Unrecognized key(s) in object: 'company'` for tools that do not accept it yet.

- [ ] **Step 3: Update the seven paginated list tools**

Each of `list-customers.js`, `list-products.js`, `list-invoice-drafts.js`, `list-booked-invoices.js`, `list-payment-terms.js`, `list-customer-groups.js`, `list-vat-zones.js` currently has the shape of `list-customers.js` with its own tool name, title, description and path (`/customers`, `/products`, `/invoices/drafts`, `/invoices/booked`, `/payment-terms`, `/customer-groups`, `/vat-zones`). Rewrite each to this shape, keeping its own name, title, description and path. `list-customers.js` becomes:

```js
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

export const registerListCustomersTool = (server) => {
  server.registerTool(
    "list_customers",
    {
      title: "List customers",
      description: "Fetch a page of customers from the e-conomic API.",
      inputSchema: z.object({
        company: companySchema,
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, pageSize, page }) => {
      try {
        const query = buildListQuery({ pageSize, page });
        const data = await request("GET", `/customers?${query}`, undefined, { company });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
```

Keep each file's existing `description` text. The other six files differ only in the exported function name, tool name, title, description and path.

- [ ] **Step 4: Update the three single-item tools**

`get-customer.js`, `get-invoice-draft.js` and `get-booked-invoice.js` take the shape below, keeping their own tool name, title, description, argument name (`customerNumber`, `draftInvoiceNumber`, `bookedInvoiceNumber`) and path (`/customers/{n}`, `/invoices/drafts/{n}`, `/invoices/booked/{n}`). `get-customer.js` becomes:

```js
import { z } from "zod";
import { request } from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";

export const registerGetCustomerTool = (server) => {
  server.registerTool(
    "get_customer",
    {
      title: "Get customer",
      description: "Fetch a single customer by customer number.",
      inputSchema: z.object({
        company: companySchema,
        customerNumber: z.number().int().positive().describe("Customer number"),
      }),
    },
    async ({ company, customerNumber }) => {
      try {
        const data = await request("GET", `/customers/${customerNumber}`, undefined, {
          company,
        });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
```

Keep each file's existing `description` text.

- [ ] **Step 5: Update upsert_product**

In `src/tools/upsert-product.js`:

1. Change the imports to:

```js
import { z } from "zod";
import {
  EconomicApiError,
  request,
  resolveCompanyName,
} from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";
```

2. Add `company: companySchema,` as the first entry of `productSchema`.
3. In the handler, pass `{ company: input.company }` as the fourth argument to all three `request` calls (the GET, the PUT and the POST).
4. Replace the success return with:

```js
        return jsonContent({
          company: resolveCompanyName(input.company),
          product: data,
        });
```

- [ ] **Step 6: Update book_invoice_draft**

In `src/tools/book-invoice-draft.js`:

1. Change the imports to:

```js
import { z } from "zod";
import { request, resolveCompanyName } from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";
```

2. Change `fetchBookingInstructions` to take and pass the company:

```js
const fetchBookingInstructions = (draftInvoiceNumber, company) =>
  request(
    "GET",
    `/invoices/drafts/${draftInvoiceNumber}/templates/booking-instructions`,
    undefined,
    { company }
  );
```

3. Add `company: companySchema,` as the first entry of the input schema, destructure `company` in the handler, call `fetchBookingInstructions(draftInvoiceNumber, company)`, pass `{ company }` to the POST, and return:

```js
        return jsonContent({
          company: resolveCompanyName(company),
          bookedInvoiceNumber: data?.bookedInvoiceNumber,
          draftInvoiceNumber: data?.draftInvoiceNumber,
          self: data?.self,
        });
```

- [ ] **Step 7: Run all tests to verify they pass**

Run: `npm run test:unit && npm run test:integration`
Expected: unit `# pass 37`; integration `# pass 20`, `# fail 0`.

- [ ] **Step 8: Commit**

```bash
git add src/tools test/integration/company-selection.test.js
git commit -m "Accept a company argument on every API-backed tool"
```

---

### Task 8: download_invoice_pdf through the shared client

**Files:**
- Modify: `src/tools/download-invoice-pdf.js` (whole file)
- Create: `test/integration/download-invoice-pdf.test.js`

**Interfaces:**
- Consumes: `requestBinary`, `EconomicApiError` from Task 2; helpers from Task 3.

- [ ] **Step 1: Write the failing integration test**

Create `test/integration/download-invoice-pdf.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import registerTools from "../../src/tools/index.js";
import {
  captureErrorLogs,
  createCaptureServer,
  invokeTool,
  parseResult,
  useDemoCompany,
} from "../helpers/capture-server.js";

useDemoCompany();
const server = createCaptureServer();
registerTools(server);

test("download_invoice_pdf returns the PDF as base64 with its size", async () => {
  const result = await invokeTool(server, "download_invoice_pdf", {
    company: "demo",
    bookedInvoiceNumber: 1,
  });

  assert.notEqual(result.isError, true);
  const body = parseResult(result);
  assert.equal(body.bookedInvoiceNumber, 1);
  assert.ok(body.contentType.startsWith("application/pdf"));
  assert.ok(body.base64.startsWith("JVBERi0"), "base64 of %PDF-");
  assert.equal(Buffer.from(body.base64, "base64").length, body.size);
});

test("download_invoice_pdf reports a missing invoice as an error result", async () => {
  const { value, lines } = await captureErrorLogs(() =>
    invokeTool(server, "download_invoice_pdf", { bookedInvoiceNumber: 999999999 })
  );

  assert.equal(value.isError, true);
  assert.equal(parseResult(value).status, 404);
  assert.equal(lines.length, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:integration`
Expected: FAIL; the current tool destructures `agreementGrantToken` from `validateCredentials()` and sends an undefined header, so the API answers 401 and the test sees `isError` undefined.

- [ ] **Step 3: Rewrite the tool**

Replace `src/tools/download-invoice-pdf.js` with:

```js
import { z } from "zod";
import { EconomicApiError, requestBinary } from "../economic/api-client.js";
import { companySchema, errorToContent, jsonContent } from "./tool-helpers.js";

const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50MB limit

/**
 * Builds the API path of a booked invoice's PDF.
 *
 * Args:
 *   bookedInvoiceNumber (number): Booked invoice number.
 *
 * Returns:
 *   string: Path relative to the API base URL.
 */
const buildPdfUrl = (bookedInvoiceNumber) =>
  `/invoices/booked/${bookedInvoiceNumber}/pdf`;

export const registerDownloadInvoicePdfTool = (server) => {
  server.registerTool(
    "download_invoice_pdf",
    {
      title: "Download invoice PDF",
      description: "Download a booked invoice PDF as base64.",
      inputSchema: z.object({
        company: companySchema,
        bookedInvoiceNumber: z
          .number()
          .int()
          .positive()
          .describe("Booked invoice number"),
      }),
    },
    async ({ company, bookedInvoiceNumber }) => {
      try {
        const { buffer, contentType } = await requestBinary(
          "GET",
          buildPdfUrl(bookedInvoiceNumber),
          { company }
        );

        if (buffer.byteLength > MAX_PDF_SIZE) {
          throw new EconomicApiError(
            `PDF too large: ${buffer.byteLength} bytes (max: ${MAX_PDF_SIZE} bytes)`,
            { status: 413, errorCode: "E_PDF_TOO_LARGE" }
          );
        }

        return jsonContent({
          bookedInvoiceNumber,
          contentType,
          size: buffer.byteLength,
          base64: buffer.toString("base64"),
        });
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:integration`
Expected: `# pass 22`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/download-invoice-pdf.js test/integration/download-invoice-pdf.test.js
git commit -m "Download invoice PDFs through the shared API client"
```

---

### Task 9: list_companies tool

**Files:**
- Create: `src/tools/list-companies.js`
- Modify: `src/tools/index.js`
- Create: `test/integration/list-companies.test.js`

**Interfaces:**
- Consumes: `loadCompanies` from Task 1; `request`, `EconomicApiError` from Task 2; `errorToContent`, `jsonContent` from Task 3.
- Produces: tool `list_companies` with no arguments, returning an array of `{ company, agreementNumber, companyName, companyIdentificationNumber }` or `{ company, error, errorCode, status }` per configured company.

- [ ] **Step 1: Write the failing integration test**

Create `test/integration/list-companies.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import registerTools from "../../src/tools/index.js";
import {
  captureErrorLogs,
  createCaptureServer,
  invokeTool,
  parseResult,
  useDemoCompany,
} from "../helpers/capture-server.js";

useDemoCompany();
const server = createCaptureServer();
registerTools(server);

test("list_companies describes every configured company", async () => {
  const result = await invokeTool(server, "list_companies", {});

  assert.notEqual(result.isError, true);
  const body = parseResult(result);
  assert.equal(body.length, 1);
  assert.equal(body[0].company, "demo");
  assert.equal(typeof body[0].agreementNumber, "number");
  assert.equal(body[0].companyName, "Demo Company");
  assert.equal(typeof body[0].companyIdentificationNumber, "string");
});

test("list_companies reports a company whose token is rejected without failing the others", async () => {
  process.env.ECONOMIC_GRANT_BROKEN = "not-a-real-token";
  try {
    const { value, lines } = await captureErrorLogs(() => invokeTool(server, "list_companies", {}));

    assert.notEqual(value.isError, true);
    const body = parseResult(value);
    assert.deepEqual(
      body.map((entry) => entry.company),
      ["broken", "demo"]
    );
    assert.equal(body[0].status, 401);
    assert.equal(typeof body[0].error, "string");
    assert.equal(body[1].companyName, "Demo Company");
    assert.equal(lines.length, 1);
  } finally {
    delete process.env.ECONOMIC_GRANT_BROKEN;
  }
});

test("list_companies is an error result when every company fails", async () => {
  const demoToken = process.env.ECONOMIC_GRANT_DEMO;
  process.env.ECONOMIC_GRANT_DEMO = "not-a-real-token";
  try {
    const { value } = await captureErrorLogs(() => invokeTool(server, "list_companies", {}));

    assert.equal(value.isError, true);
    assert.equal(parseResult(value)[0].status, 401);
  } finally {
    process.env.ECONOMIC_GRANT_DEMO = demoToken;
  }
});

test("list_companies is an error result when nothing is configured", async () => {
  const demoToken = process.env.ECONOMIC_GRANT_DEMO;
  delete process.env.ECONOMIC_GRANT_DEMO;
  try {
    const { value } = await captureErrorLogs(() => invokeTool(server, "list_companies", {}));

    assert.equal(value.isError, true);
    assert.equal(parseResult(value).errorCode, "E_NO_CREDENTIALS");
  } finally {
    process.env.ECONOMIC_GRANT_DEMO = demoToken;
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:integration`
Expected: FAIL with `Tool not found: list_companies`.

- [ ] **Step 3: Create the tool**

Create `src/tools/list-companies.js`:

```js
import { z } from "zod";
import { loadCompanies } from "../economic/companies.js";
import { EconomicApiError, request } from "../economic/api-client.js";
import { errorToContent, jsonContent } from "./tool-helpers.js";

/**
 * Describes one configured company by asking the API who the token belongs to.
 *
 * Args:
 *   company (string): Company key.
 *
 * Returns:
 *   object: `{ company, agreementNumber, companyName,
 *   companyIdentificationNumber }`, or `{ company, error, errorCode, status }`
 *   when the API rejects the call.
 *
 * Raises:
 *   Error: Anything that is not an `EconomicApiError`.
 */
const describeCompany = async (company) => {
  try {
    const self = await request("GET", "/self", undefined, { company });
    return {
      company,
      agreementNumber: self?.agreementNumber,
      companyName: self?.company?.name,
      companyIdentificationNumber: self?.company?.companyIdentificationNumber,
    };
  } catch (error) {
    if (!(error instanceof EconomicApiError)) {
      throw error;
    }
    // Reuse the standard error path so the failure is logged the same way.
    const logged = errorToContent(error);
    const body = JSON.parse(logged.content[0].text);
    return {
      company,
      error: body.error,
      errorCode: body.errorCode,
      status: body.status,
    };
  }
};

export const registerListCompaniesTool = (server) => {
  server.registerTool(
    "list_companies",
    {
      title: "List companies",
      description:
        "List the e-conomic companies this server is configured for, with their agreement numbers. Call this first; when more than one company is listed, every other tool needs the company argument.",
      inputSchema: z.object({}),
    },
    async () => {
      const companies = [...loadCompanies(process.env).keys()].sort();

      if (companies.length === 0) {
        return errorToContent(
          new EconomicApiError(
            "No company configured. Set ECONOMIC_GRANT_<NAME> for each company (or ECONOMIC_AGREEMENT_GRANT_TOKEN for a single company).",
            { status: 0, errorCode: "E_NO_CREDENTIALS" }
          )
        );
      }

      const results = [];
      for (const company of companies) {
        results.push(await describeCompany(company));
      }

      const allFailed = results.every((entry) => entry.error !== undefined);
      return { ...jsonContent(results), ...(allFailed ? { isError: true } : {}) };
    }
  );
};
```

- [ ] **Step 4: Register the tool**

In `src/tools/index.js` add the import after the `hello` import:

```js
import { registerListCompaniesTool } from "./list-companies.js";
```

and call it right after `registerHelloTool(server);`:

```js
  registerListCompaniesTool(server);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:integration`
Expected: `# pass 26`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/tools/list-companies.js src/tools/index.js test/integration/list-companies.test.js
git commit -m "Add list_companies to show which companies are configured"
```

---
### Task 10: Simple lookups: accounting years, accounts, VAT accounts, journals

**Files:**
- Create: `src/tools/list-accounting-years.js`, `src/tools/list-accounts.js`, `src/tools/list-vat-accounts.js`, `src/tools/list-journals.js`
- Modify: `src/tools/index.js`
- Create: `test/integration/simple-lookups.test.js`

**Interfaces:**
- Consumes: `request` from Task 2; `buildListQuery`, `companySchema`, `errorToContent`, `escapeFilterValue`, `jsonContent`, `pageSchema`, `pageSizeSchema` from Task 3.
- Produces: tools `list_accounting_years`, `list_accounts`, `list_vat_accounts`, `list_journals`; `buildAccountsFilter({ accountType })` from `src/tools/list-accounts.js`.

- [ ] **Step 1: Write the failing integration test**

Create `test/integration/simple-lookups.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import registerTools from "../../src/tools/index.js";
import {
  createCaptureServer,
  invokeTool,
  parseResult,
  useDemoCompany,
} from "../helpers/capture-server.js";

useDemoCompany();
const server = createCaptureServer();
registerTools(server);

test("list_accounting_years returns years with their date ranges", async () => {
  const body = parseResult(await invokeTool(server, "list_accounting_years", { pageSize: 2 }));

  assert.ok(body.collection.length > 0);
  const year = body.collection[0];
  assert.equal(typeof year.year, "string");
  assert.match(year.fromDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(year.toDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("list_accounts returns the chart of accounts", async () => {
  const body = parseResult(await invokeTool(server, "list_accounts", { pageSize: 3 }));

  assert.equal(body.collection.length, 3);
  assert.equal(typeof body.collection[0].accountNumber, "number");
  assert.equal(typeof body.collection[0].name, "string");
});

test("list_accounts filters by account type", async () => {
  const body = parseResult(
    await invokeTool(server, "list_accounts", { accountType: "profitAndLoss", pageSize: 5 })
  );

  assert.ok(body.collection.length > 0);
  for (const account of body.collection) {
    assert.equal(account.accountType, "profitAndLoss");
  }
});

test("list_vat_accounts returns VAT codes with rates", async () => {
  const body = parseResult(await invokeTool(server, "list_vat_accounts", {}));

  assert.ok(body.collection.length > 0);
  const vatAccount = body.collection[0];
  assert.equal(typeof vatAccount.vatCode, "string");
  assert.equal(typeof vatAccount.ratePercentage, "number");
  assert.equal(typeof vatAccount.account.accountNumber, "number");
});

test("list_journals returns journals with numbers and names", async () => {
  const body = parseResult(await invokeTool(server, "list_journals", { pageSize: 2 }));

  assert.ok(body.collection.length > 0);
  assert.equal(typeof body.collection[0].journalNumber, "number");
  assert.equal(typeof body.collection[0].name, "string");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:integration`
Expected: FAIL with `Tool not found: list_accounting_years`.

- [ ] **Step 3: Create the four tools**

Create `src/tools/list-accounting-years.js`:

```js
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
```

Create `src/tools/list-accounts.js`:

```js
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
```

Create `src/tools/list-vat-accounts.js`:

```js
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
```

Create `src/tools/list-journals.js`:

```js
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

export const registerListJournalsTool = (server) => {
  server.registerTool(
    "list_journals",
    {
      title: "List journals",
      description:
        "List the journals (kassekladder) of a company. Use the journalNumber with list_journal_draft_entries.",
      inputSchema: z.object({
        company: companySchema,
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, pageSize, page }) => {
      try {
        const query = buildListQuery({ pageSize, page });
        const data = await request("GET", `/journals?${query}`, undefined, { company });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
```

- [ ] **Step 4: Register the tools**

In `src/tools/index.js` add these imports after the `list-vat-zones` import:

```js
import { registerListAccountingYearsTool } from "./list-accounting-years.js";
import { registerListAccountsTool } from "./list-accounts.js";
import { registerListVatAccountsTool } from "./list-vat-accounts.js";
import { registerListJournalsTool } from "./list-journals.js";
```

and these calls after `registerListVatZonesTool(server);`:

```js
  registerListAccountingYearsTool(server);
  registerListAccountsTool(server);
  registerListVatAccountsTool(server);
  registerListJournalsTool(server);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:integration`
Expected: `# pass 31`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/tools/list-accounting-years.js src/tools/list-accounts.js src/tools/list-vat-accounts.js src/tools/list-journals.js src/tools/index.js test/integration/simple-lookups.test.js
git commit -m "Add accounting year, account, VAT account and journal lookups"
```

---

### Task 11: list_booked_entries with filters

**Files:**
- Create: `src/tools/list-booked-entries.js`
- Modify: `src/tools/index.js`
- Create: `test/unit/list-booked-entries.test.js`
- Create: `test/integration/list-booked-entries.test.js`

**Interfaces:**
- Consumes: Task 2 and Task 3 exports.
- Produces: `buildBookedEntriesFilter(options)` and `bookedEntriesPath(accountingYear)` from `src/tools/list-booked-entries.js`; tool `list_booked_entries`.

- [ ] **Step 1: Write the failing unit test**

Create `test/unit/list-booked-entries.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  bookedEntriesPath,
  buildBookedEntriesFilter,
} from "../../src/tools/list-booked-entries.js";

test("buildBookedEntriesFilter returns undefined without criteria", () => {
  assert.equal(buildBookedEntriesFilter({}), undefined);
});

test("buildBookedEntriesFilter combines dates, voucher, type, amount and parties", () => {
  const filter = buildBookedEntriesFilter({
    fromDate: "2025-01-01",
    toDate: "2025-03-31",
    voucherNumber: 600000,
    entryType: "customerInvoice",
    amount: -1234.5,
    customerNumber: 7,
    supplierNumber: 9,
  });

  assert.equal(
    filter,
    "date$gte:2025-01-01$and:date$lte:2025-03-31$and:voucherNumber$eq:600000$and:entryType$eq:customerInvoice$and:amount$eq:-1234.5$and:customer.customerNumber$eq:7$and:supplier.supplierNumber$eq:9"
  );
});

test("buildBookedEntriesFilter searches text as an escaped substring", () => {
  assert.equal(
    buildBookedEntriesFilter({ text: "Crane (2*)" }),
    "text$like:*Crane $(2$*$)*"
  );
});

test("bookedEntriesPath encodes split accounting years", () => {
  assert.equal(bookedEntriesPath("2022"), "/accounting-years/2022/entries");
  assert.equal(bookedEntriesPath("2025/2026"), "/accounting-years/2025%2F2026/entries");
});
```

- [ ] **Step 2: Write the failing integration test**

Create `test/integration/list-booked-entries.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import registerTools from "../../src/tools/index.js";
import {
  createCaptureServer,
  invokeTool,
  parseResult,
  useDemoCompany,
} from "../helpers/capture-server.js";

useDemoCompany();
const server = createCaptureServer();
registerTools(server);

test("list_booked_entries pages through an accounting year", async () => {
  const body = parseResult(
    await invokeTool(server, "list_booked_entries", { accountingYear: "2022", pageSize: 2 })
  );

  assert.equal(body.collection.length, 2);
  assert.ok(body.pagination.results > 2);
  assert.equal(typeof body.collection[0].voucherNumber, "number");
});

test("list_booked_entries filters by voucher number", async () => {
  const body = parseResult(
    await invokeTool(server, "list_booked_entries", {
      accountingYear: "2022",
      voucherNumber: 600000,
    })
  );

  assert.ok(body.collection.length > 0);
  for (const entry of body.collection) {
    assert.equal(entry.voucherNumber, 600000);
  }
});

test("list_booked_entries searches entry text", async () => {
  const body = parseResult(
    await invokeTool(server, "list_booked_entries", { accountingYear: "2022", text: "Crane" })
  );

  assert.ok(body.collection.length > 0);
  for (const entry of body.collection) {
    assert.match(entry.text, /Crane/);
  }
});

test("list_booked_entries applies a date range", async () => {
  const body = parseResult(
    await invokeTool(server, "list_booked_entries", {
      accountingYear: "2022",
      fromDate: "2022-01-01",
      toDate: "2022-01-31",
    })
  );

  assert.equal(body.collection.length, 0);
  assert.equal(body.pagination.results, 0);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit && npm run test:integration`
Expected: unit FAIL with `Cannot find module '.../src/tools/list-booked-entries.js'`; integration FAIL with `Tool not found: list_booked_entries`.

- [ ] **Step 4: Create the tool**

Create `src/tools/list-booked-entries.js`:

```js
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
```

- [ ] **Step 5: Register the tool**

In `src/tools/index.js` add after the `list-journals` import:

```js
import { registerListBookedEntriesTool } from "./list-booked-entries.js";
```

and after `registerListJournalsTool(server);`:

```js
  registerListBookedEntriesTool(server);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit && npm run test:integration`
Expected: unit `# pass 41`; integration `# pass 35`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/tools/list-booked-entries.js src/tools/index.js test/unit/list-booked-entries.test.js test/integration/list-booked-entries.test.js
git commit -m "Add list_booked_entries with date, voucher, text and party filters"
```

---

### Task 12: list_account_entries ported from the feature branch

**Files:**
- Create: `src/tools/list-account-entries.js`
- Modify: `src/tools/index.js`
- Create: `test/unit/list-account-entries.test.js`
- Create: `test/integration/list-account-entries.test.js`

**Interfaces:**
- Consumes: Task 2 and Task 3 exports; `EconomicApiError` from `src/economic/errors.js`.
- Produces: `buildEntriesFilter({ fromDate, toDate, amount })`, `findAccountingYear(collection, fromDate, toDate)`, `accountEntriesPath(accountNumber, year)`, `summarizeEntries(accountNumber, rawEntries)` from `src/tools/list-account-entries.js`; tool `list_account_entries`.

- [ ] **Step 1: Write the failing unit test**

Create `test/unit/list-account-entries.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  accountEntriesPath,
  buildEntriesFilter,
  findAccountingYear,
  registerListAccountEntriesTool,
  summarizeEntries,
} from "../../src/tools/list-account-entries.js";

test("buildEntriesFilter combines the date range", () => {
  assert.equal(
    buildEntriesFilter({ fromDate: "2025-05-01", toDate: "2026-04-30" }),
    "date$gte:2025-05-01$and:date$lte:2026-04-30"
  );
});

test("buildEntriesFilter appends amount match when provided", () => {
  assert.equal(
    buildEntriesFilter({ fromDate: "2025-05-01", toDate: "2025-05-31", amount: -1234.56 }),
    "date$gte:2025-05-01$and:date$lte:2025-05-31$and:amountInBaseCurrency$eq:-1234.56"
  );
});

test("buildEntriesFilter ignores a null amount", () => {
  assert.equal(
    buildEntriesFilter({ fromDate: "2025-05-01", toDate: "2025-05-31", amount: null }),
    "date$gte:2025-05-01$and:date$lte:2025-05-31"
  );
});

test("findAccountingYear returns the year covering the range", () => {
  const collection = [
    { year: "2024/2025", fromDate: "2024-05-01", toDate: "2025-04-30" },
    { year: "2025/2026", fromDate: "2025-05-01", toDate: "2026-04-30" },
  ];

  assert.equal(findAccountingYear(collection, "2025-06-01", "2025-06-30")?.year, "2025/2026");
});

test("findAccountingYear returns null when no year covers the range or it spans two years", () => {
  const collection = [
    { year: "2024/2025", fromDate: "2024-05-01", toDate: "2025-04-30" },
    { year: "2025/2026", fromDate: "2025-05-01", toDate: "2026-04-30" },
  ];

  assert.equal(findAccountingYear(collection, "2027-01-01", "2027-01-31"), null);
  assert.equal(findAccountingYear(collection, "2025-04-01", "2025-05-31"), null);
  assert.equal(findAccountingYear(undefined, "2025-04-01", "2025-05-31"), null);
});

test("accountEntriesPath builds the account-scoped path and encodes split years", () => {
  assert.equal(accountEntriesPath(5820, { year: "2022" }), "/accounts/5820/accounting-years/2022/entries");
  assert.equal(
    accountEntriesPath(5821, { year: "2025/2026" }),
    "/accounts/5821/accounting-years/2025%2F2026/entries"
  );
});

test("summarizeEntries maps fields and sums amounts", () => {
  const result = summarizeEntries(5821, [
    {
      date: "2025-06-01",
      text: "Bank transfer",
      amountInBaseCurrency: -100.5,
      amount: -100.5,
      voucherNumber: 101,
      entryNumber: 1,
      entryType: "financeVoucher",
      account: { accountNumber: 5821 },
    },
    {
      date: "2025-06-02",
      text: "Invoice payment",
      amountInBaseCurrency: 250.25,
      amount: 250.25,
      voucherNumber: 102,
      entryNumber: 2,
      entryType: "customerPayment",
      account: { accountNumber: 5821 },
    },
  ]);

  assert.equal(result.account, 5821);
  assert.equal(result.count, 2);
  assert.equal(result.sum, 149.75);
  assert.deepEqual(result.entries[0], {
    date: "2025-06-01",
    text: "Bank transfer",
    amount: -100.5,
    voucherNumber: 101,
    entryNumber: 1,
    entryType: "financeVoucher",
  });
});

test("summarizeEntries falls back to amount and handles an empty list", () => {
  const withFallback = summarizeEntries(5821, [
    { date: "2025-06-01", text: "Manual entry", amount: 42, voucherNumber: 103, entryNumber: 3, entryType: "financeVoucher" },
  ]);
  assert.equal(withFallback.sum, 42);
  assert.equal(withFallback.entries[0].amount, 42);

  assert.deepEqual(summarizeEntries(5821, []), { account: 5821, count: 0, sum: 0, entries: [] });
});

test("registerListAccountEntriesTool registers the tool with the server", () => {
  const tools = [];
  registerListAccountEntriesTool({
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  });

  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "list_account_entries");
  assert.equal(typeof tools[0].handler, "function");
});
```

- [ ] **Step 2: Write the failing integration test**

Create `test/integration/list-account-entries.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import registerTools from "../../src/tools/index.js";
import {
  captureErrorLogs,
  createCaptureServer,
  invokeTool,
  parseResult,
  useDemoCompany,
} from "../helpers/capture-server.js";

useDemoCompany();
const server = createCaptureServer();
registerTools(server);

test("list_account_entries sums the entries of one account for a date range", async () => {
  const body = parseResult(
    await invokeTool(server, "list_account_entries", {
      accountNumber: 1021,
      fromDate: "2022-01-01",
      toDate: "2022-12-31",
    })
  );

  assert.equal(body.account, 1021);
  assert.ok(body.count > 0);
  assert.equal(body.entries.length, body.count);
  assert.equal(typeof body.sum, "number");
  for (const entry of body.entries) {
    assert.match(entry.date, /^2022-/);
  }
});

test("list_account_entries reports a range outside any accounting year as an error result", async () => {
  const { value, lines } = await captureErrorLogs(() =>
    invokeTool(server, "list_account_entries", {
      accountNumber: 1021,
      fromDate: "1999-01-01",
      toDate: "1999-12-31",
    })
  );

  assert.equal(value.isError, true);
  assert.equal(parseResult(value).errorCode, "E_ACCOUNTING_YEAR_RANGE");
  assert.equal(lines.length, 1);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit && npm run test:integration`
Expected: unit FAIL with `Cannot find module '.../src/tools/list-account-entries.js'`; integration FAIL with `Tool not found: list_account_entries`.

- [ ] **Step 4: Create the tool**

Create `src/tools/list-account-entries.js`:

```js
import { z } from "zod";
import { request } from "../economic/api-client.js";
import { EconomicApiError } from "../economic/errors.js";
import {
  companySchema,
  dateRangeClauses,
  dateSchema,
  errorToContent,
  joinFilters,
  jsonContent,
} from "./tool-helpers.js";

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
export const buildEntriesFilter = ({ fromDate, toDate, amount }) =>
  joinFilters([
    ...dateRangeClauses(fromDate, toDate),
    amount !== null && amount !== undefined
      ? `amountInBaseCurrency$eq:${amount}`
      : undefined,
  ]);

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
        "List booked finance entries on one account for a date range, with an optional exact amount match. Useful for chasing a bank reconciliation difference down to individual entries. The range must lie within one accounting year.",
      inputSchema: z.object({
        company: companySchema,
        accountNumber: z
          .number()
          .int()
          .describe("Account number to list entries for, for example a bank account."),
        fromDate: dateSchema.describe("Inclusive start date (YYYY-MM-DD)."),
        toDate: dateSchema.describe("Inclusive end date (YYYY-MM-DD)."),
        amount: z
          .number()
          .nullable()
          .optional()
          .describe("Optional exact match on the entry amount in base currency."),
      }),
    },
    async ({ company, accountNumber, fromDate, toDate, amount }) => {
      try {
        const years = await request(
          "GET",
          `/accounting-years?pagesize=${ENTRIES_PAGE_SIZE}`,
          undefined,
          { company }
        );
        const year = findAccountingYear(years?.collection, fromDate, toDate);
        if (!year) {
          throw new EconomicApiError(
            `No accounting year covers ${fromDate}..${toDate}. Query one accounting year at a time.`,
            { status: 0, errorCode: "E_ACCOUNTING_YEAR_RANGE" }
          );
        }

        const filter = buildEntriesFilter({ fromDate, toDate, amount });
        const entriesPath = accountEntriesPath(accountNumber, year);

        const rawEntries = [];
        let page = 1;
        while (true) {
          const query = buildListQuery({ pageSize: ENTRIES_PAGE_SIZE, page, filter });
          const data = await request("GET", `${entriesPath}?${query}`, undefined, {
            company,
          });
          rawEntries.push(...(data?.collection ?? []));
          if (!data?.pagination?.nextPage) {
            break;
          }
          page += 1;
        }

        return jsonContent(summarizeEntries(accountNumber, rawEntries));
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
```

- [ ] **Step 5: Register the tool**

In `src/tools/index.js` add after the `list-booked-entries` import:

```js
import { registerListAccountEntriesTool } from "./list-account-entries.js";
```

and after `registerListBookedEntriesTool(server);`:

```js
  registerListAccountEntriesTool(server);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit && npm run test:integration`
Expected: unit `# pass 50`; integration `# pass 37`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/tools/list-account-entries.js src/tools/index.js test/unit/list-account-entries.test.js test/integration/list-account-entries.test.js
git commit -m "Add list_account_entries for per-account reconciliation"
```

---

### Task 13: list_account_totals and list_journal_draft_entries

**Files:**
- Create: `src/tools/list-account-totals.js`, `src/tools/list-journal-draft-entries.js`
- Modify: `src/tools/index.js` (final form shown)
- Create: `test/unit/list-account-totals.test.js`
- Create: `test/integration/journal-and-totals.test.js`

**Interfaces:**
- Consumes: Task 2 and Task 3 exports.
- Produces: `accountTotalsPath(accountingYear, periodNumber)` from `src/tools/list-account-totals.js`; tools `list_account_totals` and `list_journal_draft_entries`.

- [ ] **Step 1: Write the failing unit test**

Create `test/unit/list-account-totals.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { accountTotalsPath } from "../../src/tools/list-account-totals.js";

test("accountTotalsPath addresses the whole year by default", () => {
  assert.equal(accountTotalsPath("2022"), "/accounting-years/2022/totals");
});

test("accountTotalsPath addresses one period and encodes split years", () => {
  assert.equal(
    accountTotalsPath("2025/2026", 3),
    "/accounting-years/2025%2F2026/periods/3/totals"
  );
});
```

- [ ] **Step 2: Write the failing integration test**

Create `test/integration/journal-and-totals.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import registerTools from "../../src/tools/index.js";
import {
  createCaptureServer,
  invokeTool,
  parseResult,
  useDemoCompany,
} from "../helpers/capture-server.js";

useDemoCompany();
const server = createCaptureServer();
registerTools(server);

test("list_account_totals returns per-account totals for a year", async () => {
  const body = parseResult(
    await invokeTool(server, "list_account_totals", { accountingYear: "2022", pageSize: 3 })
  );

  assert.equal(body.collection.length, 3);
  const total = body.collection[0];
  assert.equal(typeof total.totalInBaseCurrency, "number");
  assert.equal(typeof total.account.accountNumber, "number");
  assert.equal(total.fromDate, "2022-01-01");
  assert.equal(total.toDate, "2022-12-31");
});

test("list_account_totals narrows to one period", async () => {
  const body = parseResult(
    await invokeTool(server, "list_account_totals", {
      accountingYear: "2022",
      periodNumber: 5,
      pageSize: 1,
    })
  );

  assert.equal(body.collection[0].fromDate, "2022-05-01");
  assert.equal(body.collection[0].toDate, "2022-05-31");
});

test("list_journal_draft_entries returns the unbooked entries of a journal", async () => {
  const body = parseResult(
    await invokeTool(server, "list_journal_draft_entries", { journalNumber: 1, pageSize: 5 })
  );

  assert.ok(Array.isArray(body.collection));
  assert.equal(typeof body.pagination.results, "number");
});

test("list_journal_draft_entries accepts a date range", async () => {
  const body = parseResult(
    await invokeTool(server, "list_journal_draft_entries", {
      journalNumber: 1,
      fromDate: "2022-01-01",
      toDate: "2022-12-31",
    })
  );

  assert.ok(Array.isArray(body.collection));
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit && npm run test:integration`
Expected: unit FAIL with `Cannot find module '.../src/tools/list-account-totals.js'`; integration FAIL with `Tool not found: list_account_totals`.

- [ ] **Step 4: Create the two tools**

Create `src/tools/list-account-totals.js`:

```js
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
        accountingYear: z
          .string()
          .min(4)
          .max(9)
          .describe("Accounting year identifier, for example 2025 or 2025/2026."),
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
```

Create `src/tools/list-journal-draft-entries.js`:

```js
import { z } from "zod";
import { request } from "../economic/api-client.js";
import {
  buildListQuery,
  companySchema,
  dateRangeClauses,
  dateSchema,
  errorToContent,
  joinFilters,
  jsonContent,
  pageSchema,
  pageSizeSchema,
} from "./tool-helpers.js";

export const registerListJournalDraftEntriesTool = (server) => {
  server.registerTool(
    "list_journal_draft_entries",
    {
      title: "List journal draft entries",
      description:
        "List the entries waiting unbooked in a journal (kassekladde), optionally within a date range. Get the journalNumber from list_journals.",
      inputSchema: z.object({
        company: companySchema,
        journalNumber: z.number().int().positive().describe("Journal number."),
        fromDate: dateSchema.optional().describe("Inclusive start date (YYYY-MM-DD)."),
        toDate: dateSchema.optional().describe("Inclusive end date (YYYY-MM-DD)."),
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, journalNumber, fromDate, toDate, pageSize, page }) => {
      try {
        const query = buildListQuery({
          pageSize,
          page,
          filter: joinFilters(dateRangeClauses(fromDate, toDate)),
        });
        const data = await request(
          "GET",
          `/journals/${journalNumber}/entries?${query}`,
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
```

- [ ] **Step 5: Bring index.js to its final form**

Replace `src/tools/index.js` with:

```js
import { registerHelloTool } from "./hello.js";
import { registerListCompaniesTool } from "./list-companies.js";
import { registerListCustomersTool } from "./list-customers.js";
import { registerCreateInvoiceDraftTool } from "./create-invoice-draft.js";
import { registerUpdateInvoiceDraftTool } from "./update-invoice-draft.js";
import { registerUpdateCustomerTool } from "./update-customer.js";
import { registerGetCustomerTool } from "./get-customer.js";
import { registerListProductsTool } from "./list-products.js";
import { registerUpsertProductTool } from "./upsert-product.js";
import { registerListInvoiceDraftsTool } from "./list-invoice-drafts.js";
import { registerGetInvoiceDraftTool } from "./get-invoice-draft.js";
import { registerBookInvoiceDraftTool } from "./book-invoice-draft.js";
import { registerListBookedInvoicesTool } from "./list-booked-invoices.js";
import { registerGetBookedInvoiceTool } from "./get-booked-invoice.js";
import { registerDownloadInvoicePdfTool } from "./download-invoice-pdf.js";
import { registerListPaymentTermsTool } from "./list-payment-terms.js";
import { registerListCustomerGroupsTool } from "./list-customer-groups.js";
import { registerListVatZonesTool } from "./list-vat-zones.js";
import { registerListAccountingYearsTool } from "./list-accounting-years.js";
import { registerListAccountsTool } from "./list-accounts.js";
import { registerListVatAccountsTool } from "./list-vat-accounts.js";
import { registerListJournalsTool } from "./list-journals.js";
import { registerListBookedEntriesTool } from "./list-booked-entries.js";
import { registerListAccountEntriesTool } from "./list-account-entries.js";
import { registerListAccountTotalsTool } from "./list-account-totals.js";
import { registerListJournalDraftEntriesTool } from "./list-journal-draft-entries.js";

const registerTools = (server) => {
  registerHelloTool(server);
  registerListCompaniesTool(server);
  registerListCustomersTool(server);
  registerGetCustomerTool(server);
  registerListProductsTool(server);
  registerUpsertProductTool(server);
  registerCreateInvoiceDraftTool(server);
  registerUpdateInvoiceDraftTool(server);
  registerUpdateCustomerTool(server);
  registerListInvoiceDraftsTool(server);
  registerGetInvoiceDraftTool(server);
  registerBookInvoiceDraftTool(server);
  registerListBookedInvoicesTool(server);
  registerGetBookedInvoiceTool(server);
  registerDownloadInvoicePdfTool(server);
  registerListPaymentTermsTool(server);
  registerListCustomerGroupsTool(server);
  registerListVatZonesTool(server);
  registerListAccountingYearsTool(server);
  registerListAccountsTool(server);
  registerListVatAccountsTool(server);
  registerListJournalsTool(server);
  registerListBookedEntriesTool(server);
  registerListAccountEntriesTool(server);
  registerListAccountTotalsTool(server);
  registerListJournalDraftEntriesTool(server);
};

export default registerTools;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit && npm run test:integration`
Expected: unit `# pass 52`; integration `# pass 41`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/tools/list-account-totals.js src/tools/list-journal-draft-entries.js src/tools/index.js test/unit/list-account-totals.test.js test/integration/journal-and-totals.test.js
git commit -m "Add account totals and journal draft entry lookups"
```

---
### Task 14: Server metadata, instructions, root-anchored .env and the e2e test

**Files:**
- Modify: `src/server.js` (whole file)
- Create: `test/e2e/server.test.js`

**Interfaces:**
- Consumes: `registerTools` from `src/tools/index.js` (26 tools after Task 13).
- Produces: a stdio server whose version equals `package.json` and whose instructions mention `list_companies`.

- [ ] **Step 1: Write the failing e2e test**

Create `test/e2e/server.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const EXPECTED_TOOL_COUNT = 26;
const ENTRY_POINTS = ["src/server.js", "dist/server.mjs"].filter((entryPoint) =>
  existsSync(new URL(`../../${entryPoint}`, import.meta.url))
);

/**
 * Spawns one server entry point with demo credentials and connects a client.
 *
 * Args:
 *   entryPoint (string): Path relative to the repository root.
 *
 * Returns:
 *   {client: Client, stderr: Function}: Connected client and a function that
 *   returns everything the server wrote to stderr so far.
 */
const connect = async (entryPoint) => {
  const stderrChunks = [];
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entryPoint],
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      ECONOMIC_APP_SECRET_TOKEN: "demo",
      ECONOMIC_GRANT_DEMO: "demo",
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => stderrChunks.push(String(chunk)));

  const client = new Client({ name: "e2e", version: "0.0.0" });
  await client.connect(transport);
  return { client, stderr: () => stderrChunks.join("") };
};

assert.ok(ENTRY_POINTS.includes("src/server.js"), "source entry point exists");

for (const entryPoint of ENTRY_POINTS) {
  test(`${entryPoint} serves the tool set over stdio`, async () => {
    const { client, stderr } = await connect(entryPoint);
    try {
      assert.match(client.getInstructions(), /list_companies/);

      const { tools } = await client.listTools();
      assert.equal(tools.length, EXPECTED_TOOL_COUNT);
      assert.ok(tools.some((tool) => tool.name === "list_booked_entries"));

      const hello = await client.callTool({ name: "hello", arguments: { name: "e2e" } });
      assert.equal(hello.content[0].text, "Hello, e2e!");

      const companies = await client.callTool({ name: "list_companies", arguments: {} });
      assert.notEqual(companies.isError, true);
      const body = JSON.parse(companies.content[0].text);
      assert.equal(body[0].company, "demo");
      assert.equal(body[0].companyName, "Demo Company");

      const customers = await client.callTool({
        name: "list_customers",
        arguments: { pageSize: 1 },
      });
      assert.equal(JSON.parse(customers.content[0].text).collection.length, 1);

      const missing = await client.callTool({
        name: "get_customer",
        arguments: { customerNumber: 999999999 },
      });
      assert.equal(missing.isError, true);

      const stderrLines = stderr().trim().split("\n");
      assert.equal(stderrLines.length, 1, "only the expected error log was written");
      assert.match(stderrLines[0], /"status":404/);
    } finally {
      await client.close();
    }
  });
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e`
Expected: FAIL on `client.getInstructions()` being undefined (the server sends no instructions yet).

- [ ] **Step 3: Rewrite the server entry point**

Replace `src/server.js` with:

```js
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "../package.json" with { type: "json" };
import registerTools from "./tools/index.js";

// Load a .env placed next to package.json, never one from the working
// directory, so the server behaves the same wherever a client starts it.
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

const SERVER_INSTRUCTIONS = [
  "This server can be connected to several e-conomic companies.",
  "Call list_companies first. When more than one company is configured, every other tool requires the company argument.",
  "Booking an invoice is irreversible; confirm with the user before calling book_invoice_draft.",
].join(" ");

const server = new McpServer(
  {
    name: "e-conomic-mcp-server",
    version: pkg.version,
  },
  { instructions: SERVER_INSTRUCTIONS }
);

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e`
Expected: `# pass 1`, `# fail 0`, and no stray output between the TAP lines.

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/e2e/server.test.js
git commit -m "Send server instructions and version and add the end-to-end test"
```

---

### Task 15: Live harness behind explicit flags

**Files:**
- Modify: `scripts/test-harness.js` (whole file)
- Create: `test/unit/test-harness.test.js`

**Interfaces:**
- Consumes: `registerTools`, `loadCompanies`.
- Produces: `parseHarnessArgs(argv)`, `resolvePlaceholders(input, context)`, `hasNullPlaceholder(input)`, `WRITE_TOOLS` from `scripts/test-harness.js`.

- [ ] **Step 1: Write the failing unit test**

Create `test/unit/test-harness.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  WRITE_TOOLS,
  hasNullPlaceholder,
  parseHarnessArgs,
  resolvePlaceholders,
} from "../../scripts/test-harness.js";

test("parseHarnessArgs defaults to read-only without a company", () => {
  assert.deepEqual(parseHarnessArgs([]), { company: undefined, allowWrites: false, demo: false });
});

test("parseHarnessArgs reads --company, --allow-writes and --demo", () => {
  assert.deepEqual(parseHarnessArgs(["--company", "acme", "--allow-writes", "--demo"]), {
    company: "acme",
    allowWrites: true,
    demo: true,
  });
});

test("WRITE_TOOLS names every tool that changes data", () => {
  assert.deepEqual(
    [...WRITE_TOOLS].sort(),
    [
      "book_invoice_draft",
      "create_invoice_draft",
      "update_customer",
      "update_invoice_draft",
      "upsert_product",
    ]
  );
});

test("resolvePlaceholders swaps draft and booked placeholders anywhere in the input", () => {
  const context = { lastDraftNumber: 12, lastBookedInvoiceNumber: 34 };

  assert.deepEqual(
    resolvePlaceholders({ a: "$lastDraft", b: ["$lastBooked", "keep"], c: 1 }, context),
    { a: 12, b: [34, "keep"], c: 1 }
  );
});

test("hasNullPlaceholder finds unresolved placeholders", () => {
  assert.equal(hasNullPlaceholder({ a: { b: [null] } }), true);
  assert.equal(hasNullPlaceholder({ a: 1, b: ["x"] }), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL with `does not provide an export named 'WRITE_TOOLS'` (importing the current harness also runs it; the rewrite guards `main`).

- [ ] **Step 3: Rewrite the harness**

Replace `scripts/test-harness.js` with:

```js
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import registerTools from "../src/tools/index.js";
import { loadCompanies } from "../src/economic/companies.js";

dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

/**
 * Tools that create or change data in an agreement. They run only with
 * `--allow-writes`.
 */
export const WRITE_TOOLS = new Set([
  "upsert_product",
  "create_invoice_draft",
  "update_invoice_draft",
  "book_invoice_draft",
  "update_customer",
]);

/**
 * Parses the harness command line.
 *
 * Args:
 *   argv (string[]): Arguments after the script name.
 *
 * Returns:
 *   {company: string|undefined, allowWrites: boolean, demo: boolean}
 */
export const parseHarnessArgs = (argv) => {
  const companyIndex = argv.indexOf("--company");
  return {
    company: companyIndex >= 0 ? argv[companyIndex + 1] : undefined,
    allowWrites: argv.includes("--allow-writes"),
    demo: argv.includes("--demo"),
  };
};

/**
 * Builds a stand-in server that records tools for direct invocation.
 *
 * Returns:
 *   {tools: Array, registerTool: Function}
 */
const createHarnessServer = () => {
  const tools = [];
  return {
    tools,
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  };
};

/**
 * Invokes a captured tool after validating the input with its schema.
 *
 * Args:
 *   server (object): Output of `createHarnessServer`.
 *   name (string): Tool name.
 *   input (object): Tool arguments.
 *
 * Returns:
 *   object: The tool result.
 */
const invokeTool = async (server, name, input) => {
  const tool = server.tools.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  return tool.handler(tool.config.inputSchema.parse(input));
};

/**
 * Replaces `$lastDraft` and `$lastBooked` with numbers captured from earlier
 * tool results.
 *
 * Args:
 *   input (any): Sample input, searched recursively.
 *   context (object): `lastDraftNumber` and `lastBookedInvoiceNumber`.
 *
 * Returns:
 *   any: The input with placeholders replaced (null when not yet captured).
 */
export const resolvePlaceholders = (input, context) => {
  if (input === "$lastDraft") {
    return context.lastDraftNumber;
  }

  if (input === "$lastBooked") {
    return context.lastBookedInvoiceNumber;
  }

  if (Array.isArray(input)) {
    return input.map((value) => resolvePlaceholders(value, context));
  }

  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        resolvePlaceholders(value, context),
      ])
    );
  }

  return input;
};

/**
 * Records draft and booked invoice numbers from a tool result.
 *
 * Args:
 *   output (object): Tool result.
 *   context (object): Mutable placeholder context.
 */
const captureIdentifiers = (output, context) => {
  const text = output?.content?.[0]?.text;
  if (!text) {
    return;
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed?.draftInvoiceNumber) {
      context.lastDraftNumber = parsed.draftInvoiceNumber;
    }
    if (parsed?.bookedInvoiceNumber) {
      context.lastBookedInvoiceNumber = parsed.bookedInvoiceNumber;
    }
  } catch (error) {
    // Ignore non-JSON tool output.
  }
};

/**
 * Tells whether an input still contains an unresolved placeholder.
 *
 * Args:
 *   input (any): Resolved sample input.
 *
 * Returns:
 *   boolean: True when a null is found anywhere.
 */
export const hasNullPlaceholder = (input) => {
  if (input === null) {
    return true;
  }
  if (Array.isArray(input)) {
    return input.some(hasNullPlaceholder);
  }
  if (input && typeof input === "object") {
    return Object.values(input).some(hasNullPlaceholder);
  }
  return false;
};

/**
 * Builds the sample calls, one per tool, for a company.
 *
 * Args:
 *   company (string|undefined): Company key passed to every tool.
 *   today (string): Date used for the sample invoice, `YYYY-MM-DD`.
 *
 * Returns:
 *   Array<{name: string, input: object}>
 */
const buildSamples = (company, today) => [
  { name: "hello", input: { name: "Harness" } },
  { name: "list_companies", input: {} },
  { name: "list_customers", input: { company, pageSize: 1, page: 1 } },
  { name: "get_customer", input: { company, customerNumber: 90001 } },
  { name: "list_products", input: { company, pageSize: 5, page: 1 } },
  {
    name: "upsert_product",
    input: {
      company,
      productNumber: "CONSULTING",
      name: "Consulting Services",
      salesPrice: 1000,
      productGroupNumber: 3,
    },
  },
  {
    name: "create_invoice_draft",
    input: {
      company,
      customerNumber: 90001,
      createCustomerIfMissing: true,
      newCustomer: {
        name: "Sandbox Test Customer",
        currency: "DKK",
        paymentTermsNumber: 1,
        customerGroupNumber: 1,
        vatZoneNumber: 1,
        email: "sandbox-test@example.com",
        city: "Copenhagen",
        country: "Denmark",
      },
      currency: "DKK",
      date: today,
      lines: [
        {
          description: "Test service",
          quantity: 1,
          unitPrice: 100,
          productNumber: "CONSULTING",
        },
      ],
    },
  },
  { name: "list_invoice_drafts", input: { company, pageSize: 5, page: 1 } },
  { name: "get_invoice_draft", input: { company, draftInvoiceNumber: "$lastDraft" } },
  {
    name: "update_invoice_draft",
    input: {
      company,
      draftInvoiceNumber: "$lastDraft",
      date: today,
      lines: [
        {
          description: "Test service (updated)",
          quantity: 2,
          unitPrice: 120,
          productNumber: "CONSULTING",
        },
      ],
    },
  },
  { name: "book_invoice_draft", input: { company, draftInvoiceNumber: "$lastDraft" } },
  { name: "list_booked_invoices", input: { company, pageSize: 5, page: 1 } },
  { name: "get_booked_invoice", input: { company, bookedInvoiceNumber: "$lastBooked" } },
  { name: "download_invoice_pdf", input: { company, bookedInvoiceNumber: "$lastBooked" } },
  {
    name: "update_customer",
    input: {
      company,
      customerNumber: 90001,
      name: "Sandbox Test Customer Updated",
      email: "billing@example.com",
    },
  },
  { name: "list_payment_terms", input: { company, pageSize: 5, page: 1 } },
  { name: "list_customer_groups", input: { company, pageSize: 5, page: 1 } },
  { name: "list_vat_zones", input: { company, pageSize: 5, page: 1 } },
  { name: "list_accounting_years", input: { company, pageSize: 5 } },
  { name: "list_accounts", input: { company, pageSize: 5 } },
  { name: "list_vat_accounts", input: { company, pageSize: 5 } },
  { name: "list_journals", input: { company, pageSize: 5 } },
  { name: "list_booked_entries", input: { company, accountingYear: today.slice(0, 4), pageSize: 5 } },
  {
    name: "list_account_entries",
    input: { company, accountNumber: 1000, fromDate: `${today.slice(0, 4)}-01-01`, toDate: today },
  },
  { name: "list_account_totals", input: { company, accountingYear: today.slice(0, 4), pageSize: 5 } },
  { name: "list_journal_draft_entries", input: { company, journalNumber: 1, pageSize: 5 } },
];

/**
 * Runs every sample against the configured company and prints the results.
 */
const main = async () => {
  const { company, allowWrites, demo } = parseHarnessArgs(process.argv.slice(2));

  if (demo) {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("ECONOMIC_GRANT_")) {
        delete process.env[key];
      }
    }
    delete process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN;
    process.env.ECONOMIC_APP_SECRET_TOKEN = "demo";
    process.env.ECONOMIC_GRANT_DEMO = "demo";
  }

  const server = createHarnessServer();
  registerTools(server);

  const tokenSuffix = (value) =>
    value ? `${value.slice(-4)} (len ${value.length})` : "missing";

  console.log("Token check:");
  console.log(`- AppSecretToken: ${tokenSuffix(process.env.ECONOMIC_APP_SECRET_TOKEN?.trim())}`);
  for (const [name, token] of loadCompanies(process.env)) {
    console.log(`- Company ${name}: grant token ${tokenSuffix(token)}`);
  }
  console.log(
    allowWrites
      ? "Writes ENABLED: this run creates and books data in the selected company."
      : "Writes disabled: write tools are skipped (pass --allow-writes to run them)."
  );

  const context = { lastDraftNumber: null, lastBookedInvoiceNumber: null };
  const today = new Date().toISOString().slice(0, 10);

  for (const sample of buildSamples(company, today)) {
    console.log(`\n=== Tool: ${sample.name} ===`);

    if (WRITE_TOOLS.has(sample.name) && !allowWrites) {
      console.log("Input: skipped (write tool; pass --allow-writes)");
      continue;
    }

    const resolvedInput = resolvePlaceholders(sample.input, context);
    if (hasNullPlaceholder(resolvedInput)) {
      console.log("Input: skipped (missing dependency)");
      continue;
    }
    console.log("Input:", JSON.stringify(resolvedInput, null, 2));

    try {
      const output = await invokeTool(server, sample.name, resolvedInput);
      captureIdentifiers(output, context);
      console.log("Output:", JSON.stringify(output, null, 2));
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
    }
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("Harness failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the tests and a demo harness run**

Run: `npm run test:unit`
Expected: `# pass 57`, `# fail 0`.

Run: `npm run harness -- --demo 2>&1 | grep -E "^(=== Tool|Input: skipped|Writes)"`
Expected: `Writes disabled...`, every tool listed, the five write tools showing `Input: skipped (write tool; pass --allow-writes)`, and the three dependent reads showing `Input: skipped (missing dependency)`.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-harness.js test/unit/test-harness.test.js
git commit -m "Gate live harness writes behind --allow-writes and target one company"
```

---

### Task 16: Plugin packaging: bundle, manifests, metadata

**Files:**
- Create: `scripts/build.js`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`, `dist/server.mjs` (generated), `test/unit/plugin-manifest.test.js`
- Modify: `package.json`, `package-lock.json`, `.gitignore`

**Interfaces:**
- Consumes: `src/server.js` from Task 14.
- Produces: `dist/server.mjs`, runnable with `node dist/server.mjs`; plugin `e-conomic` in marketplace `sdnielsen`.

- [ ] **Step 1: Write the failing unit test**

Create `test/unit/plugin-manifest.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) =>
  JSON.parse(readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8"));

test("plugin.json and package.json share name-independent version and license metadata", () => {
  const pkg = read("package.json");
  const plugin = read(".claude-plugin/plugin.json");

  assert.equal(plugin.version, pkg.version);
  assert.equal(plugin.name, "e-conomic");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.engines.node, ">=20");
  assert.ok(pkg.description.length > 0);
});

test("marketplace.json exposes the repository root as the plugin", () => {
  const marketplace = read(".claude-plugin/marketplace.json");

  assert.equal(marketplace.name, "sdnielsen");
  assert.equal(marketplace.owner.name, "SDNielsen ApS");
  assert.deepEqual(
    marketplace.plugins.map((plugin) => [plugin.name, plugin.source]),
    [["e-conomic", "./"]]
  );
  assert.equal("version" in marketplace.plugins[0], false);
});

test(".mcp.json starts the bundle from the plugin root without any secrets", () => {
  const mcp = read(".mcp.json");
  const server = mcp.mcpServers["e-conomic"];

  assert.equal(server.type, "stdio");
  assert.equal(server.command, "node");
  assert.deepEqual(server.args, ["${CLAUDE_PLUGIN_ROOT:-.}/dist/server.mjs"]);
  assert.equal(server.env, undefined);
  assert.equal(JSON.stringify(mcp).includes("TOKEN"), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL with `ENOENT ... .claude-plugin/plugin.json`.

- [ ] **Step 3: Confirm the licence file and install esbuild**

Run: `head -3 LICENSE`
Expected: the first lines name the MIT License. If they do not, stop and report; do not change the licence.

Run: `npm install --save-dev esbuild@^0.25.0`
Expected: `package.json` gains `devDependencies.esbuild` and `package-lock.json` updates.

- [ ] **Step 4: Create the build script**

Create `scripts/build.js`:

```js
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Bundles the server and its dependencies into one ESM file so the plugin
 * runs without `npm install` on the user's machine.
 *
 * The banner recreates `require` because esbuild leaves Node built-ins as
 * `require` calls when it converts CommonJS dependencies into an ESM bundle.
 */
await build({
  absWorkingDir: root,
  entryPoints: ["src/server.js"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/server.mjs",
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "warning",
});
```

- [ ] **Step 5: Write the manifests and metadata**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "e-conomic",
  "version": "1.1.0",
  "description": "Tools for the e-conomic bookkeeping API: customers, products, invoices and read-only ledger lookups across several companies.",
  "author": {
    "name": "SDNielsen ApS"
  }
}
```

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "sdnielsen",
  "owner": {
    "name": "SDNielsen ApS"
  },
  "plugins": [
    {
      "name": "e-conomic",
      "source": "./",
      "description": "MCP server for the e-conomic bookkeeping API with support for several companies."
    }
  ]
}
```

Create `.mcp.json`:

```json
{
  "mcpServers": {
    "e-conomic": {
      "type": "stdio",
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT:-.}/dist/server.mjs"]
    }
  }
}
```

Replace `package.json` with (keep the exact dependency versions `npm install` wrote for `esbuild`):

```json
{
  "name": "e-conomic-mcp-server",
  "version": "1.1.0",
  "description": "MCP server for the e-conomic bookkeeping API with support for several companies",
  "main": "src/server.js",
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "start": "node src/server.js",
    "build": "node scripts/build.js",
    "test": "npm run build && npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "node --test \"test/unit/*.test.js\"",
    "test:integration": "node --test \"test/integration/*.test.js\"",
    "test:e2e": "node --test \"test/e2e/*.test.js\"",
    "harness": "node scripts/test-harness.js"
  },
  "keywords": ["mcp", "e-conomic", "bookkeeping", "claude-code-plugin"],
  "author": "SDNielsen ApS",
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "esbuild": "^0.25.0"
  }
}
```

Append to `.gitignore`:

```
.serena/
```

- [ ] **Step 6: Build and run the whole suite**

Run: `npm test`
Expected: the build writes `dist/server.mjs`; unit `# pass 60`; integration `# pass 41`; e2e `# pass 2` (both `src/server.js` and `dist/server.mjs`), `# fail 0`.

Run: `node dist/server.mjs < /dev/null`
Expected: exits without output once stdin closes.

- [ ] **Step 7: Commit, including the bundle**

```bash
git add scripts/build.js .claude-plugin/plugin.json .claude-plugin/marketplace.json .mcp.json package.json package-lock.json .gitignore dist/server.mjs test/unit/plugin-manifest.test.js
git commit -m "Package the server as a Claude Code plugin with a committed bundle"
```

---
### Task 17: Documentation

**Files:**
- Modify: `README.md` (whole file), `CLAUDE.md` (sections named below), `docs/creating-auth-tokens.md` (append a section), `docs/test-harness.md` (whole file)

**Interfaces:**
- Consumes: everything above. No code changes.

- [ ] **Step 1: Rewrite README.md**

Replace `README.md` with:

````markdown
# e-conomic-mcp-server

Perfect for anyone who, like me, is more geek than bookkeeper. Finally there is a bit of fun in bookkeeping. Who would have thought.

An MCP server for the e-conomic REST API. One running server can serve several e-conomic companies; every tool takes a `company` argument that picks the company.

## Install as a Claude Code plugin

The repository is its own plugin marketplace.

```bash
/plugin marketplace add sdnielsen/e-conomic-mcp-server
/plugin install e-conomic@sdnielsen
```

The plugin starts the committed bundle `dist/server.mjs`; no `npm install` is needed on the user's machine. Use an SSH remote for the private repository so background updates can authenticate.

## Tokens

You need one **App Secret Token** from your e-conomic developer agreement and one **Agreement Grant Token** per company. See [docs/creating-auth-tokens.md](docs/creating-auth-tokens.md) for the click path.

Put them in the `env` block of your Claude Code user settings (`~/.claude/settings.json`). Claude Code passes them to the server. Never put tokens in this repository.

```json
{
  "env": {
    "ECONOMIC_APP_SECRET_TOKEN": "...",
    "ECONOMIC_GRANT_ACME": "...",
    "ECONOMIC_GRANT_BETA": "..."
  }
}
```

| Variable | Meaning |
| --- | --- |
| `ECONOMIC_APP_SECRET_TOKEN` | Required. Shared by all companies. |
| `ECONOMIC_GRANT_<NAME>` | One per company. `ECONOMIC_GRANT_ACME` becomes company `acme`. |
| `ECONOMIC_AGREEMENT_GRANT_TOKEN` | Optional, older single-company form. Becomes company `default`. |
| `ECONOMIC_BASE_URL` | Optional. Must be `https://restapi.e-conomic.com`. |
| `ECONOMIC_DEBUG` | Optional. `true` logs each request to stderr as JSON. |

With one company configured, `company` may be omitted. With several, every tool requires it and refuses to guess. Call `list_companies` to see the configured keys and the company each token belongs to.

## Tools

- Companies: `list_companies`
- Customers: `list_customers`, `get_customer`, `update_customer`
- Products: `list_products`, `upsert_product`
- Draft invoices: `list_invoice_drafts`, `get_invoice_draft`, `create_invoice_draft`, `update_invoice_draft`, `book_invoice_draft`
- Booked invoices: `list_booked_invoices`, `get_booked_invoice`, `download_invoice_pdf`
- Reference data: `list_payment_terms`, `list_customer_groups`, `list_vat_zones`, `list_vat_accounts`, `list_accounts`, `list_accounting_years`, `list_journals`
- Ledger lookups (read-only): `list_booked_entries`, `list_account_entries`, `list_account_totals`, `list_journal_draft_entries`
- Connectivity: `hello`

Every tool except `hello` and `list_companies` accepts `company`. Tools that change data (`upsert_product`, `create_invoice_draft`, `update_invoice_draft`, `book_invoice_draft`, `update_customer`) echo the company they acted on. Booking is irreversible.

### Tool reference

| Tool | Purpose | Arguments (besides `company`) |
| --- | --- | --- |
| `list_companies` | Show configured companies with agreement number and name. | none |
| `list_customers` | Page through customers. | `pageSize`, `page` |
| `get_customer` | One customer. | `customerNumber` |
| `update_customer` | Change customer fields; unspecified fields keep their values. | `customerNumber`, optional `name`, `currency`, `paymentTermsNumber`, `customerGroupNumber`, `vatZoneNumber`, `address`, `zip`, `city`, `country`, `email`, `telephoneAndFaxNumber`, `ean`, `corporateIdentificationNumber`, `website` |
| `list_products` | Page through products. | `pageSize`, `page` |
| `upsert_product` | Create or update a product. `productGroupNumber` is required on create. | `productNumber`, `name`, optional `salesPrice`, `costPrice`, `barCode`, `unitNumber`, `productGroupNumber`, `departmentNumber` |
| `list_invoice_drafts` | Page through drafts. | `pageSize`, `page` |
| `get_invoice_draft` | One draft. | `draftInvoiceNumber` |
| `create_invoice_draft` | Create a draft. Every line needs an existing `productNumber`. | `customerNumber`, `currency`, `date`, `lines[]`, optional `createCustomerIfMissing`, `newCustomer`, `layoutNumber`, `paymentTermsNumber`, `recipientName`, `recipientVatZoneNumber`, `dueDate` |
| `update_invoice_draft` | Change a draft; unspecified fields keep their values, `lines` replaces all lines. | `draftInvoiceNumber`, optional `date`, `dueDate`, `currency`, `paymentTermsNumber`, `layoutNumber`, `recipientName`, `recipientVatZoneNumber`, `lines[]` |
| `book_invoice_draft` | Book a draft. Irreversible. | `draftInvoiceNumber`, optional `bookWithNumber` |
| `list_booked_invoices` | Page through booked invoices. | `pageSize`, `page` |
| `get_booked_invoice` | One booked invoice. | `bookedInvoiceNumber` |
| `download_invoice_pdf` | PDF of a booked invoice as base64. | `bookedInvoiceNumber` |
| `list_payment_terms`, `list_customer_groups`, `list_vat_zones`, `list_vat_accounts`, `list_journals`, `list_accounting_years` | Reference collections. | `pageSize`, `page` |
| `list_accounts` | Chart of accounts. | optional `accountType`, `pageSize`, `page` |
| `list_booked_entries` | Booked entries of one accounting year with filters. | `accountingYear`, optional `fromDate`, `toDate`, `voucherNumber`, `text`, `entryType`, `amount`, `customerNumber`, `supplierNumber`, `pageSize`, `page` |
| `list_account_entries` | Entries of one account in a date range, summed. | `accountNumber`, `fromDate`, `toDate`, optional `amount` |
| `list_account_totals` | Total per account for a year or one period. | `accountingYear`, optional `periodNumber`, `pageSize`, `page` |
| `list_journal_draft_entries` | Unbooked entries in a journal. | `journalNumber`, optional `fromDate`, `toDate`, `pageSize`, `page` |

Errors come back as tool results with `isError: true` and a JSON body `{ error, status, errorCode }`. Local codes: `E_NO_CREDENTIALS`, `E_COMPANY_REQUIRED`, `E_UNKNOWN_COMPANY`, `E_TIMEOUT`, `E_NETWORK`, `E_ACCOUNTING_YEAR_RANGE`.

## Development

```bash
npm install
npm test          # build the bundle, then unit, integration and e2e tests
npm run test:unit
npm start         # run from source over stdio
```

Tests never write to an agreement. Integration and e2e tests use e-conomic's public demo tokens (`demo`/`demo`), which allow only reads; the one write they attempt is expected to fail with 403.

For local development the server also reads a `.env` next to `package.json` (never committed).

### Live harness

`npm run harness -- --company <key>` calls every read tool against a real company. Add `--allow-writes` to also create a customer, a product and a draft invoice and book it. Use `--demo` to run against the demo agreement. See [docs/test-harness.md](docs/test-harness.md).

### Releasing

1. Bump `version` in both `package.json` and `.claude-plugin/plugin.json` (a unit test keeps them equal).
2. Run `npm test`, which rebuilds `dist/server.mjs`.
3. Commit the bundle with the change. Installed plugins pick up the new version on `/plugin marketplace update`.

## Other MCP clients

Any client that can start a stdio server can run `node /path/to/e-conomic-mcp-server/dist/server.mjs` with the environment variables above.

## License

MIT License. See `LICENSE` for details.
````

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md` make these replacements.

Replace the "Required Environment Variables" section with:

```markdown
## Required Environment Variables

- `ECONOMIC_APP_SECRET_TOKEN` (required, shared by all companies)
- `ECONOMIC_GRANT_<NAME>` (one per company; `<NAME>` in upper case becomes the lower-case company key)
- `ECONOMIC_AGREEMENT_GRANT_TOKEN` (optional single-company form, exposed as company `default`)
- `ECONOMIC_BASE_URL` (optional, must match `https://restapi.e-conomic.com`)
- `ECONOMIC_DEBUG` (optional, set to `true` to emit JSON debug logs to stderr)

Every tool except `hello` and `list_companies` takes an optional `company` argument. With one company configured it may be omitted; with several it is required and an omitted or unknown value is an error (`E_COMPANY_REQUIRED`, `E_UNKNOWN_COMPANY`).

For local development, credentials can be stored in a `.env` file next to `package.json`. The server never reads a `.env` from the working directory.
```

Replace the "Run tests" subsection with:

```markdown
### Run tests
```bash
npm test               # build + unit + integration + e2e
npm run test:unit      # pure functions, no network
npm run test:integration   # real demo API, read-only
npm run test:e2e       # spawns src/server.js and dist/server.mjs over stdio
```

Tests use the demo tokens set by `test/helpers/capture-server.js` and never write to an agreement. Tests that expect an error log capture `console.error` with `captureErrorLogs` so output stays pristine.

### Live harness
```bash
npm run harness -- --company <key> [--allow-writes] [--demo]
```

`scripts/test-harness.js` calls every tool with sample data. Write tools run only with `--allow-writes`. Placeholders `$lastDraft` and `$lastBooked` chain dependent calls.

### Build the plugin bundle
```bash
npm run build
```

Writes `dist/server.mjs` (esbuild). The bundle is committed and is what the plugin runs.
```

Replace the "API Client Layer" section with:

```markdown
### API Client Layer
- `src/economic/errors.js` - `EconomicApiError` with `status`, `errorCode`, `details`, `hint`
- `src/economic/companies.js` - `loadCompanies(env)` and `resolveCompany(env, company)` read `ECONOMIC_GRANT_<NAME>` variables
- `src/economic/api-client.js` - All HTTP communication with e-conomic
  - `request(method, path, body, { company })` - JSON request for one company
  - `requestBinary(method, path, { company })` - returns `{ buffer, contentType }`
  - `resolveCompanyName(company)` - the key a call would target, for echoing in results
  - `validateCredentials()` - checks the app secret token
  - Network failures become `E_NETWORK`, timeouts `E_TIMEOUT`

All tools use `request()` / `requestBinary()` and pass `{ company }` through.
```

Replace the "Error Handling" section with:

```markdown
### Error Handling
Tools catch `EconomicApiError` and return `errorToContent(error)` from `src/tools/tool-helpers.js`, which logs details to stderr and returns `{ isError: true, content: [...] }` with `error`, `status` and `errorCode`. Successful results use `jsonContent(data)`.
```

Replace the "Tool Categories" section with:

```markdown
### Tool Categories
- **Connectivity**: `hello`
- **Companies**: `list_companies`
- **Customers**: `list_customers`, `get_customer`, `update_customer`
- **Products**: `list_products`, `upsert_product`
- **Draft invoices**: `list_invoice_drafts`, `get_invoice_draft`, `create_invoice_draft`, `update_invoice_draft`, `book_invoice_draft`
- **Booked invoices**: `list_booked_invoices`, `get_booked_invoice`, `download_invoice_pdf`
- **Reference data**: `list_payment_terms`, `list_customer_groups`, `list_vat_zones`, `list_vat_accounts`, `list_accounts`, `list_accounting_years`, `list_journals`
- **Ledger lookups (read-only)**: `list_booked_entries`, `list_account_entries`, `list_account_totals`, `list_journal_draft_entries`

Journal write tools (creating vouchers, attaching PDFs, booking journals, customer payments) are intentionally absent; they need verification against a trial agreement first.
```

Replace the "Special Tool Behaviors" section with:

```markdown
### Special Tool Behaviors

**create_invoice_draft**:
- If `createCustomerIfMissing=true` and the customer doesn't exist, creates the customer first
- Every line requires `productNumber`; there is no default product
- Fetches the invoice template from e-conomic if layout, payment terms, recipient name or recipient VAT zone are missing

**update_invoice_draft** and **update_customer**:
- Fetch the current object, copy every writable field (`DRAFT_WRITABLE_FIELDS`, `CUSTOMER_WRITABLE_FIELDS`), apply the input, then PUT. Fields not mentioned keep their values.

**upsert_product**:
- `productGroupNumber` is required when creating a new product
- Updates the existing product if `productNumber` already exists

**Write tools** echo the resolved company key under `company` in their result.
```

Replace the code sample in "Adding New Tools" with:

```javascript
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

export const registerMyNewTool = (server) => {
  server.registerTool(
    "my_new_tool",
    {
      title: "My New Tool",
      description: "What this tool does",
      inputSchema: z.object({
        company: companySchema,
        pageSize: pageSizeSchema,
        page: pageSchema,
      }),
    },
    async ({ company, pageSize, page }) => {
      try {
        const query = buildListQuery({ pageSize, page });
        const data = await request("GET", `/some/endpoint?${query}`, undefined, { company });
        return jsonContent(data);
      } catch (error) {
        return errorToContent(error);
      }
    }
  );
};
```

and replace step 3 of that list with:

```markdown
3. Add a unit test for any pure helper under `test/unit/`, an integration test against the demo API under `test/integration/`, and raise `EXPECTED_TOOL_COUNT` in `test/e2e/server.test.js`. Add a sample to `scripts/test-harness.js`.
```

- [ ] **Step 3: Extend docs/creating-auth-tokens.md**

Replace the "Environment setup" section with:

```markdown
## Environment setup

Each company (agreement) gets its own grant token. Name the variable after the company:

```
ECONOMIC_APP_SECRET_TOKEN=...
ECONOMIC_GRANT_ACME=...
ECONOMIC_GRANT_BETA=...
```

`ECONOMIC_GRANT_ACME` is the company `acme` in tool calls. Repeat the grant flow below once per company; the App Secret Token stays the same.

For Claude Code, put these in the `env` block of `~/.claude/settings.json`. For local development, a `.env` next to `package.json` works too (never commit it).

## Several companies

1. In the developer agreement, copy the app's Installation URL once.
2. Log into e-conomic as an administrator of the first company. If the login shows several agreements, click **Administer** on the right one first.
3. Open the Installation URL and approve. Copy the Agreement Grant Token into `ECONOMIC_GRANT_<NAME>` for that company.
4. Repeat for every company.
5. Run `list_companies` in Claude Code. Each entry shows the agreement number and company name the token belongs to, which catches mixed-up tokens immediately.

The grant token belongs to the agreement and the app, not to a person. Two people using the same company share the same token. e-conomic records API changes against the app, not the individual user.
```

- [ ] **Step 4: Rewrite docs/test-harness.md**

Replace `docs/test-harness.md` with:

````markdown
# Live harness

`scripts/test-harness.js` exercises every tool against a real company without an MCP client. It is a manual tool, not part of `npm test`.

## Run it

```bash
npm run harness -- --company acme
```

By default only read tools run. Write tools (`upsert_product`, `create_invoice_draft`, `update_invoice_draft`, `book_invoice_draft`, `update_customer`) are skipped and say so.

```bash
npm run harness -- --company acme --allow-writes
```

With `--allow-writes` the harness creates customer 90001, product `CONSULTING`, a draft invoice dated today, updates it, books it and downloads the PDF. Booking is irreversible; run this only against a trial or sandbox agreement.

```bash
npm run harness -- --demo
```

`--demo` replaces all configured companies with e-conomic's public demo agreement. Writes fail there with 403 `E02002`.

## Credentials

The harness reads the same variables as the server: `ECONOMIC_APP_SECRET_TOKEN` and one `ECONOMIC_GRANT_<NAME>` per company, from the environment or from `.env` next to `package.json`. `--company` selects the key; it may be omitted when only one company is configured.

## Notes

- Placeholders `$lastDraft` and `$lastBooked` are filled from earlier results; dependent calls are skipped when nothing was captured.
- Output is the raw tool result per tool, so `download_invoice_pdf` prints a large base64 string.
````

- [ ] **Step 5: Check the docs against the code**

Run: `grep -c "list_" README.md` and compare the tool table with `src/tools/index.js`: every registered tool must appear once in the table, and no tool in the table may be missing from `index.js`.
Expected: 25 tool names in both places (all except `hello`).

- [ ] **Step 6: Commit**

```bash
git add README.md CLAUDE.md docs/creating-auth-tokens.md docs/test-harness.md
git commit -m "Document plugin installation, company tokens and the test layers"
```

---

## Self-review notes

- Spec coverage: configuration (Task 1, 2), tool contract and fixes (Tasks 3-8), `list_companies` (Task 9), lookups (Tasks 10-13), server instructions and `.env` (Task 14), harness (Task 15), packaging and metadata (Task 16), docs (Task 17). Non-goals are untouched.
- Names used across tasks: `request(method, path, body, { company })`, `requestBinary`, `resolveCompanyName`, `companySchema`, `pageSizeSchema`, `pageSchema`, `dateSchema`, `jsonContent`, `errorToContent`, `buildListQuery`, `escapeFilterValue`, `joinFilters`, `dateRangeClauses`, `lineSchema`, `buildLine`, `createCaptureServer`, `invokeTool`, `parseResult`, `useDemoCompany`, `captureErrorLogs`.
- Test counts quoted after each task are the expected totals if tasks are done in order; a different order changes the numbers but not the pass/fail expectation.
