import { z } from "zod";
import { exposedPropertyDefinitionSchema } from "@mycharacter/contracts";

export function parseComponentExposedProperties(value: unknown) {
  const stored: unknown = typeof value === "string" ? JSON.parse(value) : value;
  // Older publications passed an empty JS array directly to node-postgres,
  // which stored its PostgreSQL array literal as the JSON object {}.
  const isLegacyEmpty =
    stored !== null &&
    typeof stored === "object" &&
    !Array.isArray(stored) &&
    Object.keys(stored).length === 0;
  return z
    .array(exposedPropertyDefinitionSchema)
    .parse(stored == null || isLegacyEmpty ? [] : stored);
}
