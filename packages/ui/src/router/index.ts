import { createRouter, createWebHistory } from "vue-router";

import NodesView from "../views/NodesView.vue";
import ServicesView from "../views/ServicesView.vue";
import DeployView from "../views/DeployView.vue";
import BackupsView from "../views/BackupsView.vue";
import ApiKeysView from "../views/ApiKeysView.vue";

/**
 * Dashboard router with resource-focused views.
 */
const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: "/", redirect: "/nodes" },
        { path: "/nodes", component: NodesView },
        { path: "/services", component: ServicesView },
        { path: "/deploy", component: DeployView },
        { path: "/backups", component: BackupsView },
        { path: "/api-keys", component: ApiKeysView }
    ]
});

export default router;
