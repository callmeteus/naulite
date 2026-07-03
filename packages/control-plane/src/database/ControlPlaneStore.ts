import type {
    ApiKey,
    CreatedApiKey,
    Instance,
    Node,
    NodeProvision,
    Secret,
    Service,
    Volume
} from "@platform/shared";
import { randomUUID } from "node:crypto";
import { Op } from "sequelize";

import { ApiKeyCrypto } from "../auth/ApiKeyCrypto";
import { JsonField, RowMapper } from "../util/RowMapper";

import {
    ApiKeyModel,
    BackupRunModel,
    InstanceModel,
    NodeModel,
    NodeProvisionModel,
    SecretModel,
    ServiceModel,
    VolumeModel
} from "./models/index";

/**
 * Data access layer backed by Sequelize models.
 */
export class ControlPlaneStore {
    /**
     * Lists all registered nodes.
     *
     * @returns Node records
     */
    async listNodes(): Promise<Node[]> {
        const rows = await NodeModel.findAll();
        return rows.map((row) => RowMapper.node(row.get({ plain: true })));
    }

    /**
     * Finds a node by id.
     *
     * @param id Node id
     * @returns Node when found
     */
    async getNode(id: string): Promise<Node | null> {
        const row = await NodeModel.findByPk(id);
        return row ? RowMapper.node(row.get({ plain: true })) : null;
    }

    /**
     * Finds a node by hostname.
     *
     * @param hostname Node hostname
     * @returns Node when found
     */
    async getNodeByHostname(hostname: string): Promise<Node | null> {
        const row = await NodeModel.findOne({ where: { hostname } });
        return row ? RowMapper.node(row.get({ plain: true })) : null;
    }

    /**
     * Persists a node registration.
     *
     * @param node Node to store
     * @returns Nothing.
     */
    async saveNode(node: Node): Promise<void> {
        await NodeModel.upsert({
            id: node.id,
            hostname: node.hostname,
            status: node.status,
            labels: node.labels,
            capabilities: node.capabilities,
            resources: node.resources,
            agentVersion: node.agentVersion,
            agentUrl: node.agentUrl ?? null,
            netbirdDeviceId: node.netbirdDeviceId ?? null,
            lastHeartbeatAt: node.lastHeartbeatAt,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt
        });
    }

    /**
     * Updates node heartbeat telemetry.
     *
     * @param nodeId Node identifier
     * @param patch Heartbeat fields
     * @returns Updated node when found
     */
    async updateNodeHeartbeat(
        nodeId: string,
        patch: {
            status?: Node["status"];
            resources?: Node["resources"];
        }
    ): Promise<Node | null> {
        const row = await NodeModel.findByPk(nodeId);

        if (!row) {
            return null;
        }

        const now = new Date().toISOString();
        const updates: Partial<NodeModel> = {
            lastHeartbeatAt: now,
            updatedAt: now
        };

        if (patch.status) {
            updates.status = patch.status;
        }

        if (patch.resources) {
            updates.resources = patch.resources;
        }

        await row.update(updates);
        return RowMapper.node(row.get({ plain: true }));
    }

    /**
     * Lists backup run summaries.
     *
     * @returns Backup run records
     */
    async listBackupRuns(): Promise<Array<{
        id: string;
        volumeName: string;
        status: "pending" | "running" | "succeeded" | "failed";
        startedAt?: string;
        completedAt?: string;
        destination?: string;
        location?: string;
        archivePath?: string;
    }>> {
        const rows = await BackupRunModel.findAll({
            order: [["createdAt", "DESC"]]
        });

        return rows.map((row) => {
            const plain = row.get({ plain: true }) as {
                id: string;
                volumeName: string;
                status: string;
                startedAt: string | null;
                completedAt: string | null;
                payload: Record<string, unknown>;
            };

            return {
                id: plain.id,
                volumeName: plain.volumeName,
                status: plain.status as "pending" | "running" | "succeeded" | "failed",
                startedAt: plain.startedAt ?? undefined,
                completedAt: plain.completedAt ?? undefined,
                destination: typeof plain.payload.destination === "string"
                    ? plain.payload.destination
                    : typeof plain.payload.location === "string"
                        ? plain.payload.location
                        : undefined,
                location: typeof plain.payload.location === "string"
                    ? plain.payload.location
                    : undefined,
                archivePath: typeof plain.payload.archivePath === "string"
                    ? plain.payload.archivePath
                    : undefined
            };
        });
    }

    /**
     * Finds a backup run by id with the full persisted payload.
     *
     * @param id Backup run identifier
     * @returns Backup run record when found
     */
    async getBackupRun(id: string): Promise<{
        id: string;
        volumeName: string;
        status: "pending" | "running" | "succeeded" | "failed";
        startedAt?: string;
        completedAt?: string;
        payload: Record<string, unknown>;
    } | null> {
        const row = await BackupRunModel.findByPk(id);

        if (!row) {
            return null;
        }

        const plain = row.get({ plain: true }) as {
            id: string;
            volumeName: string;
            status: string;
            startedAt: string | null;
            completedAt: string | null;
            payload: Record<string, unknown>;
        };

        return {
            id: plain.id,
            volumeName: plain.volumeName,
            status: plain.status as "pending" | "running" | "succeeded" | "failed",
            startedAt: plain.startedAt ?? undefined,
            completedAt: plain.completedAt ?? undefined,
            payload: plain.payload ?? {}
        };
    }

    /**
     * Lists all services.
     *
     * @returns Service records
     */
    async listServices(): Promise<Service[]> {
        const rows = await ServiceModel.findAll();
        return rows.map((row) => RowMapper.service(row.get({ plain: true })));
    }

    /**
     * Lists all instances.
     *
     * @returns Instance records
     */
    async listInstances(): Promise<Instance[]> {
        const rows = await InstanceModel.findAll();
        return rows.map((row) => RowMapper.instance(row.get({ plain: true })));
    }

    /**
     * Lists all volumes.
     *
     * @returns Volume records
     */
    async listVolumes(): Promise<Volume[]> {
        const rows = await VolumeModel.findAll();
        return rows.map((row) => RowMapper.volume(row.get({ plain: true })));
    }

    /**
     * Lists secret metadata without secret values.
     *
     * @returns Secret metadata records
     */
    async listSecrets(): Promise<Secret[]> {
        const rows = await SecretModel.findAll();
        return rows.map((row) => RowMapper.secret(row.get({ plain: true })));
    }

    /**
     * Reads internal cluster secret values by secret name.
     *
     * @param name Cluster secret name
     * @returns Secret key-value map when found
     */
    async getClusterSecretValues(name: string): Promise<Record<string, string> | null> {
        const row = await SecretModel.findOne({ where: { name } });

        if (!row) {
            return null;
        }

        const plain = row.get({ plain: true }) as { value: unknown };
        const parsed = JsonField.parse<Record<string, string>>(plain.value);

        if (!parsed || typeof parsed !== "object") {
            return null;
        }

        return parsed;
    }

    /**
     * Upserts a cluster-scoped secret with encrypted payload values.
     *
     * @param input Secret metadata and values
     * @returns Nothing.
     */
    async upsertClusterSecret(input: {
        name: string;
        keys: string[];
        value: Record<string, string>;
        description?: string;
    }): Promise<Secret> {
        const now = new Date().toISOString();
        const existing = await SecretModel.findOne({ where: { name: input.name } });
        const id = existing?.id ?? `secret:${input.name}`;

        await SecretModel.upsert({
            id,
            name: input.name,
            keys: input.keys,
            scope: "cluster",
            serviceName: null,
            description: input.description ?? null,
            value: input.value,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now
        });

        const row = await SecretModel.findOne({ where: { name: input.name } });

        if (!row) {
            throw new Error(`Secret ${input.name} was not found after upsert.`);
        }

        return RowMapper.secret(row.get({ plain: true }));
    }

    /**
     * Upserts a service record.
     *
     * @param service Service to persist
     * @returns Nothing.
     */
    async upsertService(service: Service): Promise<void> {
        const updatedAt = new Date().toISOString();

        await ServiceModel.upsert({
            id: service.id,
            name: service.name,
            manifestName: service.manifestName,
            image: service.image,
            desiredReplicas: service.desiredReplicas,
            status: service.status,
            cluster: service.cluster ?? null,
            capabilities: service.capabilities,
            networks: service.networks,
            ingress: service.ingress ?? null,
            logRotation: service.logRotation ?? null,
            deploySpec: service.deploySpec ?? null,
            lifecycleStatus: service.lifecycleStatus ?? null,
            createdAt: service.createdAt,
            updatedAt
        });
    }

    /**
     * Inserts an instance record.
     *
     * @param instance Instance to persist
     * @returns Nothing.
     */
    async insertInstance(instance: Instance): Promise<void> {
        await InstanceModel.create({
            id: instance.id,
            serviceId: instance.serviceId,
            serviceName: instance.serviceName,
            nodeId: instance.nodeId,
            status: instance.status,
            containerId: instance.containerId ?? null,
            image: instance.image,
            resources: instance.resources ?? null,
            health: instance.health ?? null,
            lifecycleStatus: instance.lifecycleStatus ?? null,
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
        await VolumeModel.create({
            id: volume.id,
            name: volume.name,
            manifestName: volume.manifestName,
            scope: volume.scope,
            nodeId: volume.nodeId ?? null,
            mountPath: volume.mountPath,
            sizeMb: volume.sizeMb ?? null,
            status: volume.status,
            backup: volume.backup ?? null,
            createdAt: volume.createdAt,
            updatedAt: volume.updatedAt
        });
    }

    /**
     * Deletes instances by id list.
     *
     * @param instanceIds Instance identifiers to remove
     * @returns Nothing.
     */
    async deleteInstances(instanceIds: string[]): Promise<void> {
        if (instanceIds.length === 0) {
            return;
        }

        await InstanceModel.destroy({
            where: {
                id: { [Op.in]: instanceIds }
            }
        });
    }

    /**
     * Deletes an instance by id.
     *
     * @param instanceId Instance identifier
     * @returns Nothing.
     */
    async deleteInstance(instanceId: string): Promise<void> {
        await InstanceModel.destroy({
            where: { id: instanceId }
        });
    }

    /**
     * Updates a volume record.
     *
     * @param volumeId Volume identifier
     * @param patch Fields to update
     * @returns Nothing.
     */
    async updateVolume(
        volumeId: string,
        patch: {
            nodeId?: string;
            status?: Volume["status"];
        }
    ): Promise<void> {
        const row = await VolumeModel.findByPk(volumeId);

        if (!row) {
            return;
        }

        const now = new Date().toISOString();
        const updates: Partial<VolumeModel> = {
            updatedAt: now
        };

        if (patch.nodeId) {
            updates.nodeId = patch.nodeId;
        }

        if (patch.status) {
            updates.status = patch.status;
        }

        await row.update(updates);
    }

    /**
     * Deletes a service by id.
     *
     * @param serviceId Service id
     * @returns Nothing.
     */
    async deleteService(serviceId: string): Promise<void> {
        await ServiceModel.destroy({
            where: { id: serviceId }
        });
        await InstanceModel.destroy({
            where: { serviceId }
        });
    }

    /**
     * Deletes a service by name.
     *
     * @param name Service name
     * @returns Whether a service was deleted
     */
    async deleteServiceByName(name: string): Promise<boolean> {
        const row = await ServiceModel.findOne({ where: { name } });

        if (!row) {
            return false;
        }

        await this.deleteService(row.id);
        return true;
    }

    /**
     * Updates an instance record.
     *
     * @param instanceId Instance identifier
     * @param patch Fields to update
     * @returns Updated instance when found
     */
    async updateInstance(
        instanceId: string,
        patch: {
            status?: Instance["status"];
            containerId?: string;
            health?: Instance["health"];
        }
    ): Promise<Instance | null> {
        const row = await InstanceModel.findByPk(instanceId);

        if (!row) {
            return null;
        }

        const now = new Date().toISOString();
        const updates: Partial<InstanceModel> = {
            updatedAt: now
        };

        if (patch.status) {
            updates.status = patch.status;
        }

        if (patch.containerId) {
            updates.containerId = patch.containerId;
        }

        if (patch.health) {
            updates.health = patch.health;
        }

        await row.update(updates);
        return RowMapper.instance(row.get({ plain: true }));
    }

    /**
     * Deletes a volume by name when it is not referenced by running instances.
     *
     * @param name Volume name
     * @returns Whether a volume was deleted
     */
    async deleteVolumeByName(name: string): Promise<boolean> {
        const row = await VolumeModel.findOne({ where: { name } });

        if (!row) {
            return false;
        }

        await VolumeModel.destroy({ where: { id: row.id } });
        return true;
    }

    /**
     * Deletes secret metadata by name.
     *
     * @param name Secret name
     * @returns Whether a secret was deleted
     */
    async deleteSecretByName(name: string): Promise<boolean> {
        const affected = await SecretModel.destroy({ where: { name } });
        return affected > 0;
    }

    /**
     * Enqueues a backup run for a volume.
     *
     * @param volumeName Volume name
     * @returns Created backup run summary
     */
    async enqueueBackupRun(volumeName: string): Promise<{
        id: string;
        volumeName: string;
        status: "pending";
        startedAt: string;
    }> {
        const now = new Date().toISOString();
        const id = randomUUID();

        await BackupRunModel.create({
            id,
            volumeName,
            status: "pending",
            startedAt: now,
            completedAt: null,
            payload: {},
            createdAt: now,
            updatedAt: now
        });

        return {
            id,
            volumeName,
            status: "pending",
            startedAt: now
        };
    }

    /**
     * Lists active API keys (metadata only).
     *
     * @returns API key metadata records
     */
    async listApiKeys(): Promise<ApiKey[]> {
        const rows = await ApiKeyModel.findAll({
            where: { revokedAt: { [Op.is]: null } }
        });
        return rows.map((row) => RowMapper.apiKey(row.get({ plain: true })));
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

        await ApiKeyModel.create(record);

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
        const [affectedCount] = await ApiKeyModel.update(
            { revokedAt: now },
            {
                where: {
                    id: apiKeyId,
                    revokedAt: { [Op.is]: null }
                }
            }
        );

        return affectedCount > 0;
    }

    /**
     * Validates a plaintext API key secret and updates last-used metadata.
     *
     * @param secret Plaintext API key from Authorization header
     * @returns Whether the key is valid and active
     */
    async validateApiKey(secret: string): Promise<boolean> {
        const agentApiKey = process.env.PLATFORM_AGENT_API_KEY?.trim();

        if (agentApiKey && agentApiKey === secret) {
            return true;
        }

        const keyHash = ApiKeyCrypto.hashSecret(secret);
        const now = new Date().toISOString();
        const row = await ApiKeyModel.findOne({
            where: {
                keyHash,
                revokedAt: { [Op.is]: null }
            }
        });

        if (!row) {
            return false;
        }

        await row.update({ lastUsedAt: now });
        return true;
    }

    /**
     * Lists all node provision requests.
     *
     * @returns Node provision records
     */
    async listNodeProvisions(): Promise<NodeProvision[]> {
        const rows = await NodeProvisionModel.findAll({
            order: [["createdAt", "DESC"]]
        });
        return rows.map((row) => RowMapper.nodeProvision(row.get({ plain: true })));
    }

    /**
     * Finds a node provision request by id.
     *
     * @param id Provision identifier
     * @returns Node provision when found
     */
    async getNodeProvision(id: string): Promise<NodeProvision | null> {
        const row = await NodeProvisionModel.findByPk(id);
        return row ? RowMapper.nodeProvision(row.get({ plain: true })) : null;
    }

    /**
     * Persists a node provision request.
     *
     * @param provision Node provision payload
     * @returns Nothing.
     */
    async saveNodeProvision(provision: NodeProvision): Promise<void> {
        await NodeProvisionModel.upsert({
            id: provision.id,
            provider: provision.provider,
            cloudInstanceId: provision.cloudInstanceId ?? null,
            status: provision.status,
            nodeId: provision.nodeId ?? null,
            instanceType: provision.instanceType,
            amiId: provision.amiId,
            labels: provision.labels,
            capabilities: provision.capabilities,
            region: provision.region ?? null,
            error: provision.error ?? null,
            createdAt: provision.createdAt,
            updatedAt: provision.updatedAt
        });
    }
}
