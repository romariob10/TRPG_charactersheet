import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import websocket from "@fastify/websocket";
import type { Database } from "@mycharacter/database";
import Fastify, { type FastifyInstance, type RawServerDefault } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  type ZodTypeProvider,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { Kysely } from "kysely";
import type { ObjectStorage } from "@mycharacter/storage";
import { AppError } from "./errors.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerCharacterRoutes } from "./modules/characters/routes.js";
import { registerInvitationRoutes } from "./modules/invitations/routes.js";
import { registerTemplateRoutes } from "./modules/templates/routes.js";
import { registerPdfRoutes } from "./modules/pdf/routes.js";
import { registerFieldRoutes } from "./modules/fields/routes.js";
import { registerExportRoutes } from "./modules/export/routes.js";
import { registerRealtimeRoutes } from "./modules/realtime/routes.js";
import { registerAiRoutes } from "./modules/ai/routes.js";
import { registerAssetRoutes } from "./modules/assets/routes.js";
import { registerAuth } from "./plugins/auth.js";
import { registerDatabase } from "./plugins/database.js";
import { registerStorage } from "./plugins/storage.js";
import { LocalRealtimeBus } from "./realtime/local-realtime-bus.js";
import {
  createJobClient,
  createNoopJobClient,
  type JobClient,
} from "./jobs/client.js";
import { CatalogProgressBridge } from "./realtime/catalog-progress-bridge.js";

export interface BuildAppOptions {
  database?: Kysely<Database>;
  databaseUrl: string;
  publicOrigin?: string;
  cookieSecure?: boolean;
  allowMissingOriginForTests?: boolean;
  storage?: ObjectStorage;
  storageRoot?: string;
  jobs?: JobClient;
  enableBackgroundInfrastructure?: boolean;
}

function errorBody(error: AppError, requestId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify<RawServerDefault>({
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    trustProxy: 1,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(websocket);
  await app.register(swagger, {
    openapi: { info: { title: "MyCharacter API", version: "0.1.0" } },
    transform: jsonSchemaTransform,
  });
  await registerDatabase(app, options);
  await registerStorage(app, options);
  const jobs =
    options.jobs ??
    (options.enableBackgroundInfrastructure
      ? await createJobClient(options.databaseUrl)
      : createNoopJobClient());
  app.decorate("jobs", jobs);
  app.addHook("onClose", async () => jobs.stop());
  await registerAuth(app, {
    database: options.database,
    publicOrigin: options.publicOrigin ?? "http://localhost:8080",
    allowMissingOriginForTests: options.allowMissingOriginForTests,
  });
  const realtime = new LocalRealtimeBus();
  const catalogProgressBridge = options.enableBackgroundInfrastructure
    ? new CatalogProgressBridge(options.databaseUrl, realtime)
    : null;
  if (catalogProgressBridge) {
    await catalogProgressBridge.start();
    app.addHook("onClose", async () => catalogProgressBridge.stop());
  }
  await registerHealthRoutes(app);
  await registerAssetRoutes(app);
  await registerAuthRoutes(app, { cookieSecure: options.cookieSecure ?? false });
  await registerCharacterRoutes(app);
  await registerTemplateRoutes(app);
  await registerInvitationRoutes(app);
  await registerPdfRoutes(app);
  await registerFieldRoutes(app, realtime);
  await registerAiRoutes(app, realtime);
  await registerExportRoutes(app);
  await registerRealtimeRoutes(app, realtime, {
    publicOrigin: options.publicOrigin ?? "http://localhost:8080",
    allowMissingOrigin: options.allowMissingOriginForTests ?? false,
  });

  app.get("/api/openapi.json", async () => app.swagger());

  app.setNotFoundHandler((request, reply) => {
    const error = new AppError("NOT_FOUND", 404, "Resource not found.");
    return reply.status(error.statusCode).send(errorBody(error, request.id));
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(errorBody(error, request.id));
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const validationError = new AppError(
        "VALIDATION_FAILED",
        400,
        "Request validation failed.",
        error.validation,
      );
      return reply.status(validationError.statusCode).send(errorBody(validationError, request.id));
    }

    request.log.error(error);
    const internalError = new AppError(
      "INTERNAL_ERROR",
      500,
      "An unexpected error occurred.",
    );
    return reply.status(internalError.statusCode).send(errorBody(internalError, request.id));
  });

  return app;
}
