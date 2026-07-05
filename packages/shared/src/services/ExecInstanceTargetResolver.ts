import type { Instance } from "../types/Instance";

/**
 * Result of resolving an exec target to a single instance id.
 */
export type ExecInstanceTargetResolution =
    | { kind: "resolved"; instanceId: string }
    | { kind: "not_found"; message: string }
    | { kind: "ambiguous"; message: string; instanceIds: string[] };

/**
 * Resolves a CLI exec target to a concrete instance id.
 */
export namespace ExecInstanceTargetResolver {
    /**
     * Resolves a target string against the current instance list.
     *
     * @param target Instance id or service name/id
     * @param instances Cluster instances
     * @returns Resolution result
     */
    export function resolve(target: string, instances: Instance[]): ExecInstanceTargetResolution {
        const trimmed = target.trim();

        if (trimmed.length === 0) {
            return {
                kind: "not_found",
                message: "Target vazio."
            };
        }

        const exact = instances.find((entry) => entry.id === trimmed);

        if (exact) {
            return {
                kind: "resolved",
                instanceId: exact.id
            };
        }

        const runningMatches = instances.filter((entry) => {
            if (entry.status !== "running") {
                return false;
            }

            return entry.serviceName === trimmed || entry.serviceId === trimmed;
        });

        if (runningMatches.length === 0) {
            return {
                kind: "not_found",
                message: `Nenhuma instância em execução encontrada para "${trimmed}".`
            };
        }

        if (runningMatches.length === 1) {
            return {
                kind: "resolved",
                instanceId: runningMatches[0].id
            };
        }

        return {
            kind: "ambiguous",
            message: `Múltiplas instâncias em execução para "${trimmed}". Especifique o id da instância.`,
            instanceIds: runningMatches.map((entry) => entry.id)
        };
    }
}
