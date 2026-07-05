import { ControlPlaneService } from "../ControlPlaneService";

/**
 * Prometheus exposition format helpers for control plane metrics.
 */
export namespace PrometheusMetrics {
    /**
     * Collects cluster inventory counters and formats Prometheus text exposition.
     *
     * @returns Prometheus metrics document
     */
    export async function collectText(): Promise<string> {
        const [nodes, services, instances, volumes, secrets, databaseHealthy] = await Promise.all([
            ControlPlaneService.Store.listNodes(),
            ControlPlaneService.Store.listServices(),
            ControlPlaneService.Store.listInstances(),
            ControlPlaneService.Store.listVolumes(),
            ControlPlaneService.Store.listSecrets(),
            ControlPlaneService.Database.healthCheck()
        ]);

        const onlineNodes = nodes.filter((node) => node.status === "online").length;
        const runningInstances = instances.filter((instance) => instance.status === "running").length;
        const applyRevision = ControlPlaneService.Apply.getRevision();
        const controlPlaneId = process.env.CP_INSTANCE_ID ?? "control-plane";
        const isLeader = ControlPlaneService.Leader.isLeader() ? 1 : 0;
        const leaderId = ControlPlaneService.Leader.getLeaderId();

        console.debug(
            "[metrics] collect nodes=%d online=%d services=%d instances=%d running=%d dbHealthy=%s revision=%d leader=%s",
            nodes.length,
            onlineNodes,
            services.length,
            instances.length,
            runningInstances,
            databaseHealthy,
            applyRevision,
            leaderId
        );

        const lines = [
            "# HELP naulite_nodes_total Registered cluster nodes.",
            "# TYPE naulite_nodes_total gauge",
            `naulite_nodes_total ${nodes.length}`,
            "# HELP naulite_nodes_online Online cluster nodes.",
            "# TYPE naulite_nodes_online gauge",
            `naulite_nodes_online ${onlineNodes}`,
            "# HELP naulite_services_total Desired services in cluster state.",
            "# TYPE naulite_services_total gauge",
            `naulite_services_total ${services.length}`,
            "# HELP naulite_instances_total Tracked container instances.",
            "# TYPE naulite_instances_total gauge",
            `naulite_instances_total ${instances.length}`,
            "# HELP naulite_instances_running Running container instances.",
            "# TYPE naulite_instances_running gauge",
            `naulite_instances_running ${runningInstances}`,
            "# HELP naulite_volumes_total Cluster volumes.",
            "# TYPE naulite_volumes_total gauge",
            `naulite_volumes_total ${volumes.length}`,
            "# HELP naulite_secrets_total Cluster secret metadata records.",
            "# TYPE naulite_secrets_total gauge",
            `naulite_secrets_total ${secrets.length}`,
            "# HELP naulite_apply_revision Current manifest apply revision counter.",
            "# TYPE naulite_apply_revision gauge",
            `naulite_apply_revision ${applyRevision}`,
            "# HELP naulite_database_healthy Database connectivity (1 healthy, 0 unhealthy).",
            "# TYPE naulite_database_healthy gauge",
            `naulite_database_healthy ${databaseHealthy ? 1 : 0}`,
            "# HELP naulite_control_plane_leader Whether this instance holds the leader lease (1 leader, 0 follower).",
            "# TYPE naulite_control_plane_leader gauge",
            `naulite_control_plane_leader{leader_id="${escapeLabelValue(leaderId)}"} ${isLeader}`,
            "# HELP naulite_control_plane_info Control plane instance metadata.",
            "# TYPE naulite_control_plane_info gauge",
            `naulite_control_plane_info{instance_id="${escapeLabelValue(controlPlaneId)}"} 1`
        ];

        return `${lines.join("\n")}\n`;
    }

    /**
     * Escapes a label value for Prometheus text format.
     *
     * @param value Raw label value
     * @returns Escaped label value
     */
    function escapeLabelValue(value: string): string {
        return value
            .replace(/\\/g, "\\\\")
            .replace(/\n/g, "\\n")
            .replace(/"/g, '\\"');
    }
}
