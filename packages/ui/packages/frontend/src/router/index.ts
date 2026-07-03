import { createRouter, createWebHistory } from "vue-router";

import ApiKeysView from "../views/ApiKeysView.vue";
import BackupsView from "../views/BackupsView.vue";
import BuildView from "../views/BuildView.vue";
import ClusterView from "../views/ClusterView.vue";
import ContainerRegistryView from "../views/ContainerRegistryView.vue";
import DeployView from "../views/DeployView.vue";
import GatewayRoutesView from "../views/GatewayRoutesView.vue";
import GitOpsView from "../views/GitOpsView.vue";
import InstancesView from "../views/InstancesView.vue";
import NetBirdView from "../views/NetBirdView.vue";
import NodesView from "../views/NodesView.vue";
import ProvisionView from "../views/ProvisionView.vue";
import RunsView from "../views/RunsView.vue";
import SecretsView from "../views/SecretsView.vue";
import ServicesView from "../views/ServicesView.vue";
import VolumesView from "../views/VolumesView.vue";

/**
 * Dashboard router with resource-focused views.
 */
const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: "/", redirect: "/nodes" },
        { path: "/nodes", component: NodesView },
        { path: "/services", component: ServicesView },
        { path: "/instances", component: InstancesView },
        { path: "/volumes", component: VolumesView },
        { path: "/secrets", component: SecretsView },
        { path: "/cluster", component: ClusterView },
        { path: "/gitops", component: GitOpsView },
        { path: "/deploy", component: DeployView },
        { path: "/build", component: BuildView },
        { path: "/provision", component: ProvisionView },
        { path: "/runs", component: RunsView },
        { path: "/gateway-routes", component: GatewayRoutesView },
        { path: "/container-registry", component: ContainerRegistryView },
        { path: "/backups", component: BackupsView },
        { path: "/netbird", component: NetBirdView },
        { path: "/api-keys", component: ApiKeysView }
    ]
});

export default router;
