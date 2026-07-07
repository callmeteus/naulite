import { randomUUID } from "node:crypto";

import type { PipelineEventKind } from "@naulite/shared";
import type {
    CreateNotificationDestinationInput,
    NotificationDestination,
    UpdateNotificationDestinationInput
} from "@naulite/shared";

import { HTTP404Error } from "../errors/TreatedError";
import { NotificationDestinationModel } from "./models/NotificationDestinationModel";

/**
 * Internal notification destination row.
 */
export interface NotificationDestinationRecord {
    id: string;
    name: string;
    type: "SLACK" | "WEBHOOK";
    url: string;
    secret: string | null;
    enabled: boolean;
    allowedKinds: PipelineEventKind[];
    createdAt: string;
    updatedAt: string;
}

/**
 * Persists notification destinations configured through the admin panel.
 */
export namespace NotificationDestinationStore {
    /**
     * Lists every notification destination for the admin panel.
     *
     * @returns Destination summaries
     */
    export async function list(): Promise<NotificationDestination[]> {
        const rows = await NotificationDestinationModel.findAll({
            order: [["name", "ASC"]]
        });

        return rows.map((row) => toPublic(toRecord(row)));
    }

    /**
     * Lists enabled destinations used by the runtime dispatcher.
     *
     * @returns Enabled destination records
     */
    export async function listEnabled(): Promise<NotificationDestinationRecord[]> {
        const rows = await NotificationDestinationModel.findAll({
            where: { enabled: true },
            order: [["name", "ASC"]]
        });

        return rows.map((row) => toRecord(row));
    }

    /**
     * Returns a destination by identifier.
     *
     * @param id Destination identifier
     * @returns Destination record or null
     */
    export async function getById(id: string): Promise<NotificationDestinationRecord | null> {
        const row = await NotificationDestinationModel.findByPk(id);
        return row ? toRecord(row) : null;
    }

    /**
     * Creates a notification destination.
     *
     * @param input Destination payload
     * @returns Created destination summary
     */
    export async function create(input: CreateNotificationDestinationInput): Promise<NotificationDestination> {
        const now = new Date().toISOString();
        const row = await NotificationDestinationModel.create({
            id: randomUUID(),
            name: input.name.trim(),
            type: input.type,
            url: input.url.trim(),
            secret: normalizeSecret(input.secret),
            enabled: input.enabled ?? true,
            allowedKinds: input.allowedKinds ?? [],
            createdAt: now,
            updatedAt: now
        });

        return toPublic(toRecord(row));
    }

    /**
     * Updates a notification destination.
     *
     * @param id Destination identifier
     * @param input Partial destination payload
     * @returns Updated destination summary
     */
    export async function update(
        id: string,
        input: UpdateNotificationDestinationInput
    ): Promise<NotificationDestination> {
        const row = await NotificationDestinationModel.findByPk(id);

        if (!row) {
            throw new HTTP404Error(`Notification destination ${id} not found.`, {
                error: "not_found"
            });
        }

        const nextSecret = input.secret !== undefined
            ? normalizeSecret(input.secret)
            : row.secret;

        await row.update({
            name: input.name?.trim() ?? row.name,
            type: input.type ?? row.type,
            url: input.url?.trim() ?? row.url,
            secret: nextSecret,
            enabled: input.enabled ?? row.enabled,
            allowedKinds: input.allowedKinds ?? row.allowedKinds,
            updatedAt: new Date().toISOString()
        });

        return toPublic(toRecord(row));
    }

    /**
     * Deletes a notification destination.
     *
     * @param id Destination identifier
     * @returns Whether a row was deleted
     */
    export async function remove(id: string): Promise<boolean> {
        const deleted = await NotificationDestinationModel.destroy({
            where: { id }
        });

        return deleted > 0;
    }

    /**
     * Maps a Sequelize row to an internal record.
     *
     * @param row Destination row
     * @returns Internal destination record
     */
    function toRecord(row: NotificationDestinationModel): NotificationDestinationRecord {
        return {
            id: row.id,
            name: row.name,
            type: row.type as NotificationDestinationRecord["type"],
            url: row.url,
            secret: row.secret,
            enabled: row.enabled,
            allowedKinds: row.allowedKinds,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        };
    }

    /**
     * Maps an internal record to an API-safe destination payload.
     *
     * @param record Destination record
     * @returns Public destination payload
     */
    function toPublic(record: NotificationDestinationRecord): NotificationDestination {
        return {
            id: record.id,
            name: record.name,
            type: record.type,
            url: record.url,
            secretConfigured: Boolean(record.secret?.trim()),
            enabled: record.enabled,
            allowedKinds: record.allowedKinds,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    }

    /**
     * Normalizes optional secret input.
     *
     * @param secret Raw secret input
     * @returns Stored secret or null
     */
    function normalizeSecret(secret: string | undefined): string | null {
        const trimmed = secret?.trim();

        if (!trimmed) {
            return null;
        }

        return trimmed;
    }
}
