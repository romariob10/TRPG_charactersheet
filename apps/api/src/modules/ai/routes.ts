import { Readable } from "node:stream";
import {
  applyProposalSchema,
  characterIdSchema,
  rejectProposalSchema,
} from "@mycharacter/contracts";
import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { generateText, tool } from "ai";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../errors.js";
import { requireActor } from "../../plugins/auth.js";
import type { RealtimeBus } from "../../realtime/realtime-bus.js";
import { CharacterService } from "../characters/service.js";
import {
  createConfiguredProvider,
  economicalQwenProviderOptions,
} from "./provider.js";
import { AiProposalService } from "./proposal-service.js";
import { PostgresAiRepository } from "./repository.js";
import { LocalAgentRunner } from "./runner.js";
import { createCharacterTools } from "./tools.js";

export async function registerAiRoutes(
  app: FastifyInstance,
  realtime: RealtimeBus,
): Promise<void> {
  const characters = new CharacterService(app.db);
  const proposals = new AiProposalService(app.db, realtime);

  app.post(
    "/api/copilotkit",
    { bodyLimit: 26 * 1024 * 1024 },
    async (request, reply) => {
    const actor = requireActor(request);
    const characterId = characterIdSchema.safeParse(
      request.headers["x-character-id"],
    );
    if (!characterId.success) throw validationError("Missing character context.");
    const character = await characters.authorizeCharacter(
      actor.userId,
      characterId.data,
      "read",
    );
    let chatModel;
    try {
      chatModel = createConfiguredProvider().chatModel;
    } catch {
      throw new AppError(
        "AI_NOT_CONFIGURED",
        503,
        "AI provider is not configured.",
      );
    }
    const repository = new PostgresAiRepository(
      app.db,
      character.id,
      actor.userId,
    );
    const agent = new BuiltInAgent({
      model: chatModel,
      maxSteps: 5,
      providerOptions: economicalQwenProviderOptions,
      prompt: `You are the character-sheet assistant for ${character.name}. Help in the user's language. You can only inspect the catalog and create proposals; you can never directly write a field. Always call searchFields before getFieldContext. Use labels, sections, coordinates, groups, and current versions to resolve intent. When several fields are plausible or confidence is below 0.65, ask a concise clarifying question instead of guessing. Before proposing, read the exact current field context. Put every requested change into one proposeFieldChanges call. Do not narrate intermediate tool use or emit progress messages between tool calls. Return one concise final response after the tools finish because the proposal card contains the details.`,
      tools: createCharacterTools({
        database: app.db,
        characterId: character.id,
        templateId: character.templateId,
        userId: actor.userId,
      }),
    });
    const runtime = new CopilotRuntime({
      agents: { character: agent },
      runner: new LocalAgentRunner(repository),
    });
    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      endpoint: "/api/copilotkit",
    });
    const response = await handleRequest(toWebRequest(request));
    reply.status(response.status);
    response.headers.forEach((value, name) => reply.header(name, value));
    return reply.send(
      response.body
        ? Readable.fromWeb(response.body as import("node:stream/web").ReadableStream)
        : null,
    );
    },
  );

  app.get("/api/ai/capabilities", async (request, reply) => {
    requireActor(request);
    try {
      const { chatModel } = createConfiguredProvider();
      const result = await generateText({
        model: chatModel,
        prompt: "Call capabilityProbe exactly once with ok=true.",
        tools: {
          capabilityProbe: tool({
            description: "Confirms that this model can emit tool calls.",
            inputSchema: z.object({ ok: z.literal(true) }),
            execute: async ({ ok }) => ({ ok }),
          }),
        },
        toolChoice: { type: "tool", toolName: "capabilityProbe" },
        providerOptions: economicalQwenProviderOptions,
        maxOutputTokens: 32,
        timeout: 12_000,
      });
      const toolCalls = result.toolCalls.some(
        (call) => call.toolName === "capabilityProbe",
      );
      if (!toolCalls) reply.status(503);
      return {
        configured: true,
        toolCalls,
        diagnostic: toolCalls
          ? null
          : "The configured model did not return a tool call.",
      };
    } catch (error) {
      reply.status(503);
      return {
        configured: false,
        toolCalls: false,
        diagnostic:
          error instanceof Error ? error.message : "AI capability check failed",
      };
    }
  });

  app.get("/api/characters/:id/ai-threads", async (request, reply) => {
    const actor = requireActor(request);
    const characterId = parseId(request.params);
    await characters.authorizeCharacter(actor.userId, characterId, "read");
    reply.header("Cache-Control", "private, no-store");
    return {
      threads: await new PostgresAiRepository(
        app.db,
        characterId,
        actor.userId,
      ).listThreads(),
    };
  });

  app.get("/api/ai/proposals/:id", async (request) => {
    const actor = requireActor(request);
    return proposals.getStatus(actor.userId, parseId(request.params));
  });

  app.patch("/api/ai/proposals/:id", async (request) => {
    const actor = requireActor(request);
    const body = rejectProposalSchema.safeParse(request.body);
    if (!body.success) throw validationError();
    return proposals.reject(actor.userId, parseId(request.params));
  });

  app.post("/api/characters/:id/field-batches", async (request) => {
    const actor = requireActor(request);
    const input = applyProposalSchema.safeParse(request.body);
    if (!input.success) throw validationError();
    return proposals.apply(
      actor.userId,
      parseId(request.params),
      input.data.proposalId,
      input.data.items.map((item) => ({
        itemId: item.itemId,
        value: item.value as import("@mycharacter/contracts").FieldValue,
      })),
    );
  });
}

function parseId(value: unknown): string {
  const id = characterIdSchema.safeParse((value as { id?: unknown }).id);
  if (!id.success) throw validationError();
  return id.data;
}

function toWebRequest(request: FastifyRequest): Request {
  const origin = `${request.protocol}://${request.hostname}`;
  return new Request(new URL(request.url, origin), {
    method: request.method,
    headers: request.headers as HeadersInit,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
}

function validationError(message = "Request validation failed."): AppError {
  return new AppError("VALIDATION_FAILED", 400, message);
}
