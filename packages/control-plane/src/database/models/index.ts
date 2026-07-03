import { ApiKeyModel } from "./ApiKeyModel";
import { BackupRunModel } from "./BackupRunModel";
import { ClusterStateModel } from "./ClusterStateModel";
import { ContainerRegistryImageModel } from "./ContainerRegistryImageModel";
import { ControlPlaneEventModel } from "./ControlPlaneEventModel";
import { ControlPlaneLeaderModel } from "./ControlPlaneLeaderModel";
import { GatewayRouteModel } from "./GatewayRouteModel";
import { GitRevisionModel } from "./GitRevisionModel";
import { InstanceModel } from "./InstanceModel";
import { LogRotationRunModel } from "./LogRotationRunModel";
import { NodeProvisionModel } from "./NodeProvisionModel";
import { NodeModel } from "./NodeModel";
import { PipelineEventModel } from "./PipelineEventModel";
import { PipelineRunModel } from "./PipelineRunModel";
import { PipelineStepModel } from "./PipelineStepModel";
import { SchemaMigrationModel } from "./SchemaMigrationModel";
import { SecretModel } from "./SecretModel";
import { ServiceModel } from "./ServiceModel";
import { VolumeModel } from "./VolumeModel";

export {
    ApiKeyModel,
    BackupRunModel,
    ClusterStateModel,
    ContainerRegistryImageModel,
    ControlPlaneEventModel,
    ControlPlaneLeaderModel,
    GatewayRouteModel,
    GitRevisionModel,
    InstanceModel,
    LogRotationRunModel,
    PipelineRunModel,
    PipelineStepModel,
    PipelineEventModel,
    NodeModel,
    NodeProvisionModel,
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
    NodeProvisionModel,
    ServiceModel,
    InstanceModel,
    VolumeModel,
    SecretModel,
    BackupRunModel,
    ContainerRegistryImageModel,
    LogRotationRunModel,
    GitRevisionModel,
    PipelineRunModel,
    PipelineStepModel,
    PipelineEventModel,
    ControlPlaneEventModel,
    ApiKeyModel,
    SchemaMigrationModel,
    ControlPlaneLeaderModel,
    ClusterStateModel,
    GatewayRouteModel
];
