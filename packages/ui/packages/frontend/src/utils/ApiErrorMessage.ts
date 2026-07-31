import { NauliteApiError } from "@naulite/sdk";
import { enrichApiErrorMessage, resolveKnownApiErrorI18n } from "@naulite/shared";

type TranslateFn = (key: string, params?: Record<string, unknown>) => string;
type TranslateExistsFn = (key: string) => boolean;

/**
 * Extracts the service name from a scheduling failure response.
 *
 * @param err Platform API error
 * @returns Service name when the error is a scheduling failure
 */
export function extractSchedulingServiceName(err: NauliteApiError): string | undefined {
    if (typeof err.body === "object" && err.body !== null) {
        const serviceName = (err.body as Record<string, unknown>).serviceName;

        if (typeof serviceName === "string" && serviceName.length > 0) {
            return serviceName;
        }
    }

    const eligibleMatch = err.message.match(/No eligible node found for service "([^"]+)"/i);
    const scheduleMatch = err.message.match(/No node available to schedule service "([^"]+)"/i);

    return eligibleMatch?.[1] ?? scheduleMatch?.[1];
}

/**
 * Returns whether an error represents a scheduling failure with no eligible node.
 *
 * @param err Caught error value
 * @returns True when the workload could not be placed on a node
 */
export function isNoEligibleNodeError(err: unknown): boolean {
    return err instanceof NauliteApiError && Boolean(extractSchedulingServiceName(err));
}

/**
 * Resolves a user-facing API error message in the active UI locale.
 *
 * @param err Caught error value
 * @param t Vue i18n translate function
 * @param te Optional key existence checker
 * @returns Localized message safe to show in the UI
 */
export function resolveApiErrorMessage(
    err: unknown,
    t: TranslateFn,
    te?: TranslateExistsFn
): string {
    const canTranslate = te ?? (() => true);

    if (err instanceof NauliteApiError) {
        const known = resolveKnownApiErrorI18n({
            i18n: err.i18n,
            i18nParams: err.i18nParams,
            code: err.code,
            message: err.message,
            body: err.body
        });

        if (known && canTranslate(known.i18n)) {
            return t(known.i18n, known.i18nParams ?? {});
        }

        if (/failed to fetch|fetch failed|illegal invocation/i.test(err.message)) {
            return t("errors.networkError");
        }

        if (err.status === 503 && err.code === "not_leader") {
            return t("errors.notLeader");
        }

        if (err.status === 503 && err.code === "prometheus_unavailable") {
            return t("errors.prometheusUnavailable");
        }

        const schedulingServiceName = extractSchedulingServiceName(err);

        if (schedulingServiceName) {
            return t("errors.noEligibleNode", { serviceName: schedulingServiceName });
        }

        if (err.message) {
            return enrichApiErrorMessage(err.message, err.details);
        }

        return t("errors.generic");
    }

    if (err instanceof Error) {
        if (/failed to fetch|fetch failed|illegal invocation/i.test(err.message)) {
            return t("errors.networkError");
        }

        return err.message || t("errors.generic");
    }

    return t("errors.generic");
}
