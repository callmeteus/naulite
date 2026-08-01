import type { InstanceReconcileResult, ServiceReconcileResult } from "@naulite/sdk";
import { normalizeAgentDispatchMessage } from "@naulite/shared";

type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/**
 * Returns a short instance label for operator-facing summaries.
 *
 * @param instanceId Full instance identifier
 * @param t Optional translate function for localized labels
 * @returns Service name and replica when available
 */
function formatInstanceLabel(instanceId: string, t?: TranslateFn): string {
    const colonIndex = instanceId.indexOf(":");

    if (colonIndex === -1) {
        return instanceId;
    }

    const remainder = instanceId.slice(colonIndex + 1);
    const replicaSeparator = remainder.lastIndexOf("-");

    if (replicaSeparator <= 0) {
        return remainder;
    }

    const serviceName = remainder.slice(0, replicaSeparator);
    const replica = remainder.slice(replicaSeparator + 1);

    if (t) {
        return t("pages.dispatchErrors.instanceLabel", { serviceName, replica });
    }

    return `${serviceName} (${replica})`;
}

/**
 * Translates a dispatch failure into localized UI copy when possible.
 *
 * @param message Raw dispatch failure message
 * @param t Vue i18n translate function
 * @returns Localized operator-facing message
 */
export function translateDispatchFailureMessage(message: string | undefined, t: TranslateFn): string {
    const normalized = normalizeAgentDispatchMessage(message);

    if (!normalized) {
        return t("pages.dispatchErrors.unknown");
    }

    if (/^fetch failed$|econnrefused|enotfound|could not connect to the agent/i.test(normalized)) {
        return t("pages.dispatchErrors.agentUnreachable");
    }

    if (normalized.includes("could not start or update the container")) {
        return t("pages.dispatchErrors.containerStartFailed");
    }

    if (normalized.includes("no registered agent URL")) {
        return t("pages.dispatchErrors.agentUrlMissing");
    }

    if (normalized.includes("did not respond in time")) {
        return t("pages.dispatchErrors.agentTimedOut");
    }

    if (normalized.includes("rejected the request")) {
        return t("pages.dispatchErrors.agentRejected", { detail: normalized });
    }

    if (/^docker operation failed:/i.test(normalized)) {
        return t("pages.dispatchErrors.containerStartFailed");
    }

    return normalized;
}

/**
 * Formats a single instance reconcile failure for display in the UI.
 *
 * @param result Instance reconcile outcome
 * @param fallback Fallback message when no detail is available
 * @param t Optional translate function for localized copy
 * @returns Operator-facing error message
 */
export function formatInstanceReconcileError(
    result: InstanceReconcileResult,
    fallback: string,
    t?: TranslateFn
): string {
    if (result.message) {
        return t ? translateDispatchFailureMessage(result.message, t) : (
            normalizeAgentDispatchMessage(result.message) ?? result.message
        );
    }

    const label = formatInstanceLabel(result.instanceId, t);

    return `${label}: ${result.status || fallback}`;
}

/**
 * Formats service reconcile outcomes into a single operator-facing error message.
 *
 * @param result Service reconcile outcome
 * @param fallback Fallback message when no detail is available
 * @param noTargetsMessage Message when no instances were eligible
 * @param t Optional translate function for localized copy
 * @returns Error message or null when every instance was dispatched
 */
export function formatServiceReconcileError(
    result: ServiceReconcileResult,
    fallback: string,
    noTargetsMessage: string,
    t?: TranslateFn
): string | null {
    if (result.results.length === 0) {
        return noTargetsMessage;
    }

    const problems = result.results.filter((entry) => entry.status !== "dispatched");

    if (problems.length === 0) {
        return null;
    }

    if (problems.length === 1) {
        const entry = problems[0];

        if (entry.message) {
            return t
                ? translateDispatchFailureMessage(entry.message, t)
                : normalizeAgentDispatchMessage(entry.message) ?? entry.message;
        }

        const label = formatInstanceLabel(entry.instanceId, t);

        return `${label}: ${entry.status || fallback}`;
    }

    const messages = problems.map((entry) => {
        const detail = entry.message
            ? (t
                ? translateDispatchFailureMessage(entry.message, t)
                : normalizeAgentDispatchMessage(entry.message) ?? entry.message)
            : `${entry.status}`;

        return `${formatInstanceLabel(entry.instanceId, t)}: ${detail}`;
    });

    return messages.join("; ") || fallback;
}
