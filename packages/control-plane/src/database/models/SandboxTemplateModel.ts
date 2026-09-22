import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Incus parent environment registered for sandbox builds.
 */
@Table({ tableName: "sandbox_templates", timestamps: false })
export class SandboxTemplateModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string;

    @Column({ type: DataType.STRING, field: "incus_name" })
    declare incusName: string;

    @Default("base")
    @Column(DataType.STRING)
    declare snapshot: string;

    @Column({ type: DataType.STRING, field: "modules_volume" })
    declare modulesVolume: string | null;

    @Default(0)
    @Column({ type: DataType.INTEGER, field: "warm_pool_size" })
    declare warmPoolSize: number;

    @Column({ type: DataType.STRING, field: "bake_cron" })
    declare bakeCron: string | null;

    @Column({ type: DataType.STRING, field: "baked_at" })
    declare bakedAt: string | null;

    @Column({ type: DataType.INTEGER, field: "size_bytes" })
    declare sizeBytes: number | null;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
