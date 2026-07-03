import { AutoIncrement, Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Timeline event or log line for a pipeline run.
 */
@Table({ tableName: "pipeline_events", timestamps: false })
export class PipelineEventModel extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    declare id: number;

    @Column({ type: DataType.STRING, field: "run_id" })
    declare runId: string;

    @Column({ type: DataType.STRING, field: "step_id" })
    declare stepId: string | null;

    @Column(DataType.STRING)
    declare kind: string;

    @Default("info")
    @Column(DataType.STRING)
    declare level: string;

    @Column(DataType.TEXT)
    declare message: string;

    @Column(DataType.STRING)
    declare emoji: string | null;

    @Default({})
    @Column(DataType.JSON)
    declare metadata: Record<string, unknown>;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;
}
