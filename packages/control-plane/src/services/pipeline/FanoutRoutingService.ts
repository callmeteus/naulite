import type { PipelineFanoutRule } from "@naulite/shared";

/**
 * Resolved fan-out scope for a webhook push.
 */
export interface FanoutScope {
    mode: "all" | "matchLabels";
    matchLabels?: Record<string, string>;
}

/**
 * Resolves which generator items a repository push should affect.
 */
export namespace FanoutRoutingService {
    /**
     * Picks the first fan-out rule that matches the repository full name.
     *
     * @param rules Fan-out rules from the manifest
     * @param repositoryFullName Webhook repository.full_name
     * @returns Scope for coalesce key and item filter
     */
    export function resolveScope(
        rules: PipelineFanoutRule[],
        repositoryFullName: string
    ): FanoutScope | null {
        for (const rule of rules) {
            if (!repoMatches(rule.repos, repositoryFullName)) {
                continue;
            }

            if (rule.select === "all") {
                return {
                    mode: "all"
                };
            }

            const labels: Record<string, string> = {};

            for (const [key, template] of Object.entries(rule.select.matchLabels)) {
                labels[key] = applyCapture(template, rule.capture, repositoryFullName);
            }

            return {
                mode: "matchLabels",
                matchLabels: labels
            };
        }

        return null;
    }

    /**
     * Filters items after generator expansion.
     *
     * @param items All items that passed the generator selector
     * @param scope Fan-out scope
     * @returns Items that should run for this push
     */
    export function filterItems<T extends { name: string }>(
        items: T[],
        scope: FanoutScope | null
    ): T[] {
        if (!scope) {
            return items;
        }

        if (scope.mode === "all") {
            return items;
        }

        const expectedName = scope.matchLabels?.name;

        if (!expectedName) {
            return items;
        }

        return items.filter((item) => item.name === expectedName);
    }

    /**
     * Builds the coalesce scope segment.
     *
     * @param scope Fan-out scope
     * @param branch Branch name
     * @param previewSlug Optional preview slug for task manifests
     * @returns Scope string for idempotency key
     */
    export function coalesceScopeKey(
        scope: FanoutScope | null,
        _branch: string,
        previewSlug?: string
    ): string {
        if (previewSlug) {
            return previewSlug;
        }

        if (!scope || scope.mode === "all") {
            return "all";
        }

        return scope.matchLabels?.name ?? "all";
    }

    /**
     * Checks whether a repository pattern matches the full name.
     *
     * @param patterns Repo patterns (glob-like with *)
     * @param fullName Repository full name
     * @returns True when any pattern matches
     */
    function repoMatches(patterns: string[], fullName: string): boolean {
        for (const pattern of patterns) {
            const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
            if (regex.test(fullName)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Substitutes ${capture.N} in a matchLabels template.
     *
     * @param template Label template
     * @param capture Optional capture regex
     * @param fullName Repository full name
     * @returns Resolved label value
     */
    function applyCapture(
        template: string,
        capture: string | undefined,
        fullName: string
    ): string {
        if (!capture || !template.includes("${capture.")) {
            return template;
        }

        const repoName = fullName.includes("/") ? fullName.split("/")[1] : fullName;
        const match = new RegExp(capture).exec(repoName);

        if (!match) {
            return template;
        }

        return template.replace(/\$\{capture\.(\d+)\}/g, (_m, index: string) => {
            return match[Number(index)] ?? "";
        });
    }
}
