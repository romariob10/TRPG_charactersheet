import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({
    ...config,
    enableBackgroundInfrastructure: true,
    logger: { level: process.env.LOG_LEVEL ?? "info" },
  });

  const close = async () => {
    await app.close();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);

  await app.listen({ host: config.host, port: config.port });
}
