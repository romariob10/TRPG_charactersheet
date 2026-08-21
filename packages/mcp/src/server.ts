import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MyCharacterClient, markdownToBlocks } from "./client.js";
import type { PostBlock } from "@mycharacter/contracts";

export interface CreateMcpServerOptions {
  apiUrl?: string;
  origin?: string;
  email?: string;
  password?: string;
  client?: MyCharacterClient;
}

export function createMyCharacterMcpServer(options: CreateMcpServerOptions = {}) {
  const client = options.client || new MyCharacterClient({
    baseUrl: options.apiUrl || process.env.MYCHARACTER_API_URL,
    origin: options.origin || process.env.MYCHARACTER_ORIGIN,
  });

  const server = new Server(
    {
      name: "mycharacter-mcp",
      version: "0.0.9",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "mycharacter_get_my_profile",
          description: "Get profile information of the currently authenticated user (ID, email, username, displayName, bio, stats).",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "mycharacter_get_user_profile",
          description: "Get public profile and published characters/templates of a user by username.",
          inputSchema: {
            type: "object",
            properties: {
              username: { type: "string", description: "Username to query" },
            },
            required: ["username"],
          },
        },
        {
          name: "mycharacter_set_username",
          description: "Set or change the username of the currently authenticated account.",
          inputSchema: {
            type: "object",
            properties: {
              username: { type: "string", description: "New username (3-30 chars: lowercase latin letters, numbers, _, -)" },
            },
            required: ["username"],
          },
        },
        {
          name: "mycharacter_list_characters",
          description: "List all character sheets owned by the authenticated user.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "mycharacter_get_character",
          description: "Get full character sheet details (name, template, field values and versions) by character ID.",
          inputSchema: {
            type: "object",
            properties: {
              characterId: { type: "string", description: "UUID of the character" },
            },
            required: ["characterId"],
          },
        },
        {
          name: "mycharacter_create_character",
          description: "Create a new character sheet.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Character name" },
              templateId: { type: "string", description: "Optional UUID of the RPG system/sheet template" },
            },
            required: ["name"],
          },
        },
        {
          name: "mycharacter_update_character_metadata",
          description: "Update character metadata (name, public visibility).",
          inputSchema: {
            type: "object",
            properties: {
              characterId: { type: "string", description: "UUID of the character" },
              name: { type: "string", description: "New character name" },
              isPublic: { type: "boolean", description: "Whether the character is publicly visible" },
            },
            required: ["characterId"],
          },
        },
        {
          name: "mycharacter_update_character_field",
          description: "Update a single field value on a character sheet with version checking.",
          inputSchema: {
            type: "object",
            properties: {
              characterId: { type: "string", description: "UUID of the character" },
              fieldId: { type: "string", description: "Field identifier / UUID" },
              expectedVersion: { type: "number", description: "Expected current version of the field (integer >= 0)" },
              clientMutationId: { type: "string", description: "Unique mutation ID string for idempotency" },
              value: { description: "New field value (string, number, boolean, or array depending on field type)" },
            },
            required: ["characterId", "fieldId", "expectedVersion", "clientMutationId", "value"],
          },
        },
        {
          name: "mycharacter_list_systems",
          description: "List available TTRPG systems / sheet templates in the community library.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "mycharacter_get_system",
          description: "Get details, pages, and field schemas of an RPG system template by ID.",
          inputSchema: {
            type: "object",
            properties: {
              systemId: { type: "string", description: "UUID of the system/template" },
            },
            required: ["systemId"],
          },
        },
        {
          name: "mycharacter_list_feed_posts",
          description: "List recent community social feed posts.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "mycharacter_get_post",
          description: "Get a specific post by author username and slug.",
          inputSchema: {
            type: "object",
            properties: {
              username: { type: "string", description: "Post author username" },
              slug: { type: "string", description: "Post slug" },
            },
            required: ["username", "slug"],
          },
        },
        {
          name: "mycharacter_create_post",
          description: "Publish a new post to the community feed. Accepts either plain Markdown or structured blocks.",
          inputSchema: {
            type: "object",
            properties: {
              markdown: { type: "string", description: "Post content in Markdown (headers, paragraphs, lists, quotes, dividers)" },
              blocks: {
                type: "array",
                description: "Optional raw PostBlock array matching MyCharacter contracts",
              },
              embedCharacterId: { type: "string", description: "Optional character UUID to embed" },
              embedSystemId: { type: "string", description: "Optional system UUID to embed" },
            },
          },
        },
        {
          name: "mycharacter_upload_post_image",
          description: "Upload an image (base64) to be used in posts.",
          inputSchema: {
            type: "object",
            properties: {
              base64Data: { type: "string", description: "Base64-encoded image bytes" },
              filename: { type: "string", description: "Filename (e.g. hero.png, map.jpg)" },
              mediaType: { type: "string", description: "MIME type (image/png, image/jpeg, image/webp, image/gif)" },
            },
            required: ["base64Data"],
          },
        },
      ],
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case "mycharacter_get_my_profile": {
          const profile = await client.getMyProfile();
          return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] };
        }

        case "mycharacter_get_user_profile": {
          const { username } = args as { username: string };
          const profile = await client.getUserProfile(username);
          return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] };
        }

        case "mycharacter_set_username": {
          const { username } = args as { username: string };
          const result = await client.setUsername(username);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "mycharacter_list_characters": {
          const characters = await client.listCharacters();
          return { content: [{ type: "text", text: JSON.stringify(characters, null, 2) }] };
        }

        case "mycharacter_get_character": {
          const { characterId } = args as { characterId: string };
          const char = await client.getCharacter(characterId);
          return { content: [{ type: "text", text: JSON.stringify(char, null, 2) }] };
        }

        case "mycharacter_create_character": {
          const { name, templateId } = args as { name: string; templateId?: string };
          const created = await client.createCharacter(name, templateId);
          return { content: [{ type: "text", text: JSON.stringify(created, null, 2) }] };
        }

        case "mycharacter_update_character_metadata": {
          const { characterId, name, isPublic } = args as {
            characterId: string;
            name?: string;
            isPublic?: boolean;
          };
          const updated = await client.updateCharacterMetadata(characterId, { name, isPublic });
          return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
        }

        case "mycharacter_update_character_field": {
          const { characterId, fieldId, expectedVersion, clientMutationId, value } = args as {
            characterId: string;
            fieldId: string;
            expectedVersion: number;
            clientMutationId: string;
            value: unknown;
          };
          const updated = await client.updateCharacterField(characterId, {
            fieldId,
            expectedVersion,
            clientMutationId,
            value,
          });
          return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
        }

        case "mycharacter_list_systems": {
          const systems = await client.listSystems();
          return { content: [{ type: "text", text: JSON.stringify(systems, null, 2) }] };
        }

        case "mycharacter_get_system": {
          const { systemId } = args as { systemId: string };
          const system = await client.getSystem(systemId);
          return { content: [{ type: "text", text: JSON.stringify(system, null, 2) }] };
        }

        case "mycharacter_list_feed_posts": {
          const posts = await client.listFeedPosts();
          return { content: [{ type: "text", text: JSON.stringify(posts, null, 2) }] };
        }

        case "mycharacter_get_post": {
          const { username, slug } = args as { username: string; slug: string };
          const post = await client.getPost(username, slug);
          return { content: [{ type: "text", text: JSON.stringify(post, null, 2) }] };
        }

        case "mycharacter_create_post": {
          const { markdown, blocks: inputBlocks, embedCharacterId, embedSystemId } = args as {
            markdown?: string;
            blocks?: PostBlock[];
            embedCharacterId?: string;
            embedSystemId?: string;
          };

          let blocks: PostBlock[] = [];
          if (Array.isArray(inputBlocks) && inputBlocks.length > 0) {
            blocks = [...inputBlocks];
          } else if (markdown) {
            blocks = markdownToBlocks(markdown);
          }

          if (embedCharacterId) {
            blocks.push({
              type: "character",
              data: { characterId: embedCharacterId },
            });
          }
          if (embedSystemId) {
            blocks.push({
              type: "system",
              data: { templateId: embedSystemId },
            });
          }

          if (blocks.length === 0) {
            throw new Error("Post content is empty. Provide either markdown text or blocks.");
          }

          const post = await client.createPost(blocks);
          return { content: [{ type: "text", text: JSON.stringify(post, null, 2) }] };
        }

        case "mycharacter_upload_post_image": {
          const { base64Data, filename = "image.png", mediaType = "image/png" } = args as {
            base64Data: string;
            filename?: string;
            mediaType?: string;
          };
          const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ""), "base64");
          const upload = await client.uploadPostImage(buffer, filename, mediaType);
          return { content: [{ type: "text", text: JSON.stringify(upload, null, 2) }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error executing ${name}: ${message}` }],
      };
    }
  });

  return { server, client };
}

export async function runMcpServer(options: CreateMcpServerOptions = {}) {
  const { server, client } = createMyCharacterMcpServer(options);

  // Authenticate if env credentials provided
  const email = options.email || process.env.MYCHARACTER_EMAIL;
  const password = options.password || process.env.MYCHARACTER_PASSWORD;

  if (email && password) {
    try {
      await client.login(email, password);
      process.stderr.write(`[MyCharacter MCP] Successfully authenticated as ${email}\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[MyCharacter MCP] Warning: Automatic login failed for ${email}: ${msg}\n`);
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[MyCharacter MCP] Server connected to stdio.\n");
}
