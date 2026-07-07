import { createI18n } from "vue-i18n";

import en from "./locales/en.json";
import ptBr from "./locales/pt-BR.json";

/**
 * Shared Vue i18n instance for the admin UI.
 */
export const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    messages: {
        en,
        "pt-BR": ptBr
    }
});
