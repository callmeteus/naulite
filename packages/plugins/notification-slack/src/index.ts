import {
    SlackNotificationProvider,
    slackNotificationProvider
} from "./SlackNotificationProvider";

/**
 * Plugin registration metadata for the Slack notification provider.
 */
export const slackNotificationPluginRegistration = {
    id: "slack",
    type: "notification" as const,
    version: "0.1.0",
    notificationProvider: slackNotificationProvider
};

/**
 * Default plugin export for auto-discovery.
 */
export default slackNotificationPluginRegistration;

export {
    SlackNotificationProvider,
    slackNotificationProvider
};
