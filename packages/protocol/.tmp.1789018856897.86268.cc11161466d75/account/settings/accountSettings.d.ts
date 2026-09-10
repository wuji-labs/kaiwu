import { z } from 'zod';
import { type ActionsSettingsV1 } from '../../actions/actionSettings.js';
import { type ConnectedServicesDefaultAuthByAgentIdV1, type ConnectedServicesProviderStateSharingSettingsV1 } from './connectedServicesSettings.js';
import { BUILT_IN_EXPO_PUSH_NOTIFICATION_CHANNEL_ID, type NotificationChannelV1, type NotificationChannelsV1 } from './notificationChannels.js';
export declare const ACCOUNT_SETTINGS_SUPPORTED_SCHEMA_VERSION = 2;
export declare const ForegroundBehaviorSchema: any;
export type ForegroundBehavior = z.infer<typeof ForegroundBehaviorSchema>;
export declare const NotificationsSettingsV1Schema: any;
export type NotificationsSettingsV1 = z.infer<typeof NotificationsSettingsV1Schema>;
export declare const DEFAULT_NOTIFICATIONS_SETTINGS_V1: NotificationsSettingsV1;
export declare const SessionAgentSpawnPolicyV1Schema: any;
export type SessionAgentSpawnPolicyV1 = z.infer<typeof SessionAgentSpawnPolicyV1Schema>;
export declare const DEFAULT_SESSION_AGENT_SPAWN_POLICY_V1: SessionAgentSpawnPolicyV1;
export declare const DEFAULT_ACTIONS_SETTINGS_V1: ActionsSettingsV1;
export declare const UsageLimitRecoverySettingsV1Schema: any;
export type UsageLimitRecoverySettingsV1 = z.infer<typeof UsageLimitRecoverySettingsV1Schema>;
export declare const DEFAULT_USAGE_LIMIT_RECOVERY_SETTINGS_V1: UsageLimitRecoverySettingsV1;
export declare const SESSION_PENDING_QUEUE_DRAIN_MODES: readonly ["one_at_a_time", "drain_all"];
export declare const DEFAULT_SESSION_PENDING_QUEUE_DRAIN_MODE: "one_at_a_time";
export declare const SessionPendingQueueDrainModeSchema: any;
export type SessionPendingQueueDrainMode = z.infer<typeof SessionPendingQueueDrainModeSchema>;
export declare const SESSION_PENDING_QUEUE_DELIVERY_TIMINGS: readonly ["after_foreground_ready", "after_runtime_idle"];
export declare const DEFAULT_SESSION_PENDING_QUEUE_DELIVERY_TIMING: "after_foreground_ready";
export declare const SessionPendingQueueDeliveryTimingSchema: any;
export type SessionPendingQueueDeliveryTiming = z.infer<typeof SessionPendingQueueDeliveryTimingSchema>;
export declare const AccountSettingsSchema: any;
export type AccountSettings = z.infer<typeof AccountSettingsSchema>;
export declare function accountSettingsParse(raw: unknown): AccountSettings;
export declare function getNotificationsSettingsV1FromAccountSettings(settingsLike: unknown): NotificationsSettingsV1;
export declare function resolveNotificationChannelsV1FromAccountSettings(settingsLike: unknown): NotificationChannelsV1;
/**
 * Canonical answer to "may this account receive Expo push notifications at all".
 *
 * Both the client (token registration and OS permission prompting) and any surface that reports
 * the account-level push state must consume this, so the reported setting and the behavior it
 * describes cannot diverge. An enabled webhook channel is a different delivery channel and does
 * not enable Expo push.
 */
export declare function isExpoPushNotificationChannelEnabled(settingsLike: unknown): boolean;
export { BUILT_IN_EXPO_PUSH_NOTIFICATION_CHANNEL_ID };
export type { ConnectedServicesDefaultAuthByAgentIdV1, ConnectedServicesProviderStateSharingSettingsV1, NotificationChannelV1, NotificationChannelsV1, };
//# sourceMappingURL=accountSettings.d.ts.map