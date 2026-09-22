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
import { HostInventoryModel } from "./HostInventoryModel";
import { HostUpdateRunModel } from "./HostUpdateRunModel";
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
import { TargetGroupMemberModel } from "./TargetGroupMemberModel";
import { TargetGroupModel } from "./TargetGroupModel";
import { SandboxInstanceModel } from "./SandboxInstanceModel";
import { SandboxTemplateModel } from "./SandboxTemplateModel";
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
    HostInventoryModel,
    HostUpdateRunModel,
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
    TargetGroupModel,
    TargetGroupMemberModel,
    SandboxTemplateModel,
    SandboxInstanceModel,
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
    HostInventoryModel,
    HostUpdateRunModel,
    ServiceModel,
    TargetGroupModel,
    TargetGroupMemberModel,
    SandboxTemplateModel,
    SandboxInstanceModel,
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
