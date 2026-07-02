import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Running or pending service instance row.
 */
@Table({ tableName: "instances", timestamps: false })
export class InstanceModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "service_id" })
    declare serviceId: string;

    @Column({ type: DataType.STRING, field: "service_name" })
    declare serviceName: string;

    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string;

    @Column(DataType.STRING)
    declare status: string;

    @Column({ type: DataType.STRING, field: "container_id" })
    declare containerId: string | null;

    @Column(DataType.STRING)
    declare image: string;

    @Column(DataType.JSON)
    declare resources: Record<string, unknown> | null;

    @Column(DataType.JSON)
    declare health: Record<string, unknown> | null;

    @Column({ type: DataType.STRING, field: "lifecycle_status" })
    declare lifecycleStatus: string | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
