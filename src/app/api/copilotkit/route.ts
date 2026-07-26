import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { NextResponse } from "next/server";
import {
  createConfiguredProvider,
  nonThinkingProviderOptions,
} from "@/lib/ai/provider";
import { SupabaseAgentRunner } from "@/lib/ai/supabase-runner";
import { createCharacterTools } from "@/lib/ai/tools";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const characterId = request.headers.get("x-character-id");
  if (!characterId)
    return NextResponse.json(
      { error: "Missing character context" },
      { status: 400 },
    );
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: character } = await supabase
    .from("characters")
    .select("id,name,template_id,status")
    .eq("id", characterId)
    .single();
  if (!character || character.status !== "active")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let chatModel;
  try {
    chatModel = createConfiguredProvider().chatModel;
  } catch {
    return NextResponse.json(
      { error: "AI provider is not configured" },
      { status: 503 },
    );
  }
  const agent = new BuiltInAgent({
    model: chatModel,
    maxSteps: 5,
    providerOptions: nonThinkingProviderOptions,
    prompt: `You are the character-sheet assistant for ${character.name}. Help in the user's language. You can only inspect the catalog and create proposals; you can never directly write a field. Always call searchFields before getFieldContext. Use labels, sections, coordinates, groups, and current versions to resolve intent. When several fields are plausible or confidence is below 0.65, ask a concise clarifying question instead of guessing. Before proposing, read the exact current field context. Put every requested change into one proposeFieldChanges call. Do not narrate intermediate tool use or emit progress messages between tool calls. Return one concise final response after the tools finish because the proposal card contains the details.`,
    tools: createCharacterTools({
      characterId,
      templateId: character.template_id,
      userId: user.id,
    }),
  });
  const runtimeInstance = new CopilotRuntime({
    agents: { character: agent },
    runner: new SupabaseAgentRunner(characterId, user.id),
  });
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: runtimeInstance,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(request);
}
