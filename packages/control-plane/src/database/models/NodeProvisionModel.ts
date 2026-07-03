import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Node provision request row tracked by the control plane.
 */
@Table({ tableName: "node_provisions", timestamps: false })
export class NodeProvisionModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare provider: string;

    @Column({ type: DataType.STRING, field: "cloud_instance_id" })
    declare cloudInstanceId: string | null;

    @Column(DataType.STRING)
    declare status: string;

    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string | null;

    @Column({ type: DataType.STRING, field: "instance_type" })
    declare instanceType: string;

    @Column({ type: DataType.STRING, field: "ami_id" })
    declare amiId: string;

    @Default({})
    @Column(DataType.JSON)
    declare labels: Record<string, unknown>;

    @Default([])
    @Column(DataType.JSON)
    declare capabilities: string[];

    @Column(DataType.STRING)
    declare region: string | null;

    @Column(DataType.STRING)
    declare error: string | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
