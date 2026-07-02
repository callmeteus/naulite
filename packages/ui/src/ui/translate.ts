import en from "./en.json";

type Messages = typeof en;

/**
 * Resolves a dot-separated translation key from the UI catalog.
 * 
 * @param key Dot-separated path into the message catalog
 * @returns Translated string or the key if missing
 */
export function t(key: string): string {
    const parts = key.split(".");
    let current: unknown = en;

    for (const part of parts) {
        if (current === null || typeof current !== "object" || !(part in current)) {
            return key;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return typeof current === "string" ? current : key;
}

/**
 * Returns the full UI message catalog.
 * 
 * @returns Message catalog object
 */
export function getCatalog(): Messages {
    return en;
}
