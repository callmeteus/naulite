import { useI18n } from "vue-i18n";

const STORAGE_KEY = "naulite-ui-locale";

export type AppLocale = "en" | "pt-BR";

/**
 * Composable for locale switching with persistence.
 *
 * @returns Locale state and setter
 */
export function useLocale() {
    const { locale } = useI18n({ useScope: "global" });

    /**
     * Sets the active locale and persists the choice.
     *
     * @param value Locale identifier
     * @returns Nothing.
     */
    function setLocale(value: AppLocale): void {
        locale.value = value;
        localStorage.setItem(STORAGE_KEY, value);
        document.documentElement.setAttribute("lang", value === "pt-BR" ? "pt-BR" : "en");
    }

    /**
     * Restores locale from storage when the app boots.
     *
     * @returns Nothing.
     */
    function restoreLocale(): void {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (stored === "en" || stored === "pt-BR") {
            setLocale(stored);
            return;
        }

        document.documentElement.setAttribute("lang", "en");
    }

    return {
        locale,
        setLocale,
        restoreLocale
    };
}
