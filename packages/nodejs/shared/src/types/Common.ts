import type { z } from "zod";

import type {
    CronExpressionSchema,
    GlobPatternSchema,
    LifecycleStatusSchema,
    ResolvedSecretSchema,
    ResourceRequirementsSchema,
    RetentionPolicySchema,
    SecretReferenceSchema,
    TimestampSchema
} from "../schemas/Common";

export type CronExpression = z.infer<typeof CronExpressionSchema>;
export type GlobPattern = z.infer<typeof GlobPatternSchema>;
export type SecretReference = z.infer<typeof SecretReferenceSchema>;
export type ResourceRequirements = z.infer<typeof ResourceRequirementsSchema>;
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;
export type ResolvedSecret = z.infer<typeof ResolvedSecretSchema>;
export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;
export type Timestamp = z.infer<typeof TimestampSchema>;
