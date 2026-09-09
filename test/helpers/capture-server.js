/**
 * Creates a stand-in for `McpServer` that records registered tools so tests
 * can call handlers directly, without a transport.
 *
 * Returns:
 *   {tools: Map, registerTool: Function}: `tools` maps tool name to
 *   `{ config, handler }`.
 */
export const createCaptureServer = () => {
  const tools = new Map();
  return {
    tools,
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  };
};

/**
 * Invokes a captured tool the way the MCP SDK would: input is validated and
 * transformed by the tool's Zod schema before the handler runs.
 *
 * Args:
 *   server (object): Output of `createCaptureServer` after registration.
 *   name (string): Tool name.
 *   input (object): Raw tool arguments.
 *
 * Returns:
 *   object: The tool result (`content`, optional `isError`).
 *
 * Raises:
 *   Error: When the tool is not registered.
 *   ZodError: When `input` does not match the schema.
 */
export const invokeTool = async (server, name, input = {}) => {
  const tool = server.tools.get(name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }
  const parsed = tool.config.inputSchema.parse(input);
  return tool.handler(parsed);
};

/**
 * Parses the JSON text of the first content block of a tool result.
 *
 * Args:
 *   result (object): A tool result.
 *
 * Returns:
 *   any: The parsed JSON value.
 */
export const parseResult = (result) => JSON.parse(result.content[0].text);

/**
 * Points the process at the e-conomic demo agreement as the only company.
 *
 * Removes any real grant tokens inherited from the shell so tests can never
 * touch a real agreement.
 */
export const useDemoCompany = () => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("ECONOMIC_GRANT_")) {
      delete process.env[key];
    }
  }
  delete process.env.ECONOMIC_AGREEMENT_GRANT_TOKEN;
  delete process.env.ECONOMIC_BASE_URL;
  process.env.ECONOMIC_APP_SECRET_TOKEN = "demo";
  process.env.ECONOMIC_GRANT_DEMO = "demo";
};

/**
 * Runs `fn` while capturing everything written through `console.error`, so a
 * test that expects an error log keeps the test output pristine and can
 * assert on the log line.
 *
 * Args:
 *   fn (Function): Sync or async function to run.
 *
 * Returns:
 *   {value: any, lines: string[]}: The function result and captured lines.
 */
export const captureErrorLogs = async (fn) => {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.map(String).join(" "));
  try {
    const value = await fn();
    return { value, lines };
  } finally {
    console.error = original;
  }
};
