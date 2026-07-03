import { createRouter, createWebHistory } from "vue-router";

import AdminUsersView from "../views/AdminUsersView.vue";
import ApiKeysView from "../views/ApiKeysView.vue";
import BackupsView from "../views/BackupsView.vue";
import BuildView from "../views/BuildView.vue";
import ClusterView from "../views/ClusterView.vue";
import ContainerRegistryView from "../views/ContainerRegistryView.vue";
import DeployView from "../views/DeployView.vue";
import GatewayRoutesView from "../views/GatewayRoutesView.vue";
import GitOpsView from "../views/GitOpsView.vue";
import InstancesView from "../views/InstancesView.vue";
import LoginView from "../views/LoginView.vue";
import MetricsView from "../views/MetricsView.vue";
import NetBirdView from "../views/NetBirdView.vue";
import NodesView from "../views/NodesView.vue";
import ProvisionView from "../views/ProvisionView.vue";
import RunsView from "../views/RunsView.vue";
import SecretsView from "../views/SecretsView.vue";
import ServicesView from "../views/ServicesView.vue";
import VolumesView from "../views/VolumesView.vue";
import { useAuthStore } from "../stores/Auth";

/**
 * Dashboard router with resource-focused views.
 */
const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: "/login", component: LoginView, meta: { public: true } },
        { path: "/", redirect: "/nodes" },
        { path: "/nodes", component: NodesView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/services", component: ServicesView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/instances", component: InstancesView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/volumes", component: VolumesView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/secrets", component: SecretsView, meta: { roles: ["admin"] } },
        { path: "/cluster", component: ClusterView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/metrics", component: MetricsView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/gitops", component: GitOpsView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/deploy", component: DeployView, meta: { roles: ["operator", "admin"] } },
        { path: "/build", component: BuildView, meta: { roles: ["operator", "admin"] } },
        { path: "/provision", component: ProvisionView, meta: { roles: ["operator", "admin"] } },
        { path: "/runs", component: RunsView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/gateway-routes", component: GatewayRoutesView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/container-registry", component: ContainerRegistryView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/backups", component: BackupsView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/netbird", component: NetBirdView, meta: { roles: ["viewer", "operator", "admin"] } },
        { path: "/api-keys", component: ApiKeysView, meta: { roles: ["admin"] } },
        { path: "/admin-users", component: AdminUsersView, meta: { roles: ["admin"] } }
    ]
});

router.beforeEach(async (to) => {
    const auth = useAuthStore();

    if (to.meta.public) {
        return true;
    }

    const user = await auth.ensureSession();

    if (!user) {
        return {
            path: "/login",
            query: { redirect: to.fullPath }
        };
    }

    const roles = to.meta.roles as string[] | undefined;

    if (roles && !roles.includes(user.role)) {
        return "/nodes";
    }

    return true;
});

export default router;
