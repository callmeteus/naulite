import type { z } from "zod";

import {
    LogRotationPolicySchema,
    LogRotationTaskSchema,
    LogRotationTaskStatusSchema
} from "../schemas/LogRotationTask";

export type LogRotationPolicy = z.infer<typeof LogRotationPolicySchema>;
export type LogRotationTask = z.infer<typeof LogRotationTaskSchema>;
export type LogRotationTaskStatus = z.infer<typeof LogRotationTaskStatusSchema>;
