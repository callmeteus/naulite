import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Historical function invocation run row dispatched to agents.
 */
@Table({ tableName: "function_runs", timestamps: false })
export class FunctionRunModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "service_id" })
    declare serviceId: string;

    @Column({ type: DataType.STRING, field: "service_name" })
    declare serviceName: string;

    @Column({ type: DataType.STRING, field: "manifest_name" })
    declare manifestName: string;

    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string;

    @Column(DataType.STRING)
    declare status: string;

    @Column(DataType.STRING)
    declare source: string;

    @Column({ type: DataType.INTEGER, field: "exit_code" })
    declare exitCode: number | null;

    @Column(DataType.TEXT)
    declare logs: string | null;

    @Default({})
    @Column(DataType.JSON)
    declare payload: Record<string, unknown>;

    @Column({ type: DataType.STRING, field: "started_at" })
    declare startedAt: string | null;

    @Column({ type: DataType.STRING, field: "completed_at" })
    declare completedAt: string | null;

    @Column({ type: DataType.INTEGER, field: "duration_ms" })
    declare durationMs: number | null;

    @Column({ type: DataType.STRING, field: "error_message" })
    declare errorMessage: string | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;
}

