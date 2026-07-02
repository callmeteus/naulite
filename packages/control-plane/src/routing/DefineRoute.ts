import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

/**
 * Supported HTTP methods for file-based routes.
 */
export type RouteHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * File-based route handler signature.
 */
export type RouteHandler = (
    req: FastifyRequest,
    res: FastifyReply
) => Promise<unknown> | unknown;

/**
 * Declarative route definition returned by {@link defineRoute}.
 */
export interface RouteDefinition {
    kind: "route";
    handler: RouteHandler;
    preHandlers: preHandlerHookHandler[];
}

type RoutePreHandlerOption = preHandlerHookHandler | preHandlerHookHandler[];

/**
 * Options accepted by {@link defineRoute}.
 */
export type DefineRouteOptions =
    | {
        data: unknown;
        preHandler?: RoutePreHandlerOption;
        handler?: never;
    }
    | {
        data?: never;
        handler: RouteHandler;
        preHandler?: RoutePreHandlerOption;
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
export function defineRoute(options: DefineRouteOptions): RouteDefinition {
    const preHandlers = normalizePreHandlers(options.preHandler);

    if ("data" in options) {
        return {
            kind: "route",
            preHandlers,
            handler: () => options.data
        };
    }

    return {
        kind: "route",
        preHandlers,
        handler: options.handler
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
