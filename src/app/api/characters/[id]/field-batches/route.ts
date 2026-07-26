import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { applyProposalSchema } from "@/lib/schemas";
import type { FieldValue } from "@/lib/types";

interface AppliedRpcItem {
  itemId: string;
  fieldId: string;
  revision: number;
}

interface ApplyProposalResult {
  applied?: AppliedRpcItem[];
  conflicts?: unknown[];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const parsed = applyProposalSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  const { data: proposal } = await supabase
    .from("ai_proposals")
    .select("character_id")
    .eq("id", parsed.data.proposalId)
    .single();
  if (!proposal || proposal.character_id !== id)
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  const { data, error } = await supabase.rpc("apply_ai_proposal", {
    p_proposal_id: parsed.data.proposalId,
    p_items: parsed.data.items,
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  const result = (data ?? {}) as ApplyProposalResult;
  const applied = Array.isArray(result.applied) ? result.applied : [];
  const conflicts = Array.isArray(result.conflicts) ? result.conflicts : [];
  if (conflicts.length > 0) {
    const { error: expireError } = await supabase
      .from("ai_proposals")
      .update({ status: "expired" })
      .eq("id", parsed.data.proposalId)
      .eq("status", "pending");
    if (expireError)
      return NextResponse.json({ error: expireError.message }, { status: 500 });
  }
  if (applied.length === 0) return NextResponse.json(result);

  const fieldIds = [...new Set(applied.map((item) => item.fieldId))];
  const { data: snapshots, error: snapshotError } = await supabase
    .from("character_values")
    .select("field_id,value,version,updated_by")
    .eq("character_id", id)
    .in("field_id", fieldIds);
  if (snapshotError)
    return NextResponse.json({ error: snapshotError.message }, { status: 500 });

  const snapshotByFieldId = new Map(
    (snapshots ?? []).map((snapshot) => [snapshot.field_id, snapshot]),
  );
  const submittedValueByItemId = new Map(
    parsed.data.items.map((item) => [item.itemId, item.value]),
  );
  return NextResponse.json({
    ...result,
    applied: applied.map((item) => {
      const snapshot = snapshotByFieldId.get(item.fieldId);
      return {
        ...item,
        value: (snapshot?.value ??
          submittedValueByItemId.get(item.itemId) ??
          null) as FieldValue,
        version: snapshot?.version,
        updatedBy: snapshot?.updated_by ?? null,
      };
    }),
  });
}
