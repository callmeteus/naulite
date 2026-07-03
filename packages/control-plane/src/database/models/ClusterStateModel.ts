import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Shared cluster state key-value row for multi control plane coordination.
 */
@Table({ tableName: "cluster_state", timestamps: false })
export class ClusterStateModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare key: string;

    @Column(DataType.STRING)
    declare value: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
