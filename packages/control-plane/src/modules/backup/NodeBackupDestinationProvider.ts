import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import type { BackupDestinationReadResult, BackupDestinationResult, BackupTask, NodeBackupDestination } from "@naulite/shared";

import { Logger } from "../../Logger";
import { BackupDestinationProvider } from "./BackupDestinationProvider";
const logBackups = Logger.create("backups");

/**
 * Options for the node backup destination provider.
 */
export interface NodeBackupDestinationProviderOptions {
    nodeId: string;
    nodeRootDir: string;
}

/**
 * Node backup destination provider that stores archives on a peer node path.
 */
export class NodeBackupDestinationProvider extends BackupDestinationProvider {
    readonly id = "node";
    private readonly nodeId: string;
    private readonly nodeRootDir: string;

    /**
     * Creates a node backup destination provider.
     * 
     * @param options Node identity and storage root directory
     */
    constructor(options: NodeBackupDestinationProviderOptions) {
        super();
        this.nodeId = options.nodeId;
        this.nodeRootDir = options.nodeRootDir;
    }

    /**
     * Writes a backup archive to the configured node destination.
     * 
     * @param task Backup task resolved by the control plane
     * @param archivePath Local archive path on the agent
     * @returns Destination result metadata
     * @throws {Error} {@link Error}
     */
    async write(task: BackupTask, archivePath: string): Promise<BackupDestinationResult> {
        if (task.destination.provider !== "node") {
            throw new Error(`NodeBackupDestinationProvider cannot handle provider ${task.destination.provider}`);
        }

        const destination = task.destination as NodeBackupDestination;

        if (destination.nodeId !== this.nodeId) {
            throw new Error(`NodeBackupDestinationProvider is bound to node ${this.nodeId}`);
        }

        const destinationDir = path.join(this.nodeRootDir, destination.path);
        await mkdir(destinationDir, { recursive: true });
        const fileName = `${task.volumeName}-${task.taskId}.tar.gz`;
        const destinationPath = path.join(destinationDir, fileName);
        logBackups.debug("node write taskId=%s nodeId=%s destination=%s",
            task.taskId,
            this.nodeId,
            destinationPath
        );

        await copyFile(archivePath, destinationPath);
        const fileStat = await stat(destinationPath);

        return {
            location: destinationPath,
            sizeBytes: fileStat.size
        };
    }

    /**
     * Opens a readable stream for a node backup archive stored on this node.
     *
     * @param task Backup task containing destination configuration
     * @param location Destination-specific location identifier
     * @returns Readable backup archive stream
     * @throws {Error} {@link Error}
     */
    async read(task: BackupTask, location: string): Promise<BackupDestinationReadResult> {
        if (task.destination.provider !== "node") {
            throw new Error(`NodeBackupDestinationProvider cannot handle provider ${task.destination.provider}`);
        }

        logBackups.debug("node read location=%s", location);
        const fileStat = await stat(location);

        return {
            stream: createReadStream(location),
            sizeBytes: fileStat.size
        };
    }

    /**
     * Deletes a node backup archive.
     * 
     * @param location Destination-specific location identifier
     * @returns Nothing.
     */
    async delete(location: string): Promise<void> {
        logBackups.debug("node delete location=%s", location);
        await unlink(location);
    }

    /**
     * Validates that the node destination path is writable.
     * 
     * @param task Backup task containing destination configuration
     * @returns Whether the destination is healthy
     */
    async validate(task: BackupTask): Promise<boolean> {
        if (task.destination.provider !== "node") {
            return false;
        }

        const destination = task.destination as NodeBackupDestination;

        if (destination.nodeId !== this.nodeId) {
            return false;
        }

        try {
            const destinationDir = path.join(this.nodeRootDir, destination.path);
            await mkdir(destinationDir, { recursive: true });
            logBackups.debug("node validate nodeId=%s path=%s healthy=true", this.nodeId, destinationDir);
            return true;
        } catch (err) {
            logBackups.debug("node validate nodeId=%s healthy=false err=%o", this.nodeId, err);
            return false;
        }
    }
}

/**
 * Creates a node backup destination provider.
 * 
 * @param options Node identity and storage root directory
 * @returns Configured node backup destination provider
 */
export function createNodeBackupDestinationProvider(
    options: NodeBackupDestinationProviderOptions
): NodeBackupDestinationProvider {
    return new NodeBackupDestinationProvider(options);
}
