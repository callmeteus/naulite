import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Active admin browser session row (token stored hashed).
 */
@Table({ tableName: "admin_sessions", timestamps: false })
export class AdminSessionModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "user_id" })
    declare userId: string;

    @Column({ type: DataType.STRING, field: "token_hash" })
    declare tokenHash: string;

    @Column({ type: DataType.STRING, field: "expires_at" })
    declare expiresAt: string;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "revoked_at" })
    declare revokedAt: string | null;
}
