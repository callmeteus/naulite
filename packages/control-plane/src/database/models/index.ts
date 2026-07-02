import { ApiKeyModel } from "./ApiKeyModel";
import { BackupRunModel } from "./BackupRunModel";
import { ControlPlaneEventModel } from "./ControlPlaneEventModel";
import { GitRevisionModel } from "./GitRevisionModel";
import { InstanceModel } from "./InstanceModel";
import { LogRotationRunModel } from "./LogRotationRunModel";
import { NodeModel } from "./NodeModel";
import { SchemaMigrationModel } from "./SchemaMigrationModel";
import { SecretModel } from "./SecretModel";
import { ServiceModel } from "./ServiceModel";
import { VolumeModel } from "./VolumeModel";

export {
    ApiKeyModel,
    BackupRunModel,
    ControlPlaneEventModel,
    GitRevisionModel,
    InstanceModel,
    LogRotationRunModel,
    NodeModel,
    SchemaMigrationModel,
    SecretModel,
    ServiceModel,
    VolumeModel
};

/**
 * Sequelize model registry for the control plane database.
 */
export const controlPlaneModels = [
    NodeModel,
    ServiceModel,
    InstanceModel,
    VolumeModel,
    SecretModel,
    BackupRunModel,
    LogRotationRunModel,
    GitRevisionModel,
    ControlPlaneEventModel,
    ApiKeyModel,
    SchemaMigrationModel
];
