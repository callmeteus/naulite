import type { RelationEntry } from "../utils/Relation";

/**
 * Supported cloud providers for node provisioning.
 */
export enum NodeProvisionProvider {
    AWS = "AWS"
}

/**
 * UI metadata for node provision provider enum values.
 */
export const NodeProvisionProviderRelation: RelationEntry<NodeProvisionProvider>[] = [
    {
        key: NodeProvisionProvider.AWS,
        labelKey: "relations.nodeProvisionProvider.AWS.label"
    }
];
