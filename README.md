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
