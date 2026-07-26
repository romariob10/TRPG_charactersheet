import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { catalogPdf, purgeTrashedCharacters } from "@/inngest/catalog";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [catalogPdf, purgeTrashedCharacters],
});

export const runtime = "nodejs";
export const maxDuration = 300;
