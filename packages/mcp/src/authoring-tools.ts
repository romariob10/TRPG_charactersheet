import {
  createGameSystemRequestSchema,
  updateGameSystemRequestSchema,
  createSheetDefinitionRequestSchema,
  autosaveSheetDraftRequestSchema,
  publishSheetVersionRequestSchema,
  createComponentRequestSchema,
  autosaveComponentDraftRequestSchema,
  publishComponentVersionRequestSchema,
  forkComponentRequestSchema,
  fieldMutationRequestSchema,
  cloneCharacterRequestSchema,
  agentPresenceRequestSchema,
} from "@mycharacter/contracts";
import { ToolSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { MyCharacterClient } from "./client.js";

type InputSchema = {
  parse(_value: unknown): unknown;
  toJSONSchema(_options: { io: "input" }): object;
};
interface Operation {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  schema?: InputSchema;
}
const operations: Operation[] = [
  {
    name: "get_sheet_field_values",
    method: "GET",
    path: "/api/characters/:id/sheet-state",
    description:
      "Read current field binding values and versions before editing a character.",
  },
  {
    name: "list_game_systems",
    method: "GET",
    path: "/api/game-systems",
    description: "List game systems, including your own systems.",
  },
  {
    name: "create_game_system",
    method: "POST",
    path: "/api/game-systems",
    schema: createGameSystemRequestSchema,
    description:
      "Create a game system and an initial sheet definition. Returns defaultSheetId.",
  },
  {
    name: "get_system_workspace",
    method: "GET",
    path: "/api/game-systems/:id/workspace",
    description:
      "Read a system workspace, sheet definitions and published versions.",
  },
  {
    name: "update_game_system",
    method: "PATCH",
    path: "/api/game-systems/:id",
    schema: updateGameSystemRequestSchema,
    description: "Update an owned game system.",
  },
  {
    name: "delete_game_system",
    method: "DELETE",
    path: "/api/game-systems/:id",
    description:
      "Delete an owned game system. Destructive; only on the user's request.",
  },
  {
    name: "create_sheet",
    method: "POST",
    path: "/api/sheet-definitions",
    schema: createSheetDefinitionRequestSchema,
    description:
      "Create a character/NPC/vehicle sheet template in an owned system.",
  },
  {
    name: "get_sheet_editor",
    method: "GET",
    path: "/api/sheet-definitions/:id/editor",
    description:
      "Read the complete draft, layout tree, fields, components and revision before editing.",
  },
  {
    name: "save_sheet_draft",
    method: "PUT",
    path: "/api/sheet-definitions/:id/draft",
    schema: autosaveSheetDraftRequestSchema,
    description:
      "Save all target layouts and fields using expectedRevision. On conflict, reread and merge; never blindly overwrite. Call set_presence while working.",
  },
  {
    name: "publish_sheet",
    method: "POST",
    path: "/api/sheet-definitions/:id/publish",
    schema: publishSheetVersionRequestSchema,
    description:
      "Publish a validated draft as an immutable version, usable to create characters.",
  },
  {
    name: "list_sheet_versions",
    method: "GET",
    path: "/api/sheet-definitions/:id/versions",
    description: "List published versions of a sheet.",
  },
  {
    name: "get_sheet_version",
    method: "GET",
    path: "/api/sheet-versions/:id",
    description: "Read layouts and field definitions of a published version.",
  },
  {
    name: "list_components",
    method: "GET",
    path: "/api/components",
    description: "Browse reusable components.",
  },
  {
    name: "get_component",
    method: "GET",
    path: "/api/components/:id",
    description: "Read a component and its draft.",
  },
  {
    name: "create_component",
    method: "POST",
    path: "/api/components",
    schema: createComponentRequestSchema,
    description: "Create a reusable sheet component.",
  },
  {
    name: "save_component_draft",
    method: "PUT",
    path: "/api/components/:id/draft",
    schema: autosaveComponentDraftRequestSchema,
    description: "Save a component draft with optimistic revision checking.",
  },
  {
    name: "publish_component",
    method: "POST",
    path: "/api/components/:id/publish",
    schema: publishComponentVersionRequestSchema,
    description: "Publish a reusable component version.",
  },
  {
    name: "fork_component",
    method: "POST",
    path: "/api/components/:id/fork",
    schema: forkComponentRequestSchema,
    description: "Fork an accessible component into your library.",
  },
  {
    name: "get_character_editor",
    method: "GET",
    path: "/api/characters/:id/editor",
    description:
      "Read a character's current sheet values, versions, layout and editor context.",
  },
  {
    name: "update_sheet_field",
    method: "PUT",
    path: "/api/characters/:id/sheet-fields/:key",
    schema: fieldMutationRequestSchema,
    description:
      "Update a character field by binding key with expectedVersion and a unique clientMutationId. Use for new sheets (not PDF UUID fields).",
  },
  {
    name: "clone_character",
    method: "POST",
    path: "/api/characters/:id/clone",
    schema: cloneCharacterRequestSchema,
    description: "Clone an accessible character.",
  },
  {
    name: "trash_character",
    method: "POST",
    path: "/api/characters/:id/trash",
    description: "Move a character to trash, only when requested.",
  },
  {
    name: "restore_character",
    method: "POST",
    path: "/api/characters/:id/restore",
    description: "Restore a character from trash.",
  },
];

export function authoringToolDefinitions(): Tool[] {
  return [
    ...operations.map((op) => {
      const { $defs, ...bodySchema } = op.schema
        ? z.record(z.unknown()).parse(op.schema.toJSONSchema({ io: "input" }))
        : {};
      return ToolSchema.parse({
        name: `mycharacter_${op.name}`,
        description: op.description,
        annotations: {
          readOnlyHint: op.method === "GET",
          destructiveHint:
            op.method === "DELETE" || op.name === "trash_character",
        },
        inputSchema: {
          type: "object" as const,
          ...($defs ? { $defs } : {}),
          properties: {
            ...(op.path.includes(":id")
              ? { id: { type: "string", format: "uuid" } }
              : {}),
            ...(op.path.includes(":key")
              ? { key: { type: "string", minLength: 1 } }
              : {}),
            ...(op.schema ? { input: bodySchema } : {}),
          },
          required: [
            ...(op.path.includes(":id") ? ["id"] : []),
            ...(op.path.includes(":key") ? ["key"] : []),
            ...(op.schema ? ["input"] : []),
          ],
          additionalProperties: false,
        },
      });
    }),
    ToolSchema.parse({
      name: "mycharacter_set_presence",
      description:
        "Join a sheet or character editor as an AI collaborator. x/y are normalized 0..1 canvas coordinates, independent of zoom. Update cursor/status while working. Heartbeats keep you visible until leave_editor or disconnect.",
      inputSchema: {
        ...agentPresenceRequestSchema.toJSONSchema({ io: "input" }),
        type: "object" as const,
      },
    }),
    {
      name: "mycharacter_leave_editor",
      description:
        "Remove your cursor and online presence when work is finished.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        additionalProperties: false,
      },
    },
  ];
}

export async function callAuthoringTool(
  name: string,
  args: Record<string, unknown>,
  client: MyCharacterClient,
): Promise<unknown> {
  if (name === "mycharacter_set_presence")
    return client.setPresence(agentPresenceRequestSchema.parse(args));
  if (name === "mycharacter_leave_editor") return client.leaveEditor();
  const op = operations.find((item) => `mycharacter_${item.name}` === name);
  if (!op) throw new Error(`Unknown tool: ${name}`);
  let path = op.path;
  if (path.includes(":id"))
    path = path.replace(":id", z.string().uuid().parse(args.id));
  if (path.includes(":key"))
    path = path.replace(
      ":key",
      encodeURIComponent(z.string().min(1).max(200).parse(args.key)),
    );
  const input = op.schema?.parse(args.input);
  return client.requestApi(path, {
    method: op.method,
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}
