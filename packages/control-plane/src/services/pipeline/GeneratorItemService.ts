import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { PipelineGenerator, PipelineMatchExpression } from "@naulite/shared";
import { parse as parseYaml } from "yaml";

/**
 * Opaque generator item passed into jobs.
 */
export interface PipelineGeneratorItem {
    name: string;
    path: string;
    values: Record<string, unknown>;
    children: string[];
}

/**
 * Expands declarative generators into selector-filtered items.
 */
export namespace GeneratorItemService {
    /**
     * Lists child directory names that contain a values file.
     *
     * @param generator Generator definition
     * @param vars Manifest interpolation vars
     * @returns Expanded items before fan-out filtering
     */
    export function expandGenerator(
        generator: PipelineGenerator,
        vars: Record<string, string>
    ): PipelineGeneratorItem[] {
        if (!generator.git?.directories) {
            return [];
        }

        const rootPath = interpolate(generator.git.directories.path, vars);
        const exclude = new Set(generator.git.directories.exclude ?? []);
        const valuesFileName = generator.valuesFile ?? "values.yml";
        const defaultValues = generator.defaults?.values ?? {};
        const entries = readdirSync(rootPath, { withFileTypes: true });
        const items: PipelineGeneratorItem[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }

            if (exclude.has(entry.name)) {
                continue;
            }

            const itemPath = join(rootPath, entry.name);
            const valuesPath = join(itemPath, valuesFileName);

            try {
                if (!statSync(valuesPath).isFile()) {
                    continue;
                }
            } catch {
                continue;
            }

            const rawValues = parseYaml(readFileSync(valuesPath, "utf8")) as Record<string, unknown>;
            const mergedValues = deepMerge(defaultValues, rawValues);
            const children = listChildAreas(itemPath);
            const item: PipelineGeneratorItem = {
                name: entry.name,
                path: itemPath,
                values: mergedValues,
                children
            };

            if (matchesSelector(item, generator.selector, vars)) {
                items.push(item);
            }
        }

        return items;
    }

    /**
     * Finds a generator by name on the manifest pipeline.
     *
     * @param generators Generator list
     * @param name Generator name
     * @returns Generator or undefined
     */
    export function findGenerator(
        generators: PipelineGenerator[],
        name: string
    ): PipelineGenerator | undefined {
        return generators.find((generator) => generator.name === name);
    }

    /**
     * Applies matchLabels and matchExpressions to an item.
     *
     * @param item Generator item
     * @param selector Optional selector
     * @param vars Interpolation vars (BRANCH, etc.)
     * @returns Whether the item passes
     */
    function matchesSelector(
        item: PipelineGeneratorItem,
        selector: PipelineGenerator["selector"],
        vars: Record<string, string>
    ): boolean {
        if (!selector) {
            return true;
        }

        if (selector.matchLabels) {
            for (const [key, expected] of Object.entries(selector.matchLabels)) {
                const actual = readField(item, key, vars);

                if (actual !== interpolate(expected, vars)) {
                    return false;
                }
            }
        }

        if (selector.matchExpressions) {
            for (const expression of selector.matchExpressions) {
                if (!matchExpression(item, expression, vars)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Evaluates one match expression against item.values paths.
     *
     * @param item Generator item
     * @param expression Match expression
     * @param vars Interpolation vars
     * @returns Whether the expression matches
     */
    function matchExpression(
        item: PipelineGeneratorItem,
        expression: PipelineMatchExpression,
        vars: Record<string, string>
    ): boolean {
        const raw = readField(item, expression.key, vars);
        const values = (expression.values ?? []).map((value: string) => interpolate(value, vars));

        switch (expression.operator) {
            case "In":
                return values.includes(raw);
            case "NotIn":
                return !values.includes(raw);
            case "Exists":
                return raw !== "";
            case "DoesNotExist":
                return raw === "";
            default:
                return false;
        }
    }

    /**
     * Reads a dotted field from item values with optional vars fallback.
     *
     * @param item Generator item
     * @param key Dot path or simple key
     * @param vars Vars for ${BRANCH} style
     * @returns String value or empty
     */
    function readField(
        item: PipelineGeneratorItem,
        key: string,
        vars: Record<string, string>
    ): string {
        if (key.startsWith("values.")) {
            const path = key.slice("values.".length).split(".");
            let current: unknown = item.values;

            for (const segment of path) {
                if (!current || typeof current !== "object") {
                    return "";
                }

                current = (current as Record<string, unknown>)[segment];
            }

            if (current === undefined || current === null) {
                return "";
            }

            return String(current);
        }

        const fromVars = vars[key];

        if (fromVars !== undefined) {
            return fromVars;
        }

        return "";
    }

    /**
     * Lists subdirectories that look like build areas.
     *
     * @param itemPath Tenant directory path
     * @returns Area folder names
     */
    function listChildAreas(itemPath: string): string[] {
        const areas: string[] = [];
        const known = [
            "luckymaker-backend",
            "luckymaker-frontend",
            "luckymaker-admin",
            "luckymaker-design-system"
        ];

        for (const name of known) {
            try {
                const stat = statSync(join(itemPath, name));

                if (stat.isDirectory()) {
                    areas.push(name);
                }
            } catch {
                // Ignore missing area
            }
        }

        return areas;
    }

    /**
     * Deep-merges plain objects for defaults.
     *
     * @param base Base object
     * @param overlay Overlay object
     * @returns Merged object
     */
    function deepMerge(
        base: Record<string, unknown>,
        overlay: Record<string, unknown>
    ): Record<string, unknown> {
        const result: Record<string, unknown> = {
            ...base
        };

        for (const [key, value] of Object.entries(overlay)) {
            if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                result[key] &&
                typeof result[key] === "object" &&
                !Array.isArray(result[key])
            ) {
                result[key] = deepMerge(
                    result[key] as Record<string, unknown>,
                    value as Record<string, unknown>
                );
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Replaces ${VAR} tokens in a string.
     *
     * @param template Template string
     * @param vars Variable map
     * @returns Interpolated string
     */
    function interpolate(template: string, vars: Record<string, string>): string {
        return template.replace(/\$\{([^}]+)\}/g, (_match, key: string) => {
            return vars[key] ?? "";
        });
    }
}
