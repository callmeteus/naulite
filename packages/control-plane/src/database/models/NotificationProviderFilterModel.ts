import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Per-provider pipeline event filter configuration.
 */
@Table({ tableName: "notification_provider_filters", timestamps: false })
export class NotificationProviderFilterModel extends Model {
    @PrimaryKey
    @Column({ type: DataType.STRING, field: "provider_id" })
    declare providerId: string;

    @Column({ type: DataType.JSONB, field: "allowed_kinds" })
    declare allowedKinds: string[];

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
