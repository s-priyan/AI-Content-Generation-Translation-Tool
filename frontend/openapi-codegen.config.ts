/**
 * Configuration for `npm run gen:api` — regenerates src/api/wire.ts from the
 * FastAPI backend's OpenAPI schema.
 *
 * Note the codegen target is `wire.ts` (literal HTTP payloads), NOT
 * `types.gen.ts` (UI-facing camelCase shapes that wrap the wire types).
 * The mapper layer (`src/lib/mappers.ts`) bridges the two.
 *
 * Recommended: @hey-api/openapi-ts
 *
 * Example:
 *   import { defineConfig } from "@hey-api/openapi-ts";
 *   export default defineConfig({
 *     input: "http://localhost:8000/openapi.json",
 *     output: { path: "src/api/wire.ts", format: "prettier" },
 *     plugins: ["@hey-api/typescript"],
 *   });
 */
export default {
  input: process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/openapi.json`
    : "http://localhost:8000/openapi.json",
  output: "src/api/wire.ts",
};
