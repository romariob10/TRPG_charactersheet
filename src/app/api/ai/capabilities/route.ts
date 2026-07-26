import { NextResponse } from "next/server";
import { generateText, tool } from "ai";
import { z } from "zod";
import { createConfiguredProvider, nonThinkingProviderOptions } from "@/lib/ai/provider";
import { requireUser } from "@/lib/supabase/auth";

export async function GET() {
  await requireUser();
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
      providerOptions: nonThinkingProviderOptions,
      maxOutputTokens: 32,
      timeout: 12_000,
    });
    const toolCalls = result.toolCalls.some((call) => call.toolName === "capabilityProbe");
    return NextResponse.json({ configured: true, toolCalls, diagnostic: toolCalls ? null : "The configured model did not return a tool call." }, { status: toolCalls ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      configured: false,
      toolCalls: false,
      diagnostic: error instanceof Error ? error.message : "AI capability check failed",
    }, { status: 503 });
  }
}
