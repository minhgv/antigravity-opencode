/**
 * Schema dereferencing & sanitization for Google Antigravity tool calling.
 * Ports recursive $ref/$defs expansion from native architecture to prevent HTTP 400.
 */

const JSON_SCHEMA_META_DECLARATIONS = new Set([
  "$schema",
  "$id",
  "$anchor",
  "$dynamicAnchor",
  "$vocabulary",
  "$comment",
  "$defs",
  "definitions",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively resolve $ref pointers inside a schema using root $defs or definitions.
 */
export function dereferenceSchema(
  schema: unknown,
  rootDefs: Record<string, unknown> = {},
  visited = new Set<unknown>(),
): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) {
    return schema.map((item) => dereferenceSchema(item, rootDefs, visited));
  }

  const s = schema as Record<string, unknown>;
  if (visited.has(s)) return s;
  visited.add(s);

  const defs: Record<string, unknown> = { ...rootDefs };
  if (isRecord(s.$defs)) Object.assign(defs, s.$defs);
  if (isRecord(s.definitions)) Object.assign(defs, s.definitions);

  if (typeof s.$ref === "string") {
    const ref = s.$ref;
    const match = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/);
    if (match && match[1] && defs[match[1]] !== undefined) {
      const resolved = dereferenceSchema(defs[match[1]], defs, visited);
      if (isRecord(resolved)) {
        const { $ref: _, ...rest } = s;
        const restCleaned = dereferenceSchema(rest, defs, visited);
        return isRecord(restCleaned) ? { ...resolved, ...restCleaned } : resolved;
      }
      return resolved;
    }
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(s)) {
    out[key] = dereferenceSchema(value, defs, visited);
  }
  return out;
}

/**
 * Ensure root schema is an object type with properties.
 */
export function ensureRootObjectSchema(schema: unknown): Record<string, unknown> {
  if (!isRecord(schema)) {
    return { type: "object", properties: {} };
  }
  const result: Record<string, unknown> = { ...schema };
  const rawType = typeof result.type === "string" ? result.type.toLowerCase() : "";
  if (!rawType || rawType === "object") {
    result.type = "object";
  }
  if (!isRecord(result.properties)) {
    result.properties = {};
  }
  if (Array.isArray(result.required)) {
    const validRequired = (result.required as unknown[]).filter(
      (key): key is string =>
        typeof key === "string" && Boolean(isRecord(result.properties) && key in result.properties),
    );
    if (validRequired.length > 0) {
      result.required = validRequired;
    } else {
      delete result.required;
    }
  }
  return result;
}

/**
 * Strips JSON Schema meta keywords ($schema, $defs, definitions, etc.) for OpenAPI compatibility.
 */
export function sanitizeForOpenApi(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return schema;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (JSON_SCHEMA_META_DECLARATIONS.has(key)) continue;
    result[key] = sanitizeForOpenApi(value);
  }
  return result;
}
