import { AutoIncrement, Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Control plane event row for multi-instance sync.
 */
@Table({ tableName: "control_plane_events", timestamps: false })
export class ControlPlaneEventModel extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    declare id: number;

    @Column({ type: DataType.STRING, field: "event_type" })
    declare eventType: string;

    @Default({})
    @Column(DataType.JSON)
    declare payload: Record<string, unknown>;

    @Column({ type: DataType.STRING, field: "source_instance_id" })
    declare sourceInstanceId: string;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;
}
