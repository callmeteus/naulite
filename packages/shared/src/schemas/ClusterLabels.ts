import { z } from "zod";

/**
 * Label map used for node selection and service placement.
 */
export const ClusterLabelsSchema = z.record(z.string(), z.string());

/**
 * Service or build placement constraints referencing cluster node labels.
 */
export const ClusterPlacementSchema = z.object({
    labels: ClusterLabelsSchema
});
