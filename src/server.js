import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import registerTools from "./tools/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

// Load a .env placed next to package.json, never one from the working
// directory, so the server behaves the same wherever a client starts it.
// ECONOMIC_ENV_FILE overrides the location; tests point it at a missing file.
dotenv.config({
  path:
    process.env.ECONOMIC_ENV_FILE ??
    fileURLToPath(new URL("../.env", import.meta.url)),
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
