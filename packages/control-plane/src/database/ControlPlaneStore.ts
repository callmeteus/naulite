import type {
    ApiKey,
    CreatedApiKey,
    Instance,
    Node,
    Secret,
    Service,
    Volume
} from "@platform/shared";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { ApiKeyCrypto } from "../auth/ApiKeyCrypto.js";

import type { DatabaseProvider } from "./DatabaseProvider.js";
import { postgresSchema } from "./schema.pg.js";
import { sqliteSchema } from "./schema.sqlite.js";
import { JsonField, RowMapper } from "../util/RowMapper.js";

/**
 * Data access layer abstracting SQLite and PostgreSQL dialect differences.
 */
export class ControlPlaneStore {
    /**
     * Creates a control plane store.
     * 
     * @param databaseProvider Connected database provider
     */
    constructor(private readonly databaseProvider: DatabaseProvider) {}

    /**
     * Lists all registered nodes.
     * 
     * @returns Node records
     */
    async listNodes(): Promise<Node[]> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = await this.databaseProvider.getPgDb().select().from(postgresSchema.nodes);
            return rows.map((row) => RowMapper.node(row));
        }

        const rows = await this.databaseProvider.getSqliteDb().select().from(sqliteSchema.nodes);
        return rows.map((row) => RowMapper.node(row));
    }

    /**
     * Finds a node by id.
     * 
     * @param id Node id
     * @returns Node when found
     */
    async getNode(id: string): Promise<Node | null> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = await this.databaseProvider.getPgDb()
                .select()
                .from(postgresSchema.nodes)
                .where(eq(postgresSchema.nodes.id, id));
            return rows[0] ? RowMapper.node(rows[0]) : null;
        }

        const rows = await this.databaseProvider.getSqliteDb()
            .select()
            .from(sqliteSchema.nodes)
            .where(eq(sqliteSchema.nodes.id, id));
        return rows[0] ? RowMapper.node(rows[0]) : null;
    }

    /**
     * Persists a node registration.
     * 
     * @param node Node to store
     * @returns Nothing.
     */
    async saveNode(node: Node): Promise<void> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            await this.databaseProvider.getPgDb().insert(postgresSchema.nodes).values({
                id: node.id,
                hostname: node.hostname,
                status: node.status,
                labels: node.labels,
                capabilities: node.capabilities,
                resources: node.resources,
                agentVersion: node.agentVersion,
                netbirdDeviceId: node.netbirdDeviceId,
                lastHeartbeatAt: node.lastHeartbeatAt,
                createdAt: node.createdAt,
                updatedAt: node.updatedAt
            });
            return;
        }

        await this.databaseProvider.getSqliteDb().insert(sqliteSchema.nodes).values({
            id: node.id,
            hostname: node.hostname,
            status: node.status,
            labels: JsonField.serialize("sqlite", node.labels) as string,
            capabilities: JsonField.serialize("sqlite", node.capabilities) as string,
            resources: JsonField.serialize("sqlite", node.resources) as string,
            agentVersion: node.agentVersion,
            netbirdDeviceId: node.netbirdDeviceId,
            lastHeartbeatAt: node.lastHeartbeatAt,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt
        });
    }

    /**
     * Lists all services.
     * 
     * @returns Service records
     */
    async listServices(): Promise<Service[]> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = await this.databaseProvider.getPgDb().select().from(postgresSchema.services);
            return rows.map((row) => RowMapper.service(row));
        }

        const rows = await this.databaseProvider.getSqliteDb().select().from(sqliteSchema.services);
        return rows.map((row) => RowMapper.service(row));
    }

    /**
     * Lists all instances.
     * 
     * @returns Instance records
     */
    async listInstances(): Promise<Instance[]> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = await this.databaseProvider.getPgDb().select().from(postgresSchema.instances);
            return rows.map((row) => RowMapper.instance(row));
        }

        const rows = await this.databaseProvider.getSqliteDb().select().from(sqliteSchema.instances);
        return rows.map((row) => RowMapper.instance(row));
    }

    /**
     * Lists all volumes.
     * 
     * @returns Volume records
     */
    async listVolumes(): Promise<Volume[]> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = await this.databaseProvider.getPgDb().select().from(postgresSchema.volumes);
            return rows.map((row) => RowMapper.volume(row));
        }

        const rows = await this.databaseProvider.getSqliteDb().select().from(sqliteSchema.volumes);
        return rows.map((row) => RowMapper.volume(row));
    }

    /**
     * Lists secret metadata without secret values.
     * 
     * @returns Secret metadata records
     */
    async listSecrets(): Promise<Secret[]> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = await this.databaseProvider.getPgDb().select().from(postgresSchema.secrets);
            return rows.map((row) => RowMapper.secret(row));
        }

        const rows = await this.databaseProvider.getSqliteDb().select().from(sqliteSchema.secrets);
        return rows.map((row) => RowMapper.secret(row));
    }

    /**
     * Upserts a service record.
     * 
     * @param service Service to persist
     * @returns Nothing.
     */
    async upsertService(service: Service): Promise<void> {
        const updatedAt = new Date().toISOString();

        if (this.databaseProvider.getDialect() === "postgresql") {
            await this.databaseProvider.getPgDb().insert(postgresSchema.services).values({
                id: service.id,
                name: service.name,
                manifestName: service.manifestName,
                image: service.image,
                desiredReplicas: service.desiredReplicas,
                status: service.status,
                cluster: service.cluster,
                capabilities: service.capabilities,
                networks: service.networks,
                ingress: service.ingress,
                logRotation: service.logRotation,
                lifecycleStatus: service.lifecycleStatus,
                createdAt: service.createdAt,
                updatedAt
            }).onConflictDoUpdate({
                target: postgresSchema.services.id,
                set: {
                    image: service.image,
                    desiredReplicas: service.desiredReplicas,
                    status: service.status,
                    cluster: service.cluster,
                    capabilities: service.capabilities,
                    networks: service.networks,
                    ingress: service.ingress,
                    logRotation: service.logRotation,
                    lifecycleStatus: service.lifecycleStatus,
                    updatedAt
                }
            });
            return;
        }

        await this.databaseProvider.getSqliteDb().insert(sqliteSchema.services).values({
            id: service.id,
            name: service.name,
            manifestName: service.manifestName,
            image: service.image,
            desiredReplicas: service.desiredReplicas,
            status: service.status,
            cluster: JsonField.serialize("sqlite", service.cluster) as string | null,
            capabilities: JsonField.serialize("sqlite", service.capabilities) as string,
            networks: JsonField.serialize("sqlite", service.networks) as string,
            ingress: JsonField.serialize("sqlite", service.ingress) as string | null,
            logRotation: JsonField.serialize("sqlite", service.logRotation) as string | null,
            lifecycleStatus: service.lifecycleStatus,
            createdAt: service.createdAt,
            updatedAt
        }).onConflictDoUpdate({
            target: sqliteSchema.services.id,
            set: {
                image: service.image,
                desiredReplicas: service.desiredReplicas,
                status: service.status,
                cluster: JsonField.serialize("sqlite", service.cluster) as string | null,
                capabilities: JsonField.serialize("sqlite", service.capabilities) as string,
                networks: JsonField.serialize("sqlite", service.networks) as string,
                ingress: JsonField.serialize("sqlite", service.ingress) as string | null,
                logRotation: JsonField.serialize("sqlite", service.logRotation) as string | null,
                lifecycleStatus: service.lifecycleStatus,
                updatedAt
            }
        });
    }

    /**
     * Inserts an instance record.
     * 
     * @param instance Instance to persist
     * @returns Nothing.
     */
    async insertInstance(instance: Instance): Promise<void> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            await this.databaseProvider.getPgDb().insert(postgresSchema.instances).values({
                id: instance.id,
                serviceId: instance.serviceId,
                serviceName: instance.serviceName,
                nodeId: instance.nodeId,
                status: instance.status,
                containerId: instance.containerId,
                image: instance.image,
                resources: instance.resources,
                health: instance.health,
                lifecycleStatus: instance.lifecycleStatus,
                createdAt: instance.createdAt,
                updatedAt: instance.updatedAt
            });
            return;
        }

        await this.databaseProvider.getSqliteDb().insert(sqliteSchema.instances).values({
            id: instance.id,
            serviceId: instance.serviceId,
            serviceName: instance.serviceName,
            nodeId: instance.nodeId,
            status: instance.status,
            containerId: instance.containerId,
            image: instance.image,
            resources: JsonField.serialize("sqlite", instance.resources) as string | null,
            health: JsonField.serialize("sqlite", instance.health) as string | null,
            lifecycleStatus: instance.lifecycleStatus,
            createdAt: instance.createdAt,
            updatedAt: instance.updatedAt
        });
    }

    /**
     * Inserts a volume record.
     * 
     * @param volume Volume to persist
     * @returns Nothing.
     */
    async insertVolume(volume: Volume): Promise<void> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            await this.databaseProvider.getPgDb().insert(postgresSchema.volumes).values({
                id: volume.id,
                name: volume.name,
                manifestName: volume.manifestName,
                scope: volume.scope,
                nodeId: volume.nodeId,
                mountPath: volume.mountPath,
                sizeMb: volume.sizeMb,
                status: volume.status,
                backup: volume.backup,
                createdAt: volume.createdAt,
                updatedAt: volume.updatedAt
            });
            return;
        }

        await this.databaseProvider.getSqliteDb().insert(sqliteSchema.volumes).values({
            id: volume.id,
            name: volume.name,
            manifestName: volume.manifestName,
            scope: volume.scope,
            nodeId: volume.nodeId,
            mountPath: volume.mountPath,
            sizeMb: volume.sizeMb,
            status: volume.status,
            backup: JsonField.serialize("sqlite", volume.backup) as string | null,
            createdAt: volume.createdAt,
            updatedAt: volume.updatedAt
        });
    }

    /**
     * Deletes a service by id.
     * 
     * @param serviceId Service id
     * @returns Nothing.
     */
    async deleteService(serviceId: string): Promise<void> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            await this.databaseProvider.getPgDb()
                .delete(postgresSchema.services)
                .where(eq(postgresSchema.services.id, serviceId));
            return;
        }

        await this.databaseProvider.getSqliteDb()
            .delete(sqliteSchema.services)
            .where(eq(sqliteSchema.services.id, serviceId));
    }

    /**
     * Lists active API keys (metadata only).
     * 
     * @returns API key metadata records
     */
    async listApiKeys(): Promise<ApiKey[]> {
        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = await this.databaseProvider.getPgDb()
                .select()
                .from(postgresSchema.apiKeys)
                .where(isNull(postgresSchema.apiKeys.revokedAt));
            return rows.map((row) => RowMapper.apiKey(row));
        }

        const rows = await this.databaseProvider.getSqliteDb()
            .select()
            .from(sqliteSchema.apiKeys)
            .where(isNull(sqliteSchema.apiKeys.revokedAt));
        return rows.map((row) => RowMapper.apiKey(row));
    }

    /**
     * Creates a new API key and returns the plaintext secret once.
     * 
     * @param name Human-readable key label from the panel
     * @returns Created key metadata plus plaintext secret
     */
    async createApiKey(name: string): Promise<CreatedApiKey> {
        const generated = ApiKeyCrypto.generate();
        const now = new Date().toISOString();
        const record = {
            id: randomUUID(),
            name,
            prefix: generated.prefix,
            keyHash: generated.keyHash,
            createdAt: now,
            lastUsedAt: null,
            revokedAt: null
        };

        if (this.databaseProvider.getDialect() === "postgresql") {
            await this.databaseProvider.getPgDb().insert(postgresSchema.apiKeys).values(record);
        } else {
            await this.databaseProvider.getSqliteDb().insert(sqliteSchema.apiKeys).values(record);
        }

        return {
            id: record.id,
            name: record.name,
            prefix: record.prefix,
            createdAt: record.createdAt,
            secret: generated.secret
        };
    }

    /**
     * Revokes an API key by id.
     * 
     * @param apiKeyId API key identifier
     * @returns Whether a key was revoked
     */
    async revokeApiKey(apiKeyId: string): Promise<boolean> {
        const now = new Date().toISOString();

        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = await this.databaseProvider.getPgDb()
                .select({ id: postgresSchema.apiKeys.id })
                .from(postgresSchema.apiKeys)
                .where(and(
                    eq(postgresSchema.apiKeys.id, apiKeyId),
                    isNull(postgresSchema.apiKeys.revokedAt)
                ));

            if (rows.length === 0) {
                return false;
            }

            await this.databaseProvider.getPgDb()
                .update(postgresSchema.apiKeys)
                .set({ revokedAt: now })
                .where(eq(postgresSchema.apiKeys.id, apiKeyId));
            return true;
        }

        const rows = await this.databaseProvider.getSqliteDb()
            .select({ id: sqliteSchema.apiKeys.id })
            .from(sqliteSchema.apiKeys)
            .where(and(
                eq(sqliteSchema.apiKeys.id, apiKeyId),
                isNull(sqliteSchema.apiKeys.revokedAt)
            ));

        if (rows.length === 0) {
            return false;
        }

        await this.databaseProvider.getSqliteDb()
            .update(sqliteSchema.apiKeys)
            .set({ revokedAt: now })
            .where(eq(sqliteSchema.apiKeys.id, apiKeyId));
        return true;
    }

    /**
     * Validates a plaintext API key secret and updates last-used metadata.
     * 
     * @param secret Plaintext API key from Authorization header
     * @returns Whether the key is valid and active
     */
    async validateApiKey(secret: string): Promise<boolean> {
        const keyHash = ApiKeyCrypto.hashSecret(secret);
        const now = new Date().toISOString();

        if (this.databaseProvider.getDialect() === "postgresql") {
            const rows = await this.databaseProvider.getPgDb()
                .select()
                .from(postgresSchema.apiKeys)
                .where(and(
                    eq(postgresSchema.apiKeys.keyHash, keyHash),
                    isNull(postgresSchema.apiKeys.revokedAt)
                ));

            if (rows.length === 0) {
                return false;
            }

            await this.databaseProvider.getPgDb()
                .update(postgresSchema.apiKeys)
                .set({ lastUsedAt: now })
                .where(eq(postgresSchema.apiKeys.id, rows[0].id));
            return true;
        }

        const rows = await this.databaseProvider.getSqliteDb()
            .select()
            .from(sqliteSchema.apiKeys)
            .where(and(
                eq(sqliteSchema.apiKeys.keyHash, keyHash),
                isNull(sqliteSchema.apiKeys.revokedAt)
            ));

        if (rows.length === 0) {
            return false;
        }

        await this.databaseProvider.getSqliteDb()
            .update(sqliteSchema.apiKeys)
            .set({ lastUsedAt: now })
            .where(eq(sqliteSchema.apiKeys.id, rows[0].id));
        return true;
    }
}
