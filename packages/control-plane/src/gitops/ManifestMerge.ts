import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * Deep-merge utilities for Compose manifest YAML overlays.
 */
export namespace ManifestMerge {
    /**
     * Merges a base manifest with an overlay using deep object merge.
     * Arrays and scalars in the overlay replace the base value.
     *
     * @param baseYaml Base manifest YAML
     * @param overlayYaml Overlay manifest YAML
     * @returns Merged YAML string
     */
    export function mergeYaml(baseYaml: string, overlayYaml: string): string {
        const base = parseYaml(baseYaml) ?? {};
        const overlay = parseYaml(overlayYaml) ?? {};
        const merged = deepMerge(base, overlay);

        return stringifyYaml(merged);
    }

    /**
     * Deep-merges two YAML-compatible values.
     *
     * @param base Base value
     * @param overlay Overlay value
     * @returns Merged value
     */
    export function deepMerge(base: unknown, overlay: unknown): unknown {
        if (overlay === null || overlay === undefined) {
            return base;
        }

        if (base === null || base === undefined) {
            return overlay;
        }

        if (Array.isArray(base) || Array.isArray(overlay)) {
            return Array.isArray(overlay) ? overlay : base;
        }

        if (!isPlainObject(base) || !isPlainObject(overlay)) {
            return overlay;
        }

        const result: Record<string, unknown> = { ...base };

        for (const [key, overlayValue] of Object.entries(overlay)) {
            if (key in result) {
                result[key] = deepMerge(result[key], overlayValue);
            } else {
                result[key] = overlayValue;
            }
        }

        return result;
    }

    /**
     * Checks whether a value is a plain object suitable for deep merge.
     *
     * @param value Candidate value
     * @returns Whether the value is a plain object
     */
    function isPlainObject(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
}
