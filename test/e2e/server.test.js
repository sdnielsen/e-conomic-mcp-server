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
