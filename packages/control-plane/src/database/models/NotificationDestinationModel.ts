import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

import type { PipelineEventKind } from "@naulite/shared";

/**
 * Notification destination row configured through the admin panel.
 */
@Table({ tableName: "notification_destinations", timestamps: false })
export class NotificationDestinationModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare name: string;

    @Column(DataType.STRING)
    declare type: string;

    @Column(DataType.STRING)
    declare url: string;

    @Column({ type: DataType.STRING, allowNull: true })
    declare secret: string | null;

    @Default(true)
    @Column(DataType.BOOLEAN)
    declare enabled: boolean;

    @Default([])
    @Column({ type: DataType.JSON, field: "allowed_kinds" })
    declare allowedKinds: PipelineEventKind[];

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
