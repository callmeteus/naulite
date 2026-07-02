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
import { Op } from "sequelize";

import { ApiKeyCrypto } from "../auth/ApiKeyCrypto.js";
import { RowMapper } from "../util/RowMapper.js";

import {
    ApiKeyModel,
    InstanceModel,
    NodeModel,
    SecretModel,
    ServiceModel,
    VolumeModel
} from "./models/index.js";

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
     * Persists a node registration.
     *
     * @param node Node to store
     * @returns Nothing.
     */
    async saveNode(node: Node): Promise<void> {
        await NodeModel.create({
            id: node.id,
            hostname: node.hostname,
            status: node.status,
            labels: node.labels,
            capabilities: node.capabilities,
            resources: node.resources,
            agentVersion: node.agentVersion,
            netbirdDeviceId: node.netbirdDeviceId ?? null,
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
     * Deletes a service by id.
     *
     * @param serviceId Service id
     * @returns Nothing.
     */
    async deleteService(serviceId: string): Promise<void> {
        await ServiceModel.destroy({
            where: { id: serviceId }
        });
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
}
