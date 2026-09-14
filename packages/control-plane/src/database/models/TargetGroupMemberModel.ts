import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Explicit membership linking a node to a target group.
 */
@Table({ tableName: "target_group_members", timestamps: false })
export class TargetGroupMemberModel extends Model {
    @PrimaryKey
    @Column({ type: DataType.STRING, field: "group_id" })
    declare groupId: string;

    @PrimaryKey
    @Column({ type: DataType.STRING, field: "node_id" })
    declare nodeId: string;
}
