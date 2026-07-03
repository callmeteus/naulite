import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Container registry image metadata row.
 */
@Table({ tableName: "container_registry_images", timestamps: false })
export class ContainerRegistryImageModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare name: string;

    @PrimaryKey
    @Column(DataType.STRING)
    declare tag: string;

    @Column(DataType.STRING)
    declare digest: string;

    @Column({ type: DataType.INTEGER, field: "size_bytes" })
    declare sizeBytes: number;

    @Column(DataType.JSON)
    declare destination: Record<string, unknown>;

    @Column(DataType.STRING)
    declare location: string;

    @Column({ type: DataType.STRING, field: "pushed_at" })
    declare pushedAt: string;
}
