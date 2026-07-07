import { NauliteApiError } from "@naulite/sdk";
import { enrichApiErrorMessage } from "@naulite/shared";
import { ref } from "vue";

import { useToast } from "../stores/Toast";

export interface ParsedApiError {
    message: string;
    code?: string;
    details?: unknown;
    status?: number;
}

/**
 * Parses an unknown error into a structured API error shape.
 *
 * @param err Caught error value
 * @returns Parsed error fields
 */
export function parseApiError(err: unknown): ParsedApiError {
    if (err instanceof NauliteApiError) {
        const details = err.details;

        return {
            message: enrichApiErrorMessage(err.message, details),
            status: err.status,
            code: err.code,
            details
        };
    }

    if (err instanceof Error) {
        return { message: err.message };
    }

    return { message: String(err) };
}

/**
 * Composable for API mutations with loading, error, and toast feedback.
 *
 * @returns Action runner and state
 */
export function useApiAction() {
    const loading = ref(false);
    const error = ref<ParsedApiError | null>(null);
    const toast = useToast();

    /**
     * Runs an async API action with unified feedback.
     *
     * @param action Async operation to execute
     * @param options Success toast and error handling options
     * @returns Action result or null when failed
     */
    async function run<T>(
        action: () => Promise<T>,
        options: {
            successMessage?: string;
            showErrorToast?: boolean;
        } = {}
    ): Promise<T | null> {
        loading.value = true;
        error.value = null;

        try {
            const result = await action();

            if (options.successMessage) {
                toast.success(options.successMessage);
            }

            return result;
        } catch (err) {
            const parsed = parseApiError(err);
            error.value = parsed;

            if (options.showErrorToast !== false) {
                toast.error(parsed.message);
            }

            return null;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Clears the current error state.
     *
     * @returns Nothing.
     */
    function clearError(): void {
        error.value = null;
    }

    return {
        loading,
        error,
        run,
        clearError
    };
}
