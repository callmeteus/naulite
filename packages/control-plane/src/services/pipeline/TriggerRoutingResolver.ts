import type { PipelineFanoutRule } from "@naulite/shared";

import { FanoutRoutingService, type FanoutScope } from "./FanoutRoutingService";

/**
 * Resolves webhook fan-out scope and coalesce keys (generic, opaque items).
 */
export namespace TriggerRoutingResolver {
    /**
     * @returns Fan-out scope for a repository push
     */
    export function resolveScope(
        rules: PipelineFanoutRule[],
        repositoryFullName: string
    ): FanoutScope | null {
        return FanoutRoutingService.resolveScope(rules, repositoryFullName);
    }

    /**
     * @returns Coalesce scope segment for manifest + branch + fan-out
     */
    export function coalesceScopeKey(
        scope: FanoutScope | null,
        branch: string,
        previewSlug?: string
    ): string {
        return FanoutRoutingService.coalesceScopeKey(scope, branch, previewSlug);
    }

    /**
     * Builds the full coalesce idempotency key.
     *
     * @param manifestName Manifest file name
     * @param branch Git branch
     * @param scopeSegment Fan-out or preview slug segment
     * @returns Stable coalesce key
     */
    export function buildCoalesceKey(
        manifestName: string,
        branch: string,
        scopeSegment: string
    ): string {
        return `${manifestName}:${branch}:${scopeSegment}`;
    }
}
