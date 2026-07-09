import { AdminAuditLogModel } from "./AdminAuditLogModel";
import { AdminSessionModel } from "./AdminSessionModel";
import { AdminUserModel } from "./AdminUserModel";
import { ApiKeyModel } from "./ApiKeyModel";
import { BackupRunModel } from "./BackupRunModel";
import { ClusterStateModel } from "./ClusterStateModel";
import { ContainerRegistryImageModel } from "./ContainerRegistryImageModel";
import { ControlPlaneEventModel } from "./ControlPlaneEventModel";
import { ControlPlaneLeaderModel } from "./ControlPlaneLeaderModel";
import { FunctionRunModel } from "./FunctionRunModel";
import { GatewayRouteModel } from "./GatewayRouteModel";
import { GitRevisionModel } from "./GitRevisionModel";
import { InstanceModel } from "./InstanceModel";
import { LogRotationRunModel } from "./LogRotationRunModel";
import { NodeModel } from "./NodeModel";
import { NodeProvisionModel } from "./NodeProvisionModel";
import { NotificationDestinationModel } from "./NotificationDestinationModel";
import { NotificationProviderFilterModel } from "./NotificationProviderFilterModel";
import { PipelineEventModel } from "./PipelineEventModel";
import { PipelineRunModel } from "./PipelineRunModel";
import { PipelineStepModel } from "./PipelineStepModel";
import { SchemaMigrationModel } from "./SchemaMigrationModel";
import { SecretModel } from "./SecretModel";
import { ServiceModel } from "./ServiceModel";
import { TenantModel } from "./TenantModel";
import { VolumeModel } from "./VolumeModel";

export {
    AdminAuditLogModel,
    AdminSessionModel,
    AdminUserModel,
    ApiKeyModel,
    BackupRunModel,
    ClusterStateModel,
    ContainerRegistryImageModel,
    ControlPlaneEventModel,
    ControlPlaneLeaderModel,
    FunctionRunModel,
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
    TenantModel,
    VolumeModel,
    NotificationProviderFilterModel,
    NotificationDestinationModel
};

/**
 * Sequelize model registry for the control plane database.
 */
export const controlPlaneModels = [
    AdminUserModel,
    AdminSessionModel,
    AdminAuditLogModel,
    TenantModel,
    NodeModel,
    NodeProvisionModel,
    ServiceModel,
    InstanceModel,
    VolumeModel,
    SecretModel,
    BackupRunModel,
    FunctionRunModel,
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
    GatewayRouteModel,
    NotificationProviderFilterModel,
    NotificationDestinationModel
];
