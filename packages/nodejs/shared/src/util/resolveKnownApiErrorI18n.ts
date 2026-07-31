export interface ResolvedApiErrorI18n {
    i18n: string;
    i18nParams?: Record<string, string>;
}

export interface KnownApiErrorInput {
    i18n?: string;
    i18nParams?: Record<string, string>;
    code?: string;
    message: string;
    body?: unknown;
}

/**
 * Resolves a known API error code or legacy message to an i18n key.
 *
 * @param input Error fields from an HTTP API response
 * @returns i18n key and params when recognized
 */
export function resolveKnownApiErrorI18n(input: KnownApiErrorInput): ResolvedApiErrorI18n | undefined {
    if (input.i18n) {
        return {
            i18n: input.i18n,
            i18nParams: input.i18nParams
        };
    }

    const code = input.code?.toLowerCase();
    const message = input.message;
    const body = typeof input.body === "object" && input.body !== null
        ? input.body as Record<string, unknown>
        : undefined;
    const bodyParams = typeof body?.i18nParams === "object" && body?.i18nParams !== null
        ? body.i18nParams as Record<string, string>
        : undefined;

    if (code === "internal_error") {
        return { i18n: "errors.agentForwardFailed" };
    }

    if (code === "agent_unavailable") {
        return {
            i18n: "errors.agentUrlMissing",
            i18nParams: bodyParams
        };
    }

    if (code === "agent_request_timeout") {
        return {
            i18n: "errors.agentRequestTimedOut",
            i18nParams: bodyParams
        };
    }

    if (code === "agent_request_failed") {
        return {
            i18n: "errors.agentRequestFailed",
            i18nParams: extractHttpStatusParams(message, bodyParams)
        };
    }

    if (code === "instance_not_found") {
        return {
            i18n: "errors.instanceNotFound",
            i18nParams: bodyParams
        };
    }

    if (code === "not_found" && /node/i.test(message)) {
        return {
            i18n: "errors.nodeNotFound",
            i18nParams: bodyParams
        };
    }

    if (code === "unsupported_os") {
        if (/inventory/i.test(message)) {
            return { i18n: "errors.hostInventoryUnsupportedOs" };
        }

        return { i18n: "errors.hostUpdatesUnsupportedOs" };
    }

    if (/falha ao encaminhar requisi[cç][aã]o ao agente/i.test(message)) {
        return { i18n: "errors.agentForwardFailed" };
    }

    if (/falha ao (buscar logs|executar comando|despachar tarefa|enviar arquivo|buscar arquivo de backup) do agente/i.test(message)) {
        return {
            i18n: "errors.agentRequestFailed",
            i18nParams: extractHttpStatusParams(message, bodyParams)
        };
    }

    if (/could not forward the request to the agent/i.test(message)) {
        return { i18n: "errors.agentForwardFailed" };
    }

    if (/agent request failed/i.test(message)) {
        return {
            i18n: "errors.agentRequestFailed",
            i18nParams: extractHttpStatusParams(message, bodyParams)
        };
    }

    if (/node does not expose an agent url/i.test(message)) {
        return {
            i18n: "errors.agentUrlMissing",
            i18nParams: bodyParams
        };
    }

    return undefined;
}

/**
 * Extracts an HTTP status code for agent request error interpolation.
 *
 * @param message Error message
 * @param fallbackParams Existing interpolation params
 * @returns Params with status when available
 */
function extractHttpStatusParams(
    message: string,
    fallbackParams?: Record<string, string>
): Record<string, string> | undefined {
    if (fallbackParams?.status) {
        return fallbackParams;
    }

    const match = message.match(/HTTP\s+(\d{3})/i);

    if (!match) {
        return fallbackParams;
    }

    return {
        ...fallbackParams,
        status: match[1]
    };
}
