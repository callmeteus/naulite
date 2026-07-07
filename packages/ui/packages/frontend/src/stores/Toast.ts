import { reactive } from "vue";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
    id: string;
    type: ToastType;
    message: string;
}

const state = reactive({
    toasts: [] as ToastItem[]
});

let nextId = 0;

/**
 * Global toast notification store.
 */
export function useToast() {
    /**
     * Shows a toast notification.
     *
     * @param type Toast severity
     * @param message User-visible message
     * @returns Nothing.
     */
    function show(type: ToastType, message: string): void {
        const id = String(++nextId);
        state.toasts.push({ id, type, message });

        window.setTimeout(() => {
            dismiss(id);
        }, 5000);
    }

    /**
     * Removes a toast by identifier.
     *
     * @param id Toast identifier
     * @returns Nothing.
     */
    function dismiss(id: string): void {
        const index = state.toasts.findIndex((toast) => toast.id === id);

        if (index >= 0) {
            state.toasts.splice(index, 1);
        }
    }

    /**
     * Shows a success toast.
     *
     * @param message User-visible message
     * @returns Nothing.
     */
    function success(message: string): void {
        show("success", message);
    }

    /**
     * Shows an error toast.
     *
     * @param message User-visible message
     * @returns Nothing.
     */
    function error(message: string): void {
        show("error", message);
    }

    return {
        toasts: state.toasts,
        show,
        dismiss,
        success,
        error
    };
}
