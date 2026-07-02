import { ControlPlaneService } from "../ControlPlaneService";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    async handler() {
        const services = await ControlPlaneService.Store.listServices();

        return services
            .filter((service) => service.ingress !== undefined && service.ingress !== null)
            .map((service) => ({
                serviceName: service.name,
                hosts: service.ingress?.host ? [service.ingress.host] : [],
                tlsEnabled: service.ingress?.tls?.enabled ?? false
            }));
    }
});
