# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that provides AI assistants with tools to interact with the e-conomic REST API for bookkeeping operations. The server uses the `@modelcontextprotocol/sdk` to register tools that can create and manage customers, products, draft invoices, and booked invoices.

## Required Environment Variables

- `ECONOMIC_APP_SECRET_TOKEN` (required, shared by all companies)
- `ECONOMIC_GRANT_<NAME>` (one per company; `<NAME>` in upper case becomes the lower-case company key)
- `ECONOMIC_AGREEMENT_GRANT_TOKEN` (optional single-company form, exposed as company `default`)
- `ECONOMIC_BASE_URL` (optional, must match `https://restapi.e-conomic.com`)
- `ECONOMIC_DEBUG` (optional, set to `true` to emit JSON debug logs to stderr)

Every tool except `hello` and `list_companies` takes an optional `company` argument. With one company configured it may be omitted; with several it is required and an omitted or unknown value is an error (`E_COMPANY_REQUIRED`, `E_UNKNOWN_COMPANY`).

For local development, credentials can be stored in a `.env` file next to `package.json`. The server never reads a `.env` from the working directory.

## Development Commands

### Start the server
```bash
npm start
```

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

## Architecture

### Entry Point
- `src/server.js` - Creates the MCP server instance, registers all tools, and connects to stdio transport

### Tool Registration Pattern
All tools follow a consistent registration pattern:
1. Tools are defined in individual files under `src/tools/`
2. Each tool file exports a `register*Tool(server)` function
3. `src/tools/index.js` imports and calls all registration functions
4. Tools use Zod schemas for input validation
5. Tools return standardized MCP responses with `{ content: [{ type: "text", text: "..." }] }`

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

### Error Handling
Tools catch `EconomicApiError` and return `errorToContent(error)` from `src/tools/tool-helpers.js`, which logs details to stderr and returns `{ isError: true, content: [...] }` with `error`, `status` and `errorCode`. Successful results use `jsonContent(data)`.

### Logging
- `src/utils/logger.js` provides structured JSON logging to stderr
- `logDebug(message, fields)` - Only logs when `ECONOMIC_DEBUG=true`
- `logEvent(level, message, fields)` - Logs at any level

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

## Adding New Tools

1. Create `src/tools/my-new-tool.js`:
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

2. Import and register in `src/tools/index.js`

3. Add a unit test for any pure helper under `test/unit/`, an integration test against the demo API under `test/integration/`, and raise `EXPECTED_TOOL_COUNT` in `test/e2e/server.test.js`. Add a sample to `scripts/test-harness.js`.
