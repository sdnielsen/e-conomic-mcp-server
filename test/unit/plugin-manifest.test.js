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
