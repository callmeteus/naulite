import type { z } from "zod";

import {
    ClusterLabelsSchema,
    ClusterPlacementSchema
} from "../schemas/ClusterLabels";

export type ClusterLabels = z.infer<typeof ClusterLabelsSchema>;
export type ClusterPlacement = z.infer<typeof ClusterPlacementSchema>;
