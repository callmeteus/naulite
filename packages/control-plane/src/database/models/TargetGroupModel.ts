import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Named group of deployment targets (nodes).
 */
@Table({ tableName: "target_groups", timestamps: false })
export class TargetGroupModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column(DataType.STRING)
    declare name: string;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
