import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Leader lease row for HA control plane election.
 */
@Table({ tableName: "control_plane_leaders", timestamps: false })
export class ControlPlaneLeaderModel extends Model {
    @PrimaryKey
    @Column({ type: DataType.STRING, field: "lease_key" })
    declare leaseKey: string;

    @Column({ type: DataType.STRING, field: "leader_instance_id" })
    declare leaderInstanceId: string;

    @Column({ type: DataType.STRING, field: "expires_at" })
    declare expiresAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
