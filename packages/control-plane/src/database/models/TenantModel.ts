import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Tenant row for multi-tenant control plane deployments.
 */
@Table({ tableName: "tenants", timestamps: false })
export class TenantModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare slug: string;

    @Column(DataType.STRING)
    declare name: string;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;

    @Column({ type: DataType.STRING, field: "disabled_at" })
    declare disabledAt: string | null;
}
