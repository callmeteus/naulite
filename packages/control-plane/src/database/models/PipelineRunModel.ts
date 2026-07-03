import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * High-level pipeline run row (CI build, apply, infra, node events).
 */
@Table({ tableName: "pipeline_runs", timestamps: false })
export class PipelineRunModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare kind: string;

    @Column(DataType.STRING)
    declare status: string;

    @Column({ type: DataType.STRING, field: "manifest_name" })
    declare manifestName: string | null;

    @Column({ type: DataType.STRING, field: "service_name" })
    declare serviceName: string | null;

    @Column({ type: DataType.STRING, field: "image_ref" })
    declare imageRef: string | null;

    @Column({ type: DataType.STRING, field: "commit_sha" })
    declare commitSha: string | null;

    @Column(DataType.STRING)
    declare branch: string | null;

    @Column({ type: DataType.STRING, field: "workflow_id" })
    declare workflowId: string | null;

    @Column(DataType.STRING)
    declare pool: string | null;

    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string | null;

    @Column({ type: DataType.STRING, field: "node_hostname" })
    declare nodeHostname: string | null;

    @Column({ type: DataType.STRING, field: "started_at" })
    declare startedAt: string | null;

    @Column({ type: DataType.STRING, field: "completed_at" })
    declare completedAt: string | null;

    @Column({ type: DataType.STRING, field: "error_message" })
    declare errorMessage: string | null;

    @Column({ type: DataType.TEXT, field: "failure_log" })
    declare failureLog: string | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;
}
