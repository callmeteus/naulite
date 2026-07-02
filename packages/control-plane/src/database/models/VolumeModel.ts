import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Persistent volume row tracked by the control plane.
 */
@Table({ tableName: "volumes", timestamps: false })
export class VolumeModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare name: string;

    @Column({ type: DataType.STRING, field: "manifest_name" })
    declare manifestName: string;

    @Default("cluster")
    @Column(DataType.STRING)
    declare scope: string;

    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string | null;

    @Column({ type: DataType.STRING, field: "mount_path" })
    declare mountPath: string;

    @Column({ type: DataType.INTEGER, field: "size_mb" })
    declare sizeMb: number | null;

    @Column(DataType.STRING)
    declare status: string;

    @Column(DataType.JSON)
    declare backup: Record<string, unknown> | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
