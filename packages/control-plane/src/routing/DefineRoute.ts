import type { FastifyReply, FastifyRequest, FastifySchema, preHandlerHookHandler } from "fastify";
import { z, type ZodTypeAny } from "zod";

import { resolveRouteSchema, type RouteSchemaInput } from "./ZodSchema";

/**
 * Fastify JSON Schema with OpenAPI operation metadata for route documentation.
 */
export type RouteSchema = FastifySchema & {
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
};

/**
 * Supported HTTP methods for file-based routes.
 */
export type RouteHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Infers the Fastify request type from route schema fields declared with Zod.
 */
export type InferRouteRequest<TSchema extends RouteSchemaInput | undefined> = FastifyRequest<{
    Body: TSchema extends { body: infer TBody }
        ? TBody extends ZodTypeAny
            ? z.infer<TBody>
            : unknown
        : unknown;
    Params: TSchema extends { params: infer TParams }
        ? TParams extends ZodTypeAny
            ? z.infer<TParams>
            : unknown
        : unknown;
    Querystring: TSchema extends { querystring: infer TQuery }
        ? TQuery extends ZodTypeAny
            ? z.infer<TQuery>
            : unknown
        : unknown;
    Headers: TSchema extends { headers: infer THeaders }
        ? THeaders extends ZodTypeAny
            ? z.infer<THeaders>
            : unknown
        : unknown;
}>;

/**
 * File-based route handler signature.
 */
export type RouteHandler = (
    req: FastifyRequest,
    res: FastifyReply
) => Promise<unknown> | unknown;

type RoutePreHandlerOption = preHandlerHookHandler | preHandlerHookHandler[];

type DefineRouteBaseOptions<TSchema extends RouteSchemaInput | undefined> = {
    preHandler?: RoutePreHandlerOption;
    schema?: TSchema;
};

/**
 * Declarative route definition returned by {@link defineRoute}.
 */
export interface RouteDefinition {
    kind: "route";
    handler: RouteHandler;
    preHandlers: preHandlerHookHandler[];
    schema?: RouteSchema;
}

type DefineRouteHandler<TSchema extends RouteSchemaInput | undefined> = (
    req: InferRouteRequest<TSchema>,
    res: FastifyReply
) => Promise<unknown> | unknown;

/**
 * Options accepted by {@link defineRoute}.
 */
export type DefineRouteOptions<TSchema extends RouteSchemaInput | undefined = RouteSchemaInput | undefined> =
    | DefineRouteBaseOptions<TSchema> & {
        data: unknown;
        handler?: never;
    }
    | DefineRouteBaseOptions<TSchema> & {
        data?: never;
        handler: DefineRouteHandler<TSchema>;
    };

/**
 * Normalizes optional preHandler values into a Fastify preHandler array.
 *
 * @param preHandler Single preHandler or preHandler list
 * @returns Normalized preHandler array
 */
function normalizePreHandlers(preHandler?: RoutePreHandlerOption): preHandlerHookHandler[] {
    if (!preHandler) {
        return [];
    }

    return Array.isArray(preHandler) ? preHandler : [preHandler];
}

/**
 * Declares a file-based HTTP route handler.
 *
 * @param options Route handler options or static response data
 * @returns Registered route definition metadata
 */
export function defineRoute<const TSchema extends RouteSchemaInput | undefined>(
    options: DefineRouteOptions<TSchema>
): RouteDefinition {
    const preHandlers = normalizePreHandlers(options.preHandler);
    const schema = options.schema ? resolveRouteSchema(options.schema) : undefined;

    if ("data" in options) {
        return {
            kind: "route",
            preHandlers,
            schema,
            handler: () => options.data
        };
    }

    return {
        kind: "route",
        preHandlers,
        schema,
        handler: options.handler as RouteHandler
    };
}

/**
 * Returns whether a module export is a route definition.
 *
 * @param value Candidate export value
 * @returns Whether the value is a route definition
 */
export function isRouteDefinition(value: unknown): value is RouteDefinition {
    return typeof value === "object"
        && value !== null
        && "kind" in value
        && (value as RouteDefinition).kind === "route"
        && typeof (value as RouteDefinition).handler === "function";
}
