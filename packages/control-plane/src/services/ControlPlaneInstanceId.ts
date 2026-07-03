import { randomUUID } from "node:crypto";

/**
 * Resolves a stable control plane instance identifier for HA coordination.
 */
export namespace ControlPlaneInstanceId {
    /**
     * Returns the configured instance id or generates a stable fallback.
     *
     * @returns Control plane instance identifier
     */
    export function resolve(): string {
        const configured = process.env.CP_INSTANCE_ID?.trim();

        if (configured) {
            return configured;
        }

        return "control-plane";
    }

    /**
     * Generates a unique instance id for tests or ephemeral processes.
     *
     * @returns Random control plane instance identifier
     */
    export function generate(): string {
        return randomUUID();
    }
}
