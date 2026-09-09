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
    delete process.env.ECONOMIC_BASE_URL;
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
