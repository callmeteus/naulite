import type { BackupDestinationProvider, BackupDestinationResult } from "@platform/shared";
import type { BackupTask } from "@platform/shared";

import { LocalBackupDestinationProvider } from "./LocalBackupDestinationProvider.js";
import { NodeBackupDestinationProvider } from "./NodeBackupDestinationProvider.js";

/**
 * Result of a backup orchestration run.
 */
export interface BackupOrchestrationResult extends BackupDestinationResult {
    provider: string;
    taskId: string;
}

/**
 * Core backup orchestrator that routes tasks to built-in destination providers.
 */
export class BackupOrchestrator {
    private readonly providers = new Map<string, BackupDestinationProvider>();

    /**
     * Creates a backup orchestrator with built-in local and optional node providers.
     * 
     * @param nodeProvider Optional node destination provider bound to the current node
     */
    constructor(nodeProvider?: NodeBackupDestinationProvider) {
        this.providers.set("local", new LocalBackupDestinationProvider());
        if (nodeProvider) {
            this.providers.set("node", nodeProvider);
        }
    }

    /**
     * Registers an additional backup destination provider.
     * 
     * @param provider Backup destination provider to register
     * @returns Nothing.
     */
    register(provider: BackupDestinationProvider): void {
        console.debug("[backups] register provider=%s", provider.id);
        this.providers.set(provider.id, provider);
    }

    /**
     * Validates the destination configured on a backup task.
     * 
     * @param task Backup task resolved by the control plane
     * @returns Whether the destination is healthy
     */
    async validate(task: BackupTask): Promise<boolean> {
        const provider = this.resolveProvider(task);
        if (!provider) {
            console.debug("[backups] validate taskId=%s provider=missing", task.taskId);
            return false;
        }

        return provider.validate(task);
    }

    /**
     * Writes a backup archive using the task destination provider.
     * 
     * @param task Backup task resolved by the control plane
     * @param archivePath Local archive path on the agent
     * @returns Orchestration result metadata
     */
    async write(task: BackupTask, archivePath: string): Promise<BackupOrchestrationResult> {
        const provider = this.resolveProvider(task);
        if (!provider) {
            throw new Error(`No backup destination provider registered for ${task.destination.provider}`);
        }

        console.debug("[backups] write taskId=%s provider=%s", task.taskId, provider.id);
        const result = await provider.write(task, archivePath);
        return {
            ...result,
            provider: provider.id,
            taskId: task.taskId
        };
    }

    /**
     * Deletes a backup object through the provider that created it.
     * 
     * @param providerId Destination provider identifier
     * @param location Destination-specific location identifier
     * @returns Nothing.
     */
    async delete(providerId: string, location: string): Promise<void> {
        const provider = this.providers.get(providerId);
        if (!provider) {
            throw new Error(`No backup destination provider registered for ${providerId}`);
        }

        console.debug("[backups] delete provider=%s location=%s", providerId, location);
        await provider.delete(location);
    }

    /**
     * Resolves the destination provider for a backup task.
     * 
     * @param task Backup task resolved by the control plane
     * @returns Matching destination provider when registered
     */
    private resolveProvider(task: BackupTask): BackupDestinationProvider | undefined {
        return this.providers.get(task.destination.provider);
    }
}

/**
 * Creates a backup orchestrator with built-in local and optional node providers.
 * 
 * @param nodeProvider Optional node destination provider bound to the current node
 * @returns Configured backup orchestrator
 */
export function createBackupOrchestrator(nodeProvider?: NodeBackupDestinationProvider): BackupOrchestrator {
    return new BackupOrchestrator(nodeProvider);
}
