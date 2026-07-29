import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = 4010;

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"status":"ok"}');
    return;
  }
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404).end();
    return;
  }

  const body = JSON.parse(await readBody(request));
  const next = nextAssistantMessage(body);
  if (body.stream) {
    streamCompletion(response, body.model ?? "acceptance-model", next);
  } else {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model ?? "acceptance-model",
        choices: [
          {
            index: 0,
            message: next,
            finish_reason: next.tool_calls ? "tool_calls" : "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    );
  }
}).listen(port, "0.0.0.0");

function nextAssistantMessage(body) {
  const toolNames = new Set(
    (body.tools ?? []).map((item) => item.function?.name).filter(Boolean),
  );
  if (toolNames.has("capabilityProbe") && toolNames.size === 1) {
    return toolMessage("capabilityProbe", { ok: true });
  }

  const calls = (body.messages ?? [])
    .flatMap((message) => message.tool_calls ?? [])
    .map((call) => call.function?.name)
    .filter(Boolean);
  const toolResults = collectFieldContexts(body.messages ?? []);

  if (!calls.includes("searchFields")) {
    return toolMessage("searchFields", { query: "acceptance" });
  }
  if (!calls.includes("getFieldContext")) {
    const fieldIds = unique(toolResults.map((field) => field.fieldId)).slice(0, 12);
    return toolMessage("getFieldContext", { fieldIds });
  }
  if (!calls.includes("proposeFieldChanges")) {
    const editable = uniqueByFieldId(toolResults)
      .filter((field) => field.kind === "text" || field.kind === "multiline")
      .slice(0, 2);
    return toolMessage("proposeFieldChanges", {
      changes: editable.map((field, index) => ({
        fieldId: field.fieldId,
        value: index === 0 ? "AI accepted name" : "AI accepted biography",
        reason: "Deterministic acceptance proposal",
        confidence: 1,
        expectedVersion: field.version ?? 0,
      })),
    });
  }
  return { role: "assistant", content: "Предложение готово к проверке." };
}

function toolMessage(name, args) {
  return {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: `call_${randomUUID().replaceAll("-", "")}`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

function streamCompletion(response, model, message) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const id = `chatcmpl-${randomUUID()}`;
  const base = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
  };
  const delta = message.tool_calls
    ? { role: "assistant", content: null, tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) }
    : { role: "assistant", content: message.content };
  response.write(
    `data: ${JSON.stringify({
      ...base,
      choices: [{ index: 0, delta, finish_reason: null }],
    })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({
      ...base,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: message.tool_calls ? "tool_calls" : "stop",
        },
      ],
    })}\n\n`,
  );
  response.end("data: [DONE]\n\n");
}

function collectFieldContexts(messages) {
  const fields = [];
  for (const message of messages) {
    if (message.role !== "tool") continue;
    visit(parseMaybeJson(message.content), fields);
  }
  return fields;
}

function visit(value, fields) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, fields);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (typeof value.fieldId === "string") fields.push(value);
  for (const child of Object.values(value)) visit(child, fields);
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function unique(values) {
  return [...new Set(values)];
}

function uniqueByFieldId(fields) {
  return [...new Map(fields.map((field) => [field.fieldId, field])).values()];
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
