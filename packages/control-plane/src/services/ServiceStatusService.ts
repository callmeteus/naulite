import type { Service } from "@naulite/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { Logger } from "../Logger";
import { deriveServiceStatus } from "./DeriveServiceStatus";

const logServiceStatus = Logger.create("service-status");

/**
 * Keeps service aggregate status aligned with workload instance state.
 */
export namespace ServiceStatusService {
    /**
     * Recomputes and persists the service status from its instances.
     *
     * @param serviceId Service identifier
     * @returns Updated service when found
     */
    export async function syncFromInstances(serviceId: string): Promise<Service | null> {
        const services = await ControlPlaneService.Store.listServices();
        const service = services.find((entry) => entry.id === serviceId);

        if (!service) {
            return null;
        }

        const instances = (await ControlPlaneService.Store.listInstances())
            .filter((entry) => entry.serviceId === serviceId);

        const nextStatus = deriveServiceStatus(service, instances);

        if (nextStatus === service.status) {
            return service;
        }

        const updated = await ControlPlaneService.Store.updateServiceStatus(serviceId, nextStatus);

        logServiceStatus.debug(
            "synced serviceId=%s status=%s instances=%d running=%d",
            serviceId,
            nextStatus,
            instances.length,
            instances.filter((entry) => entry.status === "running").length
        );

        return updated;
    }

    /**
     * Recomputes aggregate status for every service in the cluster.
     *
     * @returns Nothing.
     */
    export async function syncAll(): Promise<void> {
        const [services, instances] = await Promise.all([
            ControlPlaneService.Store.listServices(),
            ControlPlaneService.Store.listInstances()
        ]);

        for (const service of services) {
            const serviceInstances = instances.filter((entry) => entry.serviceId === service.id);
            const nextStatus = deriveServiceStatus(service, serviceInstances);

            if (nextStatus === service.status) {
                continue;
            }

            await ControlPlaneService.Store.updateServiceStatus(service.id, nextStatus);

            logServiceStatus.debug(
                "synced serviceId=%s status=%s instances=%d running=%d",
                service.id,
                nextStatus,
                serviceInstances.length,
                serviceInstances.filter((entry) => entry.status === "running").length
            );
        }
    }
}
