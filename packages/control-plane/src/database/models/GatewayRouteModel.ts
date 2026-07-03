import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Persisted Traefik gateway route published by apply.
 */
@Table({ tableName: "gateway_routes", timestamps: false })
export class GatewayRouteModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "service_name" })
    declare serviceName: string;

    @Column(DataType.STRING)
    declare host: string;

    @Column({ type: DataType.STRING, field: "target_host" })
    declare targetHost: string;

    @Column({ type: DataType.INTEGER, field: "target_port" })
    declare targetPort: number;

    @Column(DataType.JSON)
    declare ingress: Record<string, unknown>;

    @Default(false)
    @Column({ type: DataType.BOOLEAN, field: "auto_tls" })
    declare autoTls: boolean;

    @Column({ type: DataType.STRING, field: "created_at" })
    declare createdAt: string;

    @Column({ type: DataType.STRING, field: "updated_at" })
    declare updatedAt: string;
}
