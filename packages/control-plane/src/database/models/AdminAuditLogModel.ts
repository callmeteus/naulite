import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Admin audit log entry for authentication and ACL events.
 */
@Table({ tableName: "admin_audit_log", timestamps: false })
export class AdminAuditLogModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare action: string;

    @Column({ type: DataType.STRING, field: "actor_user_id" })
    declare actorUserId: string | null;

    @Column({ type: DataType.TEXT, field: "detail_json" })
    declare detailJson: string | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;
}
