import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Persisted host package inventory snapshot for a node.
 */
@Table({ tableName: "host_inventories", timestamps: false })
export class HostInventoryModel extends Model {
    @PrimaryKey
    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string;

    @Column({ type: DataType.STRING, field: "package_manager" })
    declare packageManager: string;

    @Default([])
    @Column(DataType.JSON)
    declare packages: Record<string, unknown>[];

    @Column({ type: DataType.STRING, field: "collected_at" })
    declare collectedAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
