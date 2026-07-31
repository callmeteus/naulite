import type { NetBirdAcl, NetBirdDevice, NetBirdGroup, Node } from "@naulite/sdk";

/**
 * Returns whether a NetBird device is currently connected.
 *
 * @param device NetBird device record
 * @returns True when the device is online
 */
export function isNetBirdDeviceOnline(device: NetBirdDevice): boolean {
    if (typeof device.online === "boolean") {
        return device.online;
    }

    if (typeof device.connected === "boolean") {
        return device.connected;
    }

    return false;
}

/**
 * Resolves a group display name from its identifier.
 *
 * @param groupId NetBird group id
 * @param groups Known NetBird groups
 * @returns Group name or the raw id
 */
export function resolveNetBirdGroupName(groupId: string, groups: NetBirdGroup[]): string {
    const match = groups.find((group) => group.id === groupId);

    return match?.name ?? groupId;
}

/**
 * Formats ACL port numbers for display.
 *
 * @param acl NetBird ACL record
 * @returns Comma-separated ports or a wildcard label key
 */
export function formatNetBirdAclPorts(acl: NetBirdAcl): string {
    if (!Array.isArray(acl.ports) || acl.ports.length === 0) {
        return "all";
    }

    return acl.ports.join(", ");
}

/**
 * Formats ACL group references for display.
 *
 * @param groupIds Group identifiers
 * @param groups Known NetBird groups
 * @returns Comma-separated group names
 */
export function formatNetBirdGroupRefs(groupIds: string[] | undefined, groups: NetBirdGroup[]): string {
    if (!groupIds || groupIds.length === 0) {
        return "-";
    }

    return groupIds.map((groupId) => resolveNetBirdGroupName(groupId, groups)).join(", ");
}

/**
 * Finds the cluster node linked to a NetBird device.
 *
 * @param deviceId NetBird device id
 * @param nodes Cluster nodes
 * @returns Matching node or undefined
 */
export function findLinkedNode(deviceId: string, nodes: Node[]): Node | undefined {
    return nodes.find((node) => node.netbirdDeviceId === deviceId);
}

/**
 * Lists cluster nodes that are not linked to a NetBird device.
 *
 * @param nodes Cluster nodes
 * @returns Nodes missing a NetBird device id
 */
export function listUnlinkedNodes(nodes: Node[]): Node[] {
    return nodes.filter((node) => !node.netbirdDeviceId);
}

/**
 * Counts online NetBird devices.
 *
 * @param devices NetBird devices
 * @returns Number of connected devices
 */
export function countOnlineNetBirdDevices(devices: NetBirdDevice[]): number {
    return devices.filter((device) => isNetBirdDeviceOnline(device)).length;
}
