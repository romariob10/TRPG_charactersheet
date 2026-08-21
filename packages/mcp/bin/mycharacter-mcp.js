#!/usr/bin/env node
import { runMcpServer } from "../dist/server.js";

runMcpServer().catch((error) => {
  process.stderr.write(`Fatal MCP server error: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
