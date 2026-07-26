import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { fieldMutationSchema } from "@/lib/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; fieldId: string }> }) {
  const { id, fieldId } = await params;
  const { supabase } = await requireUser();
  const parsed = fieldMutationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { data, error } = await supabase.rpc("update_character_field", {
    p_character_id: id,
    p_field_id: fieldId,
    p_value: parsed.data.value,
    p_expected_version: parsed.data.expectedVersion,
    p_client_mutation_id: parsed.data.clientMutationId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes("forbidden") ? 403 : 400 });
  const result = data?.[0];
  return NextResponse.json({
    value: result?.value,
    version: result?.version,
    revision: result?.revision,
    overwrittenRemote: result?.overwritten_remote,
  });
}
