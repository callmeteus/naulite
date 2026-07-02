import { ApiKeyModel } from "./ApiKeyModel.js";
import { BackupRunModel } from "./BackupRunModel.js";
import { ControlPlaneEventModel } from "./ControlPlaneEventModel.js";
import { GitRevisionModel } from "./GitRevisionModel.js";
import { InstanceModel } from "./InstanceModel.js";
import { LogRotationRunModel } from "./LogRotationRunModel.js";
import { NodeModel } from "./NodeModel.js";
import { SecretModel } from "./SecretModel.js";
import { ServiceModel } from "./ServiceModel.js";
import { VolumeModel } from "./VolumeModel.js";

export {
    ApiKeyModel,
    BackupRunModel,
    ControlPlaneEventModel,
    GitRevisionModel,
    InstanceModel,
    LogRotationRunModel,
    NodeModel,
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
    ApiKeyModel
];
