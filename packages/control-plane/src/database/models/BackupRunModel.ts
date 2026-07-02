import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Historical backup run row dispatched to agents.
 */
@Table({ tableName: "backup_runs", timestamps: false })
export class BackupRunModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "volume_id" })
    declare volumeId: string;

    @Column({ type: DataType.STRING, field: "volume_name" })
    declare volumeName: string;

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

    @Column({ type: DataType.STRING, field: "error_message" })
    declare errorMessage: string | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;
}
