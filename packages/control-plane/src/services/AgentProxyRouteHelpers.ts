import { AgentProxyError } from "./AgentProxyService";
import { HostPackageError } from "./HostPackageService";

type RouteErrorLike = {
    code: string;
    message: string;
    statusCode: number;
    options?: {
        i18n?: string;
        i18nParams?: Record<string, string>;
    };
};

/**
 * HTTP helpers for routes that proxy requests to agents.
 */
export namespace AgentProxyRouteHelpers {
    /**
     * Maps domain and proxy errors to HTTP responses with optional i18n keys.
     *
     * @param reply Fastify reply
     * @param err Caught error
     * @param fallbackMessage Default message for unexpected failures
     * @param fallbackI18n Default i18n key for unexpected failures
     * @returns Fastify reply with error payload
     */
    export function respond(
        reply: { status: (code: number) => { send: (payload: unknown) => unknown } },
        err: unknown,
        fallbackMessage = "Could not forward the request to the agent.",
        fallbackI18n = "errors.agentForwardFailed"
    ) {
        const mapped = mapRouteError(err);

        if (mapped) {
            return reply.status(mapped.statusCode).send({
                error: mapped.code,
                message: mapped.message,
                i18n: mapped.options?.i18n,
                i18nParams: mapped.options?.i18nParams
            });
        }

        return reply.status(500).send({
            error: "internal_error",
            message: fallbackMessage,
            i18n: fallbackI18n
        });
    }

    /**
     * Normalizes known route errors into a shared response shape.
     *
     * @param err Caught error value
     * @returns Mapped route error or undefined
     */
    function mapRouteError(err: unknown): RouteErrorLike | undefined {
        if (err instanceof AgentProxyError) {
            return {
                code: err.code,
                message: err.message,
                statusCode: err.statusCode,
                options: err.options
            };
        }

        if (err instanceof HostPackageError) {
            return {
                code: err.code,
                message: err.message,
                statusCode: err.status,
                options: err.options
            };
        }

        return undefined;
    }
}
