import { HTTP503Error } from "../../errors/TreatedError";

/**
 * Raised when the scheduler cannot place a service on any node.
 */
export class SchedulingFailedError extends HTTP503Error {
    /**
     * Creates a scheduling failure error.
     *
     * @param serviceName Service that could not be scheduled
     * @returns SchedulingFailedError instance
     */
    constructor(serviceName: string) {
        super(`No node available to schedule service "${serviceName}".`, {
            serviceName
        });
    }
}
