import type { Instance } from "@naulite/sdk";

import type { ParsedApiError } from "../composables/useApiAction";

const AGENT_RELATED_I18N = new Set([
    "errors.agentForwardFailed",
    "errors.agentRequestFailed",
    "errors.agentRequestTimedOut",
    "errors.agentUrlMissing",
    "errors.agentUnavailable",
    "errors.networkError"
]);

const AGENT_RELATED_TEXT = /fetch failed|agent|forward|unreachable|offline/i;

/**
 * Returns whether an instance record points to an agent connectivity problem.
 *
 * @param value Stored last error or API message
 * @returns True when the failure is agent-related
 */
export function isAgentRelatedText(value?: string | null): boolean {
    if (!value) {
        return false;
    }

    return AGENT_RELATED_TEXT.test(value);
}

/**
 * Returns whether a parsed API error is agent-related.
 *
 * @param error Parsed API error
 * @returns True when the failure is agent-related
 */
export function isAgentRelatedApiError(error: ParsedApiError | null | undefined): boolean {
    if (!error) {
        return false;
    }

    if (error.i18n && AGENT_RELATED_I18N.has(error.i18n)) {
        return true;
    }

    return isAgentRelatedText(error.message);
}

/**
 * Returns whether the instance never created a container.
 *
 * @param instance Instance record
 * @returns True when no container id is present
 */
export function instanceNeverStarted(instance: Instance): boolean {
    return !instance.containerId;
}

/**
 * Returns whether logs should be fetched automatically for an instance.
 *
 * @param instance Instance record
 * @returns True when logs may exist on the node agent
 */
export function shouldFetchInstanceLogs(instance: Instance): boolean {
    return Boolean(instance.containerId) || instance.status === "running";
}

/**
 * Resolves the primary operator-facing issue key for an instance detail page.
 *
 * @param instance Instance record
 * @returns i18n key for a single status notice, or undefined
 */
export function resolveInstanceIssueKey(instance: Instance): string | undefined {
    if (instance.status === "running") {
        return undefined;
    }

    if (instanceNeverStarted(instance) && isAgentRelatedText(instance.lastError)) {
        return "pages.instanceDetail.issueAgentOffline";
    }

    if (instance.status === "failed" && isAgentRelatedText(instance.lastError)) {
        return "pages.instanceDetail.issueAgentOffline";
    }

    if (instanceNeverStarted(instance)) {
        return "pages.instanceDetail.issueNotStarted";
    }

    if (instance.status === "failed" && instance.lastError) {
        return "pages.instanceDetail.issueFailed";
    }

    return undefined;
}
