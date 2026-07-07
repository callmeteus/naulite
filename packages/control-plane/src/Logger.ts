import { Logger as CoreLogger } from "@naulite/logger";

const SERVICE = "control-plane";

/**
 * Control plane logger factory.
 */
export namespace Logger {
    /**
     * Creates a module logger for the control plane service.
     *
     * @param name Module logger name
     * @returns Configured Winston logger
     */
    export function create(name: string) {
        return CoreLogger.create(SERVICE, name);
    }
}
