# e-conomic MCP server: multi-company plugin design

Approved 2026-09-09. This spec covers everything needed to turn the `main`
branch into a Claude Code plugin that two people can install and use against
several e-conomic companies safely.

## Goals

1. One server process serves several e-conomic companies (agreements), chosen
   per tool call, with no way to act on the wrong company by accident.
2. `main` is safe: no test writes to a real agreement, errors are flagged as
   errors, update tools do not erase data, and field names match the API.
3. Read-only bookkeeping lookups (booked entries, account entries, totals,
   VAT accounts, journals) are available for VAT and error checking.
4. The repository installs as a Claude Code plugin from a private GitHub
   marketplace with no build step on the user's machine.
5. Every layer has real tests against the e-conomic demo API. No mocks.

## Non-goals

- Journal write tools (`create_draft_entry`, `attach_pdf_to_entry`,
  `match_booked_entries`, `book_and_match_receipt`, `book_customer_payment`).
  They call endpoints that do not exist or cannot be verified without a
  trial agreement. They stay on the `testing` branch untouched.
- The OpenAPI validator, `scripts/test-sanity.js`, `list_bank_transactions`
  (superseded by `list_account_entries`) and the Cowork preferences file.
- A Python rewrite. The code stays plain ESM JavaScript without a TypeScript
  build step.
- Creating or transferring GitHub repositories. The user transfers the fork
  to the `sdnielsen` organisation.

## Configuration and authentication

Environment variables read by the server:

| Variable | Meaning |
| --- | --- |
| `ECONOMIC_APP_SECRET_TOKEN` | Required. The developer app's secret token, shared by all companies. |
| `ECONOMIC_GRANT_<NAME>` | One per company. `<NAME>` is `[A-Z0-9_]+`; the company key is `<NAME>` lower-cased. Example: `ECONOMIC_GRANT_ACME` gives company `acme`. |
| `ECONOMIC_AGREEMENT_GRANT_TOKEN` | Backwards compatible. When set, it is the company `default`. |
| `ECONOMIC_BASE_URL` | Optional. Must match `https://restapi.e-conomic.com`, as today. |
| `ECONOMIC_DEBUG` | Optional. `true` enables debug logging to stderr. |

Values are trimmed; empty values are ignored. At least one company must be
configured.

A new module `src/economic/companies.js` exports:

- `loadCompanies(env)`: returns a `Map` of company key to grant token, built
  from the variables above. Pure; takes `env` so it can be unit tested.
- `resolveCompany(env, company)`: returns `{ name, grantToken }`. Rules:
  - `company` given: matched case-insensitively against the keys. Unknown
    key throws `EconomicApiError` with `errorCode: "E_UNKNOWN_COMPANY"` and a
    message listing configured keys.
  - `company` omitted and exactly one company configured: that company.
  - `company` omitted and several configured: throws
    `E_COMPANY_REQUIRED` with a message listing configured keys.
  - No app secret or no companies: throws `E_NO_CREDENTIALS`, as today.

`src/economic/api-client.js` changes:

- `request(method, path, body, { company } = {})` resolves the company and
  sends its grant token in `X-AgreementGrantToken`.
- `requestBinary(method, path, { company } = {})` returns
  `{ buffer, contentType }` for non-JSON responses (PDF). It applies the same
  base-URL allowlist, headers, timeout and error mapping as `request`.
- `fetch` failures are mapped to `EconomicApiError`: timeouts become
  `E_TIMEOUT`, other network errors `E_NETWORK`, both with `status: 0`.
- Debug logs include `company` and never any token value.
- `validateCredentials()` remains for the app secret check and is used by the
  company resolver.

## Tool contract changes

`src/tools/tool-helpers.js` exports:

- `companySchema`: `z.string().min(1).max(50).optional()` with the
  description "Company key as configured in ECONOMIC_GRANT_<NAME>. Required
  when more than one company is configured. Use list_companies to see them."
- `errorToContent(error)`: unchanged output shape plus `isError: true`.
- `jsonContent(data)`: returns the standard text content wrapper.
- `buildListQuery({ pageSize, page, filter })`: returns a `URLSearchParams`
  with `pagesize`, `skippages` and optional `filter`. Defaults: page size
  100, page 1.
- `escapeFilterValue(value)`: applies e-conomic's escape table
  (`$`→`$$`, `(`→`$(`, `)`→`$)`, `*`→`$*`, `[`→`$[`, `]`→`$]`, `,`→`$,`).

Every existing tool gains `company: companySchema` in its input schema and
passes `{ company }` to every `request` call, including inside helper
functions such as `ensureCustomer`, `fetchInvoiceTemplate`,
`fetchBookingInstructions`, `fetchCustomer` and `fetchDraft`. Tools that
write (`upsert_product`, `create_invoice_draft`, `update_invoice_draft`,
`update_customer`, `book_invoice_draft`) include the resolved company key in
their JSON response under `company`.

Specific fixes:

- `create_invoice_draft` and `update_invoice_draft`: `lines[].productNumber`
  becomes required. The silent default product "1" is removed.
- `create_invoice_draft.newCustomer` and `update_customer`: `cvr` is renamed
  `corporateIdentificationNumber`; the string `attention` field is removed
  because the API field is a contact reference object.
- `update_customer` builds its payload with an exported pure function
  `buildCustomerUpdatePayload(current, input)`. It copies these fields from
  the current customer when present, then applies the validated input:
  `customerNumber, name, currency, paymentTerms, customerGroup, vatZone,
  address, zip, city, country, email, telephoneAndFaxNumber, mobilePhone,
  website, ean, corporateIdentificationNumber, pNumber, vatNumber,
  publicEntryNumber, creditLimit, barred, layout, salesPerson, priceGroup,
  eInvoicingDisabledByDefault, attention, customerContact,
  defaultDeliveryLocation`. Source: the published `customers.post` schema
  plus the reference fields the current implementation already echoes.
- `update_invoice_draft` builds its payload with an exported pure function
  `buildDraftUpdatePayload(current, input)` copying: `draftInvoiceNumber,
  date, currency, exchangeRate, dueDate, layout, project, paymentTerms,
  customer, recipient, deliveryLocation, delivery, notes, references,
  lines`. Source: the published `invoices.drafts.draftInvoiceNumber.put`
  schema, minus computed amounts and `pdf`, plus `layout` which the current
  implementation already sends successfully.
- `download_invoice_pdf` uses `requestBinary` and `errorToContent`. The
  50 MB size limit stays.

`src/server.js`:

- Reads its version from `package.json`.
- Passes `instructions` to the MCP server: "This server can be connected to
  several e-conomic companies. Call list_companies first. When more than one
  company is configured every other tool requires the company argument.
  Booking is irreversible; confirm with the user before booking."
- Loads `.env` from the package root, not from the working directory.

## New tools

All new tools are read-only, take `company`, and use `buildListQuery`.
Endpoints were verified against the live demo API on 2026-09-08.

| Tool | Endpoint | Arguments |
| --- | --- | --- |
| `list_companies` | `GET /self` per configured company | none |
| `list_accounting_years` | `GET /accounting-years` | `pageSize`, `page` |
| `list_accounts` | `GET /accounts` | `pageSize`, `page`, optional `accountType` filter |
| `list_booked_entries` | `GET /accounting-years/{year}/entries` | `accountingYear` (required, e.g. `2025` or `2025/2026`), optional `fromDate`, `toDate`, `voucherNumber`, `text` (substring), `entryType`, `amount`, `customerNumber`, `supplierNumber`, `pageSize`, `page` |
| `list_account_entries` | `GET /accounts/{n}/accounting-years/{year}/entries` | `accountNumber`, `fromDate`, `toDate` (required), optional `amount`. Ported from branch `worktree-list-account-entries` with its tests. |
| `list_account_totals` | `GET /accounting-years/{year}/totals` or `.../periods/{p}/totals` | `accountingYear` (required), optional `periodNumber`, `pageSize`, `page` |
| `list_vat_accounts` | `GET /vat-accounts` | `pageSize`, `page` |
| `list_journals` | `GET /journals` | `pageSize`, `page` |
| `list_journal_draft_entries` | `GET /journals/{n}/entries` | `journalNumber` (required), optional `fromDate`, `toDate`, `pageSize`, `page` |

`list_companies` returns an array of
`{ company, agreementNumber, companyName, companyIdentificationNumber }`;
a company whose `/self` call fails gets `{ company, error, errorCode }`
instead, and the tool result is not marked as an error unless every company
fails.

Filters use e-conomic's `property$op:value` syntax joined with `$and:`.
Dates use `date$gte:` and `date$lte:`. Text search uses
`text$like:*<escaped>*`. Filter builders are exported pure functions so they
can be unit tested. Allowed filter fields were read from the API's own
`allowedFilteringFields` responses.

## Error handling

- All tool handlers catch `EconomicApiError` and return it through
  `errorToContent`, so the model sees `isError: true` with `error`, `status`
  and `errorCode`.
- Zod validation failures are handled by the MCP SDK and already return
  `isError: true`.
- Anything else propagates and the SDK reports it as an error result.
- Error details and hints are logged to stderr only, as today.

## Testing

Runner: Node's built-in `node --test`. Layout:

- `test/unit/*.test.js`: pure functions only, no network. Company loading and
  resolution, filter builders and escaping, list query builder, customer and
  draft payload builders, account entries helpers, version consistency
  between `package.json` and `.claude-plugin/plugin.json`.
- `test/integration/*.test.js`: registers the real tools against a capture
  server and calls each read tool against the demo API with
  `ECONOMIC_APP_SECRET_TOKEN=demo` and `ECONOMIC_GRANT_DEMO=demo` set by the
  test. Also covers the real error paths: unknown customer gives a 404 with
  `isError: true`; a write against the demo licence gives a 403 with
  `isError: true`; a call without `company` when two companies are configured
  gives `E_COMPANY_REQUIRED`.
- `test/e2e/server.test.js`: spawns `src/server.js` and, when present,
  `dist/server.mjs` through the MCP stdio client with demo tokens, checks the
  tool count, the server instructions, and calls `hello`, `list_companies`
  and `list_customers`.

npm scripts: `test:unit`, `test:integration`, `test:e2e`, and `test` which
runs `build` then all three. `npm test` never writes to any agreement.

The live harness `scripts/test-harness.js` stays for manual use:
`npm run harness -- --company <key> [--allow-writes]`. Without
`--allow-writes` it skips every write sample. The sample invoice date is the
current date rather than 2015.

## Packaging

- `.claude-plugin/plugin.json`: name `e-conomic`, version equal to
  `package.json`, description, author `SDNielsen ApS`.
- `.mcp.json` at the repository root, tracked in git, containing only
  variable references:

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

  Token variables are not listed; the server reads them from the
  environment Claude Code passes to it, which includes the `env` block of
  the user's settings. The `:-.` default lets the same file work as a
  project-scoped server when the repository itself is opened.
- `.claude-plugin/marketplace.json`: name `sdnielsen`, owner
  `SDNielsen ApS`, one plugin entry `e-conomic` with `source: "./"`. No
  `version` here; `plugin.json` is the authority.
- `npm run build`: esbuild bundles `src/server.js` into `dist/server.mjs`
  (ESM, Node platform, shebang banner). `dist/` is committed and rebuilt on
  every release. esbuild is a devDependency.
- `package.json`: license MIT to match `LICENSE`, description and author
  filled in, `engines.node >= 20`, version bumped to `1.1.0`.
- `.gitignore` gains `.serena/`. The `testing` branch's rule ignoring
  `.mcp.json` is not adopted.
- Documentation: README rewritten around plugin installation, the token
  flow per company, the `ECONOMIC_GRANT_<NAME>` scheme and the test
  commands. `CLAUDE.md` updated for the new tools, env vars and tests.
  `docs/creating-auth-tokens.md` gains a section on several companies.

## Risks and follow-ups

- `PUT` field preservation cannot be exercised against the demo licence.
  The field lists come from the published schemas and from what the current
  code already sends. First use against a real company should be a harmless
  update, checked in the e-conomic UI.
- Journal write tools need a trial agreement to verify endpoints before they
  can be added.
- Marketplace background refresh over HTTPS cannot authenticate to a private
  repository; use SSH remotes on both machines.
- The design assumes the server process inherits the `env` block from the
  user's settings when Claude Code spawns it as a plugin server. If a real
  installation shows otherwise, the fallback is to list each
  `ECONOMIC_GRANT_<NAME>` variable explicitly in `.mcp.json` as
  `"${ECONOMIC_GRANT_<NAME>}"`.
