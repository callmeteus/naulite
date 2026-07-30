import type { z } from "zod";

import type {
    HostInventorySchema,
    HostPackageManagerSchema,
    HostPackageSchema,
    HostPackageStatusSchema,
    HostUpdateKindSchema,
    HostUpdateRequestSchema,
    HostUpdateRunSchema,
    HostUpdateRunStatusSchema
} from "../schemas/HostInventory";

export type HostPackageManager = z.infer<typeof HostPackageManagerSchema>;
export type HostPackageStatus = z.infer<typeof HostPackageStatusSchema>;
export type HostPackage = z.infer<typeof HostPackageSchema>;
export type HostInventory = z.infer<typeof HostInventorySchema>;
export type HostUpdateRequest = z.infer<typeof HostUpdateRequestSchema>;
export type HostUpdateKind = z.infer<typeof HostUpdateKindSchema>;
export type HostUpdateRunStatus = z.infer<typeof HostUpdateRunStatusSchema>;
export type HostUpdateRun = z.infer<typeof HostUpdateRunSchema>;
