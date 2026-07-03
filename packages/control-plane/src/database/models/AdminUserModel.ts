import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Admin panel operator account.
 */
@Table({ tableName: "admin_users", timestamps: false })
export class AdminUserModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare username: string;

    @Column({ type: DataType.STRING, field: "password_hash" })
    declare passwordHash: string;

    @Column(DataType.STRING)
    declare role: string;

    @Column({ type: DataType.STRING, field: "tenant_id" })
    declare tenantId: string | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;

    @Column({ type: DataType.STRING, field: "disabled_at" })
    declare disabledAt: string | null;
}
