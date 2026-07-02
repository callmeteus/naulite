import type { z } from "zod";

import {
    BackupTaskSchema,
    BackupTaskStatusSchema,
    LocalBackupDestinationSchema,
    NodeBackupDestinationSchema,
    PluginBackupDestinationSchema,
    S3BackupDestinationSchema,
    VolumeBackupPolicySchema
} from "../schemas/BackupTask.js";

export type LocalBackupDestination = z.infer<typeof LocalBackupDestinationSchema>;
export type NodeBackupDestination = z.infer<typeof NodeBackupDestinationSchema>;
export type S3BackupDestination = z.infer<typeof S3BackupDestinationSchema>;
export type PluginBackupDestination = z.infer<typeof PluginBackupDestinationSchema>;
export type VolumeBackupPolicy = z.infer<typeof VolumeBackupPolicySchema>;
export type BackupTask = z.infer<typeof BackupTaskSchema>;
export type BackupTaskStatus = z.infer<typeof BackupTaskStatusSchema>;
