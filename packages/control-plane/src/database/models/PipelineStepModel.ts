import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Ordered step inside a pipeline run.
 */
@Table({ tableName: "pipeline_steps", timestamps: false })
export class PipelineStepModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "run_id" })
    declare runId: string;

    @Column(DataType.STRING)
    declare name: string;

    @Column(DataType.INTEGER)
    declare order: number;

    @Column(DataType.STRING)
    declare status: string;

    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string | null;

    @Column(DataType.STRING)
    declare pool: string | null;

    @Column({ type: DataType.STRING, field: "started_at" })
    declare startedAt: string | null;

    @Column({ type: DataType.STRING, field: "completed_at" })
    declare completedAt: string | null;

    @Column({ type: DataType.INTEGER, field: "exit_code" })
    declare exitCode: number | null;

    @Column({ type: DataType.TEXT, field: "log_text" })
    declare logText: string | null;
}
