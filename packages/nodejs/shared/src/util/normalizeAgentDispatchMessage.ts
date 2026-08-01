interface AgentDispatchJsonBody {
    accepted?: boolean;
    message?: string;
    error?: string;
    planId?: string;
}

/**
 * Known agent dispatch failure codes mapped to operator-facing English text.
 */
const KNOWN_MESSAGES: Record<string, string> = {
    "apply failed": "The node agent could not start or update the container.",
    "plan has no operations.": "The deployment plan had no steps for this node.",
    "node has no agenturl.": "This node has no registered agent URL."
};

/**
 * Normalizes raw agent HTTP bodies and dispatch errors into plain language.
 *
 * @param raw Raw message or JSON body from an agent dispatch attempt
 * @returns Operator-facing message, or undefined when empty
 */
export function normalizeAgentDispatchMessage(raw?: string | null): string | undefined {
    if (!raw) {
        return undefined;
    }

    const trimmed = raw.trim();

    if (!trimmed) {
        return undefined;
    }

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            const parsed = JSON.parse(trimmed) as AgentDispatchJsonBody;
            const nested = parsed.message ?? parsed.error;

            if (typeof nested === "string" && nested.trim()) {
                return normalizeAgentDispatchMessage(nested);
            }

            if (parsed.accepted === false) {
                return KNOWN_MESSAGES["apply failed"];
            }
        } catch {
            // Fall through to treat the payload as plain text.
        }
    }

    const known = KNOWN_MESSAGES[trimmed.toLowerCase()];

    if (known) {
        return known;
    }

    if (/^fetch failed$/i.test(trimmed)) {
        return "The control plane could not connect to the agent.";
    }

    if (/^docker operation failed:/i.test(trimmed)) {
        return trimmed;
    }

    if (/agent request timed out/i.test(trimmed)) {
        return trimmed;
    }

    if (/^fetch failed|econnrefused|enotfound|network/i.test(trimmed)) {
        return "The control plane could not connect to the agent.";
    }

    return trimmed;
}

/**
 * Formats an HTTP status and optional agent body into a dispatch failure message.
 *
 * @param httpStatus Agent HTTP status code
 * @param body Raw response body
 * @returns Operator-facing failure reason
 */
export function formatAgentHttpFailureMessage(httpStatus: number, body: string): string {
    const normalized = normalizeAgentDispatchMessage(body);

    if (normalized) {
        return normalized;
    }

    if (body.trim()) {
        return body.trim();
    }

    return `The node agent returned HTTP ${httpStatus}.`;
}
