import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Panel-generated API key row (hashed at rest).
 */
@Table({ tableName: "api_keys", timestamps: false })
export class ApiKeyModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare name: string;

    @Column(DataType.STRING)
    declare prefix: string;

    @Column({ type: DataType.STRING, field: "key_hash" })
    declare keyHash: string;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "last_used_at" })
    declare lastUsedAt: string | null;

    @Column({ type: DataType.STRING, field: "revoked_at" })
    declare revokedAt: string | null;

    @Column({ type: DataType.STRING, field: "tenant_id" })
    declare tenantId: string | null;

    @Column({ type: DataType.STRING, field: "previous_key_hash" })
    declare previousKeyHash: string | null;

    @Column({ type: DataType.STRING, field: "rotation_grace_until" })
    declare rotationGraceUntil: string | null;
}
