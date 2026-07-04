import {
    WebhookNotificationProvider,
    webhookNotificationProvider
} from "./WebhookNotificationProvider";

/**
 * Plugin registration metadata for the webhook notification provider.
 */
export const webhookNotificationPluginRegistration = {
    id: "webhook",
    type: "notification" as const,
    version: "0.1.0",
    notificationProvider: webhookNotificationProvider
};

/**
 * Default plugin export for auto-discovery.
 */
export default webhookNotificationPluginRegistration;

export {
    WebhookNotificationProvider,
    webhookNotificationProvider
};
