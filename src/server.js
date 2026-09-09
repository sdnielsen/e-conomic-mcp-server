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
