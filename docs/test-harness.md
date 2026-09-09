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
