import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Cluster secret metadata row with encrypted payload.
 */
@Table({ tableName: "secrets", timestamps: false })
export class SecretModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare name: string;

    @Default([])
    @Column(DataType.JSON)
    declare keys: string[];

    @Default("cluster")
    @Column(DataType.STRING)
    declare scope: string;

    @Column({ type: DataType.STRING, field: "service_name" })
    declare serviceName: string | null;

    @Column(DataType.STRING)
    declare description: string | null;

    @Default({})
    @Column(DataType.JSON)
    declare value: Record<string, unknown>;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
