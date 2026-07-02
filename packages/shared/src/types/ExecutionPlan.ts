import type { z } from "zod";

import {
    ConnectNetworkOperationSchema,
    CreateInstanceOperationSchema,
    DisconnectNetworkOperationSchema,
    EnsureVolumeOperationSchema,
    ExecutionOperationSchema,
    ExecutionPlanSchema,
    PullOperationSchema,
    RemoveInstanceOperationSchema,
    StartInstanceOperationSchema,
    StopInstanceOperationSchema
} from "../schemas/ExecutionPlan";

export type PullOperation = z.infer<typeof PullOperationSchema>;
export type CreateInstanceOperation = z.infer<typeof CreateInstanceOperationSchema>;
export type StartInstanceOperation = z.infer<typeof StartInstanceOperationSchema>;
export type StopInstanceOperation = z.infer<typeof StopInstanceOperationSchema>;
export type RemoveInstanceOperation = z.infer<typeof RemoveInstanceOperationSchema>;
export type ConnectNetworkOperation = z.infer<typeof ConnectNetworkOperationSchema>;
export type DisconnectNetworkOperation = z.infer<typeof DisconnectNetworkOperationSchema>;
export type EnsureVolumeOperation = z.infer<typeof EnsureVolumeOperationSchema>;
export type ExecutionOperation = z.infer<typeof ExecutionOperationSchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
