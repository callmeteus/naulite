import { randomUUID } from "node:crypto";

import type { GatewayRoute, Ingress } from "@platform/shared";
import type { TraefikNetBirdGatewayProvider } from "@platform/gateway";

import { GatewayRouteModel } from "../database/models/index";
import { ControlPlaneSync } from "./ControlPlaneSync";
import type { LeaderElection } from "./LeaderElection";

/**
 * Persisted gateway route row mapped to the shared contract.
 */
export interface StoredGatewayRoute {
    id: string;
    serviceName: string;
    host: string;
    targetHost: string;
    targetPort: number;
    ingress: Ingress;
    autoTls: boolean;
    createdAt: string;
    updatedAt: string;
}

/**
 * Persists gateway routes in the database and publishes them to Traefik on the leader.
 */
export class GatewayRouteService {
    /**
     * Creates a gateway route service.
     *
     * @param traefikProvider Traefik gateway provider used for dynamic config pushes
     * @param leaderElection Leader election service
     * @param controlPlaneSync Control plane sync bus for HA invalidation
     */
    constructor(
        private readonly traefikProvider: TraefikNetBirdGatewayProvider,
        private readonly leaderElection: LeaderElection,
        private readonly controlPlaneSync: ControlPlaneSync
    ) {}

    /**
     * Lists all persisted gateway routes.
     *
     * @returns Stored gateway routes
     */
    async listRoutes(): Promise<StoredGatewayRoute[]> {
        const rows = await GatewayRouteModel.findAll({
            order: [["updatedAt", "DESC"]]
        });

        return rows.map((row) => this.mapRow(row.get({ plain: true }) as GatewayRouteModel));
    }

    /**
     * Persists and optionally publishes a gateway route.
     *
     * @param route Gateway route definition
     * @returns Stored route metadata
     */
    async upsertRoute(route: GatewayRoute): Promise<StoredGatewayRoute> {
        const now = new Date().toISOString();
        const host = route.ingress.host;
        const existing = await GatewayRouteModel.findOne({
            where: {
                serviceName: route.serviceName,
                host
            }
        });
        const autoTls = route.ingress.tls?.enabled ?? false;
        const record = {
            id: existing?.id ?? randomUUID(),
            serviceName: route.serviceName,
            host,
            targetHost: route.targetHost,
            targetPort: route.targetPort,
            ingress: route.ingress as unknown as Record<string, unknown>,
            autoTls,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now
        };

        if (existing) {
            await GatewayRouteModel.update(record, { where: { id: record.id } });
        } else {
            await GatewayRouteModel.create(record);
        }

        console.debug(
            "[gateway] persisted route service=%s host=%s target=%s:%d",
            route.serviceName,
            host,
            route.targetHost,
            route.targetPort
        );

        await this.publishRoutesIfLeader();
        await this.controlPlaneSync.publish(ControlPlaneSync.EVENTS.GATEWAY_ROUTE_CHANGED, {
            serviceName: route.serviceName,
            host
        });

        return this.mapRow(record);
    }

    /**
     * Removes a persisted gateway route.
     *
     * @param serviceName Service name associated with the route
     * @param host Ingress host name
     * @returns Whether a route was removed
     */
    async removeRoute(serviceName: string, host: string): Promise<boolean> {
        const deleted = await GatewayRouteModel.destroy({
            where: {
                serviceName,
                host
            }
        });

        if (deleted === 0) {
            return false;
        }

        console.debug("[gateway] removed route service=%s host=%s", serviceName, host);
        await this.publishRoutesIfLeader();
        await this.controlPlaneSync.publish(ControlPlaneSync.EVENTS.GATEWAY_ROUTE_CHANGED, {
            serviceName,
            host
        });

        return true;
    }

    /**
     * Requests automatic TLS for a host and persists the flag on matching routes.
     *
     * @param host Host name to secure
     * @returns Nothing.
     */
    async requestAutoTls(host: string): Promise<void> {
        const rows = await GatewayRouteModel.findAll({ where: { host } });

        for (const row of rows) {
            await GatewayRouteModel.update(
                {
                    autoTls: true,
                    updatedAt: new Date().toISOString()
                },
                { where: { id: row.id } }
            );
        }

        if (this.leaderElection.isLeader()) {
            await this.traefikProvider.requestAutoTls(host);
        }
    }

    /**
     * Loads all routes from the database and pushes them to Traefik when this instance is leader.
     *
     * @returns Nothing.
     */
    async hydrateFromDatabase(): Promise<void> {
        await this.publishRoutesIfLeader();
    }

    /**
     * Reloads Traefik from the database without requiring a route mutation.
     *
     * @returns Nothing.
     */
    async reloadFromDatabase(): Promise<void> {
        await this.publishRoutesIfLeader();
    }

    /**
     * Pushes all persisted routes to Traefik when this instance is the elected leader.
     *
     * @returns Nothing.
     */
    private async publishRoutesIfLeader(): Promise<void> {
        if (!this.leaderElection.isLeader()) {
            console.debug("[gateway] skip traefik push reason=not_leader");
            return;
        }

        const routes = await this.listRoutes();
        const gatewayRoutes = routes.map((route) => ({
            serviceName: route.serviceName,
            ingress: route.ingress,
            targetHost: route.targetHost,
            targetPort: route.targetPort
        }));

        await this.traefikProvider.syncRoutes(gatewayRoutes);

        for (const route of routes.filter((entry) => entry.autoTls)) {
            await this.traefikProvider.requestAutoTls(route.host);
        }

        console.debug("[gateway] traefik sync routes=%d", gatewayRoutes.length);
    }

    /**
     * Maps a persisted gateway route row into the stored contract.
     *
     * @param row Gateway route row fields
     * @returns Stored gateway route
     */
    private mapRow(row: {
        id: string;
        serviceName: string;
        host: string;
        targetHost: string;
        targetPort: number;
        ingress: Record<string, unknown>;
        autoTls: boolean;
        createdAt: string;
        updatedAt: string;
    }): StoredGatewayRoute {
        return {
            id: row.id,
            serviceName: row.serviceName,
            host: row.host,
            targetHost: row.targetHost,
            targetPort: row.targetPort,
            ingress: row.ingress as Ingress,
            autoTls: Boolean(row.autoTls),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    }
}
