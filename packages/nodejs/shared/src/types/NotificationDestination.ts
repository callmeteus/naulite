import type { z } from "zod";

import type {
    CreateNotificationDestinationBodySchema,
    NotificationDestinationSchema,
    NotificationDestinationTestResultSchema,
    UpdateNotificationDestinationBodySchema
} from "../schemas/NotificationDestination";

export type NotificationDestination = z.infer<typeof NotificationDestinationSchema>;
export type CreateNotificationDestinationInput = z.infer<typeof CreateNotificationDestinationBodySchema>;
export type UpdateNotificationDestinationInput = z.infer<typeof UpdateNotificationDestinationBodySchema>;
export type NotificationDestinationTestResult = z.infer<typeof NotificationDestinationTestResultSchema>;
