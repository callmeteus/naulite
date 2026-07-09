import { ref, watch } from "vue";

/**
 * Local storage key for persisted theme preference.
 */
const STORAGE_KEY = "naulite-ui-theme";

export type AppTheme = "light" | "dark";

const theme = ref<AppTheme>("light");

/**
 * Applies the active theme to the document root.
 *
 * @param value Theme identifier
 * @returns Nothing.
 */
function applyTheme(value: AppTheme): void {
    document.documentElement.setAttribute("data-theme", value);
    localStorage.setItem(STORAGE_KEY, value);
}

/**
 * Resolves the initial theme from storage or system preference.
 *
 * @returns Resolved theme
 */
function resolveInitialTheme(): AppTheme {
    if (typeof window === "undefined") {
        return "light";
    }

    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored === "light" || stored === "dark") {
        return stored;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Applies the saved theme before Vue mounts to avoid default DaisyUI colors.
 *
 * @returns Nothing.
 */
export function initTheme(): void {
    theme.value = resolveInitialTheme();
    applyTheme(theme.value);
}

/**
 * Composable for light/dark theme switching with persistence.
 *
 * @returns Theme state and toggle helpers
 */
export function useTheme() {
    watch(theme, (value) => {
        applyTheme(value);
    });

    /**
     * Toggles between light and dark themes.
     *
     * @returns Nothing.
     */
    function toggleTheme(): void {
        theme.value = theme.value === "light" ? "dark" : "light";
    }

    /**
     * Sets the active theme explicitly.
     *
     * @param value Theme identifier
     * @returns Nothing.
     */
    function setTheme(value: AppTheme): void {
        theme.value = value;
    }

    return {
        theme,
        toggleTheme,
        setTheme
    };
}
