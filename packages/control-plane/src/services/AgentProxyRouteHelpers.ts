import { AgentProxyError } from "./AgentProxyService";

/**
 * HTTP helpers for routes that proxy requests to agents.
 */
export namespace AgentProxyRouteHelpers {
    /**
     * Maps agent proxy errors to HTTP responses.
     *
     * @param reply Fastify reply
     * @param err Caught error
     * @param fallbackMessage Default message for unexpected failures
     * @returns Fastify reply with error payload
     */
    export function respond(
        reply: { status: (code: number) => { send: (payload: unknown) => unknown } },
        err: unknown,
        fallbackMessage = "Falha ao encaminhar requisição ao agente."
    ) {
        if (err instanceof AgentProxyError) {
            return reply.status(err.statusCode).send({
                error: err.code,
                message: err.message
            });
        }

        return reply.status(500).send({
            error: "internal_error",
            message: fallbackMessage
        });
    }
}
