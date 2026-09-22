import type { Component } from "vue";
import {
    Activity,
    Archive,
    Bell,
    Box,
    Container,
    GitBranch,
    HardDrive,
    Key,
    LayoutDashboard,
    Network,
    Route,
    Server,
    Shield,
    Users,
    Layers
} from "@lucide/vue";
import type { NaulitePermission } from "@naulite/sdk";

export interface NavItem {
    path: string;
    labelKey: string;
    permission: NaulitePermission;
    icon: Component;
    /**
     * Extra path prefixes that keep this item selected (nested run pages, sibling tabs).
     */
    matchPrefixes?: string[];
}

export interface NavSection {
    id: string;
    labelKey: string;
    items: NavItem[];
}

/**
 * Grouped sidebar navigation configuration.
 */
export const navigationSections: NavSection[] = [
    {
        id: "infrastructure",
        labelKey: "menu.sections.infrastructure",
        items: [
            { path: "/nodes", labelKey: "menu.infrastructure.nodes", permission: "nodes:read", icon: Server },
            { path: "/target-groups", labelKey: "menu.infrastructure.groups", permission: "nodes:read", icon: Users },
            { path: "/sandboxes", labelKey: "menu.infrastructure.sandboxes", permission: "nodes:read", icon: Layers },
            { path: "/cluster", labelKey: "menu.infrastructure.cluster", permission: "metrics:read", icon: LayoutDashboard },
            { path: "/metrics", labelKey: "menu.infrastructure.metrics", permission: "metrics:read", icon: Activity }
        ]
    },
    {
        id: "workloads",
        labelKey: "menu.sections.workloads",
        items: [
            { path: "/services", labelKey: "menu.workloads.services", permission: "workloads:read", icon: Box },
            { path: "/instances", labelKey: "menu.workloads.instances", permission: "workloads:read", icon: Container },
            { path: "/volumes", labelKey: "menu.workloads.volumes", permission: "workloads:read", icon: HardDrive },
            { path: "/secrets", labelKey: "menu.workloads.secrets", permission: "secrets:read", icon: Shield }
        ]
    },
    {
        id: "delivery",
        labelKey: "menu.sections.delivery",
        items: [
            {
                path: "/delivery/gitops",
                labelKey: "menu.delivery.entrega",
                permission: "gitops:read",
                icon: GitBranch,
                matchPrefixes: ["/delivery", "/runs"]
            }
        ]
    },
    {
        id: "platform",
        labelKey: "menu.sections.platform",
        items: [
            { path: "/gateway-routes", labelKey: "menu.platform.gatewayRoutes", permission: "registry:read", icon: Route },
            { path: "/container-registry", labelKey: "menu.platform.containerRegistry", permission: "registry:read", icon: Archive },
            { path: "/backups", labelKey: "menu.platform.backups", permission: "backups:read", icon: Archive },
            { path: "/netbird", labelKey: "menu.platform.netbird", permission: "netbird:read", icon: Network },
            { path: "/notifications", labelKey: "menu.platform.notifications", permission: "notifications:read", icon: Bell }
        ]
    },
    {
        id: "administration",
        labelKey: "menu.sections.administration",
        items: [
            { path: "/api-keys", labelKey: "menu.administration.apiKeys", permission: "admin:api-keys:read", icon: Key },
            { path: "/admin-users", labelKey: "menu.administration.adminUsers", permission: "admin:users:read", icon: Users }
        ]
    }
];
