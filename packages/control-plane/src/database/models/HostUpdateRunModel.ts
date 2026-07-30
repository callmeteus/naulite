import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Historical host update run dispatched to an agent.
 */
@Table({ tableName: "host_update_runs", timestamps: false })
export class HostUpdateRunModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string;

    @Column(DataType.STRING)
    declare kind: string;

    @Column(DataType.STRING)
    declare status: string;

    @Default([])
    @Column(DataType.JSON)
    declare packages: string[];

    @Default(false)
    @Column({ type: DataType.BOOLEAN, field: "reboot_required" })
    declare rebootRequired: boolean;

    @Column(DataType.TEXT)
    declare stdout: string | null;

    @Column(DataType.TEXT)
    declare stderr: string | null;

    @Column({ type: DataType.STRING, field: "error_message" })
    declare errorMessage: string | null;

    @Column({ type: DataType.STRING, field: "started_at" })
    declare startedAt: string | null;

    @Column({ type: DataType.STRING, field: "completed_at" })
    declare completedAt: string | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;
}
