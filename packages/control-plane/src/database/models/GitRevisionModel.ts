import { Column, DataType, Default, Model, PrimaryKey, Table } from "sequelize-typescript";

/**
 * Git revision history row for applied manifests.
 */
@Table({ tableName: "git_revisions", timestamps: false })
export class GitRevisionModel extends Model {
    @PrimaryKey
    @Column(DataType.STRING)
    declare id: string;

    @Column({ type: DataType.STRING, field: "repository_url" })
    declare repositoryUrl: string;

    @Column(DataType.STRING)
    declare branch: string;

    @Column({ type: DataType.STRING, field: "commit_sha" })
    declare commitSha: string;

    @Column({ type: DataType.STRING, field: "manifest_name" })
    declare manifestName: string;

    @Column({ type: DataType.TEXT, field: "manifest_yaml" })
    declare manifestYaml: string;

    @Default([])
    @Column({ type: DataType.JSON, field: "overlay_paths" })
    declare overlayPaths: string[];

    @Default([])
    @Column({ type: DataType.JSON, field: "child_manifests" })
    declare childManifests: unknown[];

    @Column({ type: DataType.STRING, field: "applied_at" })
    declare appliedAt: string;

    @Column({ type: DataType.STRING, field: "rolled_back_from_id" })
    declare rolledBackFromId: string | null;
}
