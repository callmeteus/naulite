import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Desired service row derived from applied manifests.
 */
@Table({ tableName: "services", timestamps: false })
export class ServiceModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare name: string;

    @Column({ type: DataType.STRING, field: "manifest_name" })
    declare manifestName: string;

    @Column(DataType.STRING)
    declare image: string;

    @Default(1)
    @Column({ type: DataType.INTEGER, field: "desired_replicas" })
    declare desiredReplicas: number;

    @Column(DataType.STRING)
    declare status: string;

    @Column(DataType.JSON)
    declare cluster: Record<string, unknown> | null;

    @Default([])
    @Column(DataType.JSON)
    declare capabilities: string[];

    @Default([])
    @Column(DataType.JSON)
    declare networks: string[];

    @Column(DataType.JSON)
    declare ingress: Record<string, unknown> | null;

    @Column({ type: DataType.JSON, field: "log_rotation" })
    declare logRotation: Record<string, unknown> | null;

    @Column({ type: DataType.STRING, field: "lifecycle_status" })
    declare lifecycleStatus: string | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
