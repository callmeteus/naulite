import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Ephemeral Incus clone row for sandbox jobs and warm pool.
 */
@Table({ tableName: "sandbox_instances", timestamps: false })
export class SandboxInstanceModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "parent_id" })
    declare parentId: string;

    @Column({ type: DataType.STRING, field: "run_id" })
    declare runId: string | null;

    @Column({ type: DataType.STRING, field: "incus_name" })
    declare incusName: string;

    @Column(DataType.STRING)
    declare kind: string;

    @Column(DataType.STRING)
    declare status: string;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "destroyed_at" })
    declare destroyedAt: string | null;
}
