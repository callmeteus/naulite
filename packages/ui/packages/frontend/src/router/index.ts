import { createRouter, createWebHistory } from "vue-router";
import type { NaulitePermission } from "@naulite/sdk";

import { useAuthStore } from "../stores/Auth";
import AdminUsersView from "../views/AdminUsersView.vue";
import ApiKeysView from "../views/ApiKeysView.vue";
import BackupsView from "../views/BackupsView.vue";
import ClusterView from "../views/ClusterView.vue";
import ContainerRegistryView from "../views/ContainerRegistryView.vue";
import ForbiddenView from "../views/ForbiddenView.vue";
import GatewayRoutesView from "../views/GatewayRoutesView.vue";
import DeliveryView from "../views/DeliveryView.vue";
import GitOpsView from "../views/GitOpsView.vue";
import InstancesView from "../views/InstancesView.vue";
import InstanceDetailView from "../views/InstanceDetailView.vue";
import LoginView from "../views/LoginView.vue";
import MetricsView from "../views/MetricsView.vue";
import NetBirdView from "../views/NetBirdView.vue";
import NodesView from "../views/NodesView.vue";
import NodeDetailView from "../views/NodeDetailView.vue";
import NotificationsView from "../views/NotificationsView.vue";
import ProvisionNewView from "../views/ProvisionNewView.vue";
import ProvisionDetailView from "../views/ProvisionDetailView.vue";
import RunsView from "../views/RunsView.vue";
import RunDetailView from "../views/RunDetailView.vue";
import TargetGroupsView from "../views/TargetGroupsView.vue";
import SecretsView from "../views/SecretsView.vue";
import BuildTriggerView from "../views/BuildTriggerView.vue";
import NotificationDestinationFormView from "../views/NotificationDestinationFormView.vue";
import QuickDeployView from "../views/QuickDeployView.vue";
import SecretEditView from "../views/SecretEditView.vue";
import SecretNewView from "../views/SecretNewView.vue";
import ServiceDetailView from "../views/ServiceDetailView.vue";
import ServiceManifestEditView from "../views/ServiceManifestEditView.vue";
import ServicesView from "../views/ServicesView.vue";
import VolumesView from "../views/VolumesView.vue";

/**
 * Dashboard router with resource-focused views.
 */
const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: "/login", component: LoginView, meta: { public: true } },
        { path: "/403", component: ForbiddenView },
        { path: "/", redirect: "/nodes" },
        { path: "/nodes", component: NodesView, meta: { permissions: ["nodes:read"] satisfies NaulitePermission[] } },
        { path: "/nodes/new", component: ProvisionNewView, meta: { permissions: ["nodes:provision"] satisfies NaulitePermission[] } },
        { path: "/nodes/provisions/:id", component: ProvisionDetailView, meta: { permissions: ["nodes:provision"] satisfies NaulitePermission[] } },
        { path: "/nodes/:id", component: NodeDetailView, meta: { permissions: ["nodes:read"] satisfies NaulitePermission[] } },
        { path: "/services", component: ServicesView, meta: { permissions: ["workloads:read"] satisfies NaulitePermission[] } },
        { path: "/services/:name/edit", component: ServiceManifestEditView, meta: { permissions: ["manifests:apply"] satisfies NaulitePermission[] } },
        { path: "/services/:name", component: ServiceDetailView, meta: { permissions: ["workloads:read"] satisfies NaulitePermission[] } },
        { path: "/instances", component: InstancesView, meta: { permissions: ["workloads:read"] satisfies NaulitePermission[] } },
        { path: "/instances/:id", component: InstanceDetailView, meta: { permissions: ["workloads:read"] satisfies NaulitePermission[] } },
        { path: "/volumes", component: VolumesView, meta: { permissions: ["workloads:read"] satisfies NaulitePermission[] } },
        { path: "/secrets", component: SecretsView, meta: { permissions: ["secrets:read"] satisfies NaulitePermission[] } },
        { path: "/secrets/new", component: SecretNewView, meta: { permissions: ["secrets:write"] satisfies NaulitePermission[] } },
        { path: "/secrets/edit", component: SecretEditView, meta: { permissions: ["secrets:write"] satisfies NaulitePermission[] } },
        { path: "/cluster", component: ClusterView, meta: { permissions: ["metrics:read"] satisfies NaulitePermission[] } },
        { path: "/metrics", component: MetricsView, meta: { permissions: ["metrics:read"] satisfies NaulitePermission[] } },
        { path: "/target-groups", component: TargetGroupsView, meta: { permissions: ["nodes:read"] satisfies NaulitePermission[] } },
        { path: "/delivery", component: DeliveryView, children: [
            { path: "", redirect: "/delivery/gitops" },
            { path: "gitops", component: GitOpsView, meta: { deliveryTab: true, permissions: ["gitops:read"] satisfies NaulitePermission[] } },
            { path: "pipeline", component: RunsView, meta: { deliveryTab: true, permissions: ["runs:read"] satisfies NaulitePermission[] } }
        ] },
        { path: "/gitops", redirect: "/delivery/gitops" },
        { path: "/deploy", redirect: "/runs/deploy" },
        { path: "/build", redirect: "/runs/build" },
        { path: "/provision", redirect: "/nodes" },
        { path: "/provision/new", redirect: "/nodes/new" },
        { path: "/provision/:id", redirect: (to) => `/nodes/provisions/${String(to.params.id ?? "")}` },
        { path: "/runs/deploy", component: DeliveryView, children: [
            { path: "", component: QuickDeployView, meta: { deliveryTab: true, permissions: ["manifests:apply"] satisfies NaulitePermission[] } }
        ] },
        { path: "/runs/build", component: DeliveryView, children: [
            { path: "", component: BuildTriggerView, meta: { deliveryTab: true, permissions: ["runs:write"] satisfies NaulitePermission[] } }
        ] },
        { path: "/runs/:id", component: DeliveryView, children: [
            { path: "", component: RunDetailView, meta: { deliveryTab: true, permissions: ["runs:read"] satisfies NaulitePermission[] } }
        ] },
        { path: "/runs", redirect: "/delivery/pipeline" },
        { path: "/gateway-routes", component: GatewayRoutesView, meta: { permissions: ["registry:read"] satisfies NaulitePermission[] } },
        { path: "/container-registry", component: ContainerRegistryView, meta: { permissions: ["registry:read"] satisfies NaulitePermission[] } },
        { path: "/backups", component: BackupsView, meta: { permissions: ["backups:read"] satisfies NaulitePermission[] } },
        { path: "/netbird", component: NetBirdView, meta: { permissions: ["netbird:read"] satisfies NaulitePermission[] } },
        { path: "/notifications/new", component: NotificationDestinationFormView, meta: { permissions: ["notifications:write"] satisfies NaulitePermission[] } },
        { path: "/notifications/:id/edit", component: NotificationDestinationFormView, meta: { permissions: ["notifications:write"] satisfies NaulitePermission[] } },
        { path: "/notifications", component: NotificationsView, meta: { permissions: ["notifications:read"] satisfies NaulitePermission[] } },
        { path: "/api-keys", component: ApiKeysView, meta: { permissions: ["admin:api-keys:read"] satisfies NaulitePermission[] } },
        { path: "/admin-users", component: AdminUsersView, meta: { permissions: ["admin:users:read"] satisfies NaulitePermission[] } }
    ]
});

router.beforeEach(async (to) => {
    const auth = useAuthStore();

    if (to.meta.public) {
        if (to.path === "/login") {
            auth.error = "";
        }

        return true;
    }

    const user = await auth.ensureSession();

    if (!user) {
        return {
            path: "/login",
            query: { redirect: to.fullPath }
        };
    }

    const permissions = to.meta.permissions as NaulitePermission[] | undefined;

    if (permissions && !permissions.every((permission) => auth.hasPermission(permission))) {
        return "/403";
    }

    return true;
});

export default router;
