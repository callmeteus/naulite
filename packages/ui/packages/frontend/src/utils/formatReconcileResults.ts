import type { InstanceReconcileResult, ServiceReconcileResult } from "@naulite/sdk";

/**
 * Formats a single instance reconcile failure for display in the UI.
 *
 * @param result Instance reconcile outcome
 * @param fallback Fallback message when no detail is available
 * @returns Operator-facing error message
 */
export function formatInstanceReconcileError(
    result: InstanceReconcileResult,
    fallback: string
): string {
    if (result.message) {
        return result.message;
    }

    return `${result.instanceId}: ${result.status || fallback}`;
}

/**
 * Formats service reconcile outcomes into a single operator-facing error message.
 *
 * @param result Service reconcile outcome
 * @param fallback Fallback message when no detail is available
 * @param noTargetsMessage Message when no instances were eligible
 * @returns Error message or null when every instance was dispatched
 */
export function formatServiceReconcileError(
    result: ServiceReconcileResult,
    fallback: string,
    noTargetsMessage: string
): string | null {
    if (result.results.length === 0) {
        return noTargetsMessage;
    }

    const problems = result.results.filter((entry) => entry.status !== "dispatched");

    if (problems.length === 0) {
        return null;
    }

    const messages = problems.map((entry) => {
        if (entry.message) {
            return `${entry.instanceId}: ${entry.message}`;
        }

        return `${entry.instanceId} (${entry.status})`;
    });

    return messages.join("; ") || fallback;
}
