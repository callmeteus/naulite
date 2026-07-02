import { Column, DataType, Model, PrimaryKey, Table, Default } from "sequelize-typescript";

/**
 * Registered cluster node row.
 */
@Table({ tableName: "nodes", timestamps: false })
export class NodeModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare hostname: string;

    @Column(DataType.STRING)
    declare status: string;

    @Default({})
    @Column(DataType.JSON)
    declare labels: Record<string, unknown>;

    @Default([])
    @Column(DataType.JSON)
    declare capabilities: string[];

    @Default({})
    @Column(DataType.JSON)
    declare resources: Record<string, unknown>;

    @Column({ type: DataType.STRING, field: "agent_version" })
    declare agentVersion: string;

    @Column({ type: DataType.STRING, field: "netbird_device_id" })
    declare netbirdDeviceId: string | null;

    @Column({ type: DataType.STRING, field: "last_heartbeat_at" })
    declare lastHeartbeatAt: string;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
