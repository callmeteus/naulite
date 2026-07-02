import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Historical log rotation run row dispatched to agents.
 */
@Table({ tableName: "log_rotation_runs", timestamps: false })
export class LogRotationRunModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "instance_id" })
    declare instanceId: string;

    @Column({ type: DataType.STRING, field: "service_name" })
    declare serviceName: string;

    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string;

    @Column(DataType.STRING)
    declare status: string;

    @Default({})
    @Column(DataType.JSON)
    declare payload: Record<string, unknown>;

    @Column({ type: DataType.STRING, field: "started_at" })
    declare startedAt: string | null;

    @Column({ type: DataType.STRING, field: "completed_at" })
    declare completedAt: string | null;

    @Default([])
    @Column({ type: DataType.JSON, field: "rotated_files" })
    declare rotatedFiles: string[];

    @Column({ type: DataType.STRING, field: "error_message" })
    declare errorMessage: string | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;
}
