import { NauliteApiError } from "@naulite/sdk";
import { enrichApiErrorMessage } from "@naulite/shared";

type TranslateFn = (key: string, params?: Record<string, unknown>) => string;
type TranslateExistsFn = (key: string) => boolean;

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
        if (err.i18n && canTranslate(err.i18n)) {
            return t(err.i18n, err.i18nParams ?? {});
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
