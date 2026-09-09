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
