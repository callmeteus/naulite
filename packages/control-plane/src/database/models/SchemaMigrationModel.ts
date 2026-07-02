import { Column, DataType, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Tracks applied schema migrations for versioned database upgrades.
 */
@Table({ tableName: "schema_migrations", timestamps: false })
export class SchemaMigrationModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare name: string;

    @Column({ type: DataType.STRING, field: "applied_at" })
    declare appliedAt: string;
}
