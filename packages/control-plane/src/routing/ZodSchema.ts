import { z, type ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { RouteSchema } from "./DefineRoute";

/**
 * JSON Schema object accepted directly on routes without Zod.
 */
export type JsonSchemaObject = Record<string, unknown>;

/**
 * Route schema field - Zod for validation and typing, or raw JSON Schema.
 */
export type RouteSchemaField = ZodTypeAny | JsonSchemaObject;

/**
 * OpenAPI metadata and validation fields accepted by {@link defineRoute}.
 */
export type RouteSchemaInput = {
    summary?: string;
    description?: string;
    tags?: string[];
    operationId?: string;
    deprecated?: boolean;
    security?: Array<Record<string, string[]>>;
    externalDocs?: {
        url: string;
        description?: string;
    };
    body?: RouteSchemaField;
    params?: RouteSchemaField;
    querystring?: RouteSchemaField;
    headers?: RouteSchemaField;
    response?: Partial<Record<number, RouteSchemaField>>;
};

/**
 * Returns whether a schema field is a Zod schema.
 *
 * @param field Candidate schema field
 * @returns Whether the field is a Zod schema
 */
export function isZodSchemaField(field: RouteSchemaField): field is ZodTypeAny {
    return field instanceof z.ZodType;
}

/**
 * Converts a Zod schema to JSON Schema for Fastify route validation and OpenAPI.
 *
 * @param schema Zod schema to convert
 * @returns JSON Schema object without a top-level $schema key
 */
export function toJsonSchema(schema: ZodTypeAny): JsonSchemaObject {
    const json = zodToJsonSchema(schema, {
        target: "openApi3",
        $refStrategy: "none"
    }) as JsonSchemaObject;

    delete json.$schema;
    return sanitizeJsonSchemaForFastify(json) as JsonSchemaObject;
}

/**
 * Normalizes JSON Schema produced by zod-to-json-schema for Fastify serializers.
 *
 * @param value Candidate JSON Schema node
 * @returns Sanitized JSON Schema node
 */
function sanitizeJsonSchemaForFastify(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sanitizeJsonSchemaForFastify);
    }

    if (typeof value !== "object" || value === null) {
        return value;
    }

    const schema = { ...value } as Record<string, unknown>;

    if (schema.exclusiveMinimum === true) {
        const min = typeof schema.minimum === "number" ? schema.minimum : 0;
        schema.minimum = schema.type === "integer" ? min + 1 : min;
        delete schema.exclusiveMinimum;
    }

    if (schema.exclusiveMaximum === true) {
        const max = typeof schema.maximum === "number" ? schema.maximum : 0;
        schema.maximum = schema.type === "integer" ? max - 1 : max;
        delete schema.exclusiveMaximum;
    }

    for (const key of ["properties", "patternProperties", "definitions", "$defs"] as const) {
        const nested = schema[key];

        if (nested && typeof nested === "object") {
            schema[key] = Object.fromEntries(
                Object.entries(nested as Record<string, unknown>).map(([entryKey, entryValue]) => [
                    entryKey,
                    sanitizeJsonSchemaForFastify(entryValue)
                ])
            );
        }
    }

    if (schema.items) {
        schema.items = sanitizeJsonSchemaForFastify(schema.items);
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        schema.additionalProperties = sanitizeJsonSchemaForFastify(schema.additionalProperties);
    }

    if (Array.isArray(schema.allOf)) {
        schema.allOf = schema.allOf.map(sanitizeJsonSchemaForFastify);
    }

    if (Array.isArray(schema.anyOf)) {
        schema.anyOf = schema.anyOf.map(sanitizeJsonSchemaForFastify);
    }

    if (Array.isArray(schema.oneOf)) {
        schema.oneOf = schema.oneOf.map(sanitizeJsonSchemaForFastify);
    }

    return schema;
}

/**
 * Resolves a route schema field to JSON Schema for Fastify.
 *
 * @param field Zod or JSON Schema field
 * @returns JSON Schema object
 */
export function resolveSchemaField(field: RouteSchemaField): JsonSchemaObject {
    if (isZodSchemaField(field)) {
        return toJsonSchema(field);
    }

    return field;
}

/**
 * Converts a route schema input into the Fastify schema registered on the route.
 *
 * @param schema Route schema input with optional Zod fields
 * @returns Fastify-compatible route schema
 */
export function resolveRouteSchema(schema: RouteSchemaInput): RouteSchema {
    const {
        body,
        params,
        querystring,
        headers,
        response,
        ...openApi
    } = schema;

    const resolved: RouteSchema = { ...openApi };

    if (body !== undefined) {
        resolved.body = resolveSchemaField(body);
    }

    if (params !== undefined) {
        resolved.params = resolveSchemaField(params);
    }

    if (querystring !== undefined) {
        resolved.querystring = resolveSchemaField(querystring);
    }

    if (headers !== undefined) {
        resolved.headers = resolveSchemaField(headers);
    }

    if (response !== undefined) {
        const resolvedResponse: Record<number, JsonSchemaObject> = {};

        for (const [statusCode, responseSchema] of Object.entries(response)) {
            if (responseSchema !== undefined) {
                resolvedResponse[Number(statusCode)] = resolveSchemaField(responseSchema);
            }
        }

        resolved.response = resolvedResponse;
    }

    return resolved;
}
