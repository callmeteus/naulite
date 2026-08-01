import type { Instance, Service, ServiceStatus } from "@naulite/shared";

const IN_PROGRESS_INSTANCE_STATUSES = new Set<Instance["status"]>([
    "pending",
    "pulling",
    "creating",
    "starting"
]);

const STOPPED_INSTANCE_STATUSES = new Set<Instance["status"]>([
    "stopping",
    "stopped",
    "removing"
]);

/**
 * Derives the aggregate service status from its workload instances.
 *
 * @param service Desired service record
 * @param instances Instances belonging to the service
 * @returns Derived service status
 */
export function deriveServiceStatus(
    service: Pick<Service, "desiredReplicas">,
    instances: Instance[]
): ServiceStatus {
    const desiredReplicas = service.desiredReplicas;

    if (desiredReplicas === 0) {
        if (instances.length === 0 || instances.every((instance) => STOPPED_INSTANCE_STATUSES.has(instance.status))) {
            return "stopped";
        }

        return "degraded";
    }

    if (instances.length === 0) {
        return "pending";
    }

    let runningCount = 0;
    let failedCount = 0;
    let inProgressCount = 0;
    let stoppedCount = 0;

    for (const instance of instances) {
        if (instance.status === "running") {
            runningCount += 1;
            continue;
        }

        if (instance.status === "failed") {
            failedCount += 1;
            continue;
        }

        if (IN_PROGRESS_INSTANCE_STATUSES.has(instance.status)) {
            inProgressCount += 1;
            continue;
        }

        if (STOPPED_INSTANCE_STATUSES.has(instance.status)) {
            stoppedCount += 1;
        }
    }

    if (failedCount > 0 && runningCount === 0) {
        return "failed";
    }

    if (runningCount >= desiredReplicas && inProgressCount === 0 && failedCount === 0) {
        return "running";
    }

    if (failedCount > 0 && runningCount > 0) {
        return "degraded";
    }

    if (runningCount > 0 || inProgressCount > 0) {
        return "deploying";
    }

    if (stoppedCount === instances.length) {
        return "stopped";
    }

    return "pending";
}
