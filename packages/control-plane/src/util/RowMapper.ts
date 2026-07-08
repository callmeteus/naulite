import type { ApiKey, Instance, Node, NodeProvision, Secret, Service, Volume } from "@naulite/shared";

/**
 * JSON field helpers for sqlite text columns.
 */
export namespace JsonField {
    /**
     * Serializes a value for database storage.
     * 
     * @param dialect Active database dialect
     * @param value Value to serialize
     * @returns Serialized database value
     */
    export function serialize(dialect: "sqlite" | "postgresql", value: unknown): unknown {
        if (dialect === "postgresql") {
            return value;
        }

        return JSON.stringify(value ?? null);
    }

    /**
     * Parses a database JSON value.
     * 
     * @param value Raw database value
     * @returns Parsed value
     */
    export function parse<T>(value: unknown): T {
        if (typeof value === "string") {
            return JSON.parse(value) as T;
        }

        return value as T;
    }
}

/**
 * Maps database rows into shared platform models.
 */
export namespace RowMapper {
    /**
     * Maps a node database row into a Node model.
     * 
     * @param row Database row
     * @returns Node model
     */
    export function node(row: {
        id: string;
        hostname: string;
        status: string;
        labels: unknown;
        capabilities: unknown;
        resources: unknown;
        agentVersion: string;
        agentUrl: string | null;
        netbirdDeviceId: string | null;
        lastHeartbeatAt: string;
        createdAt: string;
        updatedAt: string;
    }): Node {
        return {
            id: row.id,
            hostname: row.hostname,
            status: row.status as Node["status"],
            labels: JsonField.parse(row.labels),
            capabilities: JsonField.parse<string[]>(row.capabilities),
            resources: JsonField.parse(row.resources),
            agentVersion: row.agentVersion,
            agentUrl: row.agentUrl ?? undefined,
            netbirdDeviceId: row.netbirdDeviceId ?? undefined,
            lastHeartbeatAt: row.lastHeartbeatAt,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    }

    /**
     * Maps a service database row into a Service model.
     * 
     * @param row Database row
     * @returns Service model
     */
    export function service(row: {
        id: string;
        name: string;
        manifestName: string;
        image: string;
        desiredReplicas: number;
        status: string;
        cluster: unknown;
        capabilities: unknown;
        networks: unknown;
        ingress: unknown;
        logRotation: unknown;
        deploySpec: unknown;
        functionSpec: unknown;
        lifecycleStatus: string | null;
        createdAt: string;
        updatedAt: string;
    }): Service {
        return {
            id: row.id,
            name: row.name,
            manifestName: row.manifestName,
            image: row.image,
            desiredReplicas: row.desiredReplicas,
            status: row.status as Service["status"],
            cluster: JsonField.parse(row.cluster),
            capabilities: JsonField.parse<string[]>(row.capabilities),
            networks: JsonField.parse<string[]>(row.networks),
            ingress: JsonField.parse(row.ingress),
            logRotation: JsonField.parse(row.logRotation),
            deploySpec: JsonField.parse(row.deploySpec),
            functionSpec: JsonField.parse(row.functionSpec),
            lifecycleStatus: row.lifecycleStatus as Service["lifecycleStatus"],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    }

    /**
     * Maps an instance database row into an Instance model.
     * 
     * @param row Database row
     * @returns Instance model
     */
    export function instance(row: {
        id: string;
        serviceId: string;
        serviceName: string;
        nodeId: string;
        status: string;
        containerId: string | null;
        image: string;
        resources: unknown;
        health: unknown;
        lifecycleStatus: string | null;
        dispatchAttempts: number;
        lastDispatchedAt: string | null;
        lastError: string | null;
        createdAt: string;
        updatedAt: string;
    }): Instance {
        return {
            id: row.id,
            serviceId: row.serviceId,
            serviceName: row.serviceName,
            nodeId: row.nodeId,
            status: row.status as Instance["status"],
            containerId: row.containerId ?? undefined,
            image: row.image,
            resources: JsonField.parse(row.resources),
            health: JsonField.parse(row.health),
            lifecycleStatus: row.lifecycleStatus as Instance["lifecycleStatus"],
            dispatchAttempts: row.dispatchAttempts ?? 0,
            lastDispatchedAt: row.lastDispatchedAt ?? undefined,
            lastError: row.lastError ?? undefined,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    }

    /**
     * Maps a volume database row into a Volume model.
     * 
     * @param row Database row
     * @returns Volume model
     */
    export function volume(row: {
        id: string;
        name: string;
        manifestName: string;
        scope: string;
        nodeId: string | null;
        mountPath: string;
        sizeMb: number | null;
        status: string;
        backup: unknown;
        createdAt: string;
        updatedAt: string;
    }): Volume {
        return {
            id: row.id,
            name: row.name,
            manifestName: row.manifestName,
            scope: row.scope as Volume["scope"],
            nodeId: row.nodeId ?? undefined,
            mountPath: row.mountPath,
            sizeMb: row.sizeMb ?? undefined,
            status: row.status as Volume["status"],
            backup: JsonField.parse(row.backup),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    }

    /**
     * Maps a secret database row into a Secret model without values.
     * 
     * @param row Database row
     * @returns Secret metadata
     */
    export function secret(row: {
        id: string;
        name: string;
        keys: unknown;
        scope: string;
        serviceName: string | null;
        description: string | null;
        createdAt: string;
        updatedAt: string;
    }): Secret {
        return {
            id: row.id,
            name: row.name,
            keys: JsonField.parse<string[]>(row.keys),
            scope: row.scope as Secret["scope"],
            serviceName: row.serviceName ?? undefined,
            description: row.description ?? undefined,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    }

    /**
     * Maps an API key database row into an ApiKey model.
     * 
     * @param row Database row
     * @returns API key metadata
     */
    export function apiKey(row: {
        id: string;
        name: string;
        prefix: string;
        createdAt: string;
        lastUsedAt: string | null;
        revokedAt: string | null;
    }): ApiKey {
        return {
            id: row.id,
            name: row.name,
            prefix: row.prefix,
            createdAt: row.createdAt,
            lastUsedAt: row.lastUsedAt ?? undefined,
            revokedAt: row.revokedAt ?? undefined
        };
    }

    /**
     * Maps a node provision database row into a NodeProvision model.
     *
     * @param row Database row
     * @returns Node provision model
     */
    export function nodeProvision(row: {
        id: string;
        provider: string;
        cloudInstanceId: string | null;
        status: string;
        nodeId: string | null;
        instanceType: string;
        amiId: string;
        labels: unknown;
        capabilities: unknown;
        region: string | null;
        error: string | null;
        createdAt: string;
        updatedAt: string;
    }): NodeProvision {
        return {
            id: row.id,
            provider: row.provider,
            cloudInstanceId: row.cloudInstanceId ?? undefined,
            status: row.status as NodeProvision["status"],
            nodeId: row.nodeId ?? undefined,
            instanceType: row.instanceType,
            amiId: row.amiId,
            labels: JsonField.parse(row.labels),
            capabilities: JsonField.parse<string[]>(row.capabilities),
            region: row.region ?? undefined,
            error: row.error ?? undefined,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    }
}
