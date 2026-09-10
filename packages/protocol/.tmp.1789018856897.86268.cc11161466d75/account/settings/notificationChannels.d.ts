import { z } from 'zod';
import { type SecretStringV1 } from '../../crypto/settingsSecretStringsV1.js';
import type { NotificationsSettingsV1 } from './accountSettings.js';
export declare const BUILT_IN_EXPO_PUSH_NOTIFICATION_CHANNEL_ID = "builtin:expo_push";
export declare const NotificationChannelTopicsV1Schema: any;
export type NotificationChannelTopicsV1 = z.infer<typeof NotificationChannelTopicsV1Schema>;
export declare const DEFAULT_NOTIFICATION_CHANNEL_TOPICS_V1: NotificationChannelTopicsV1;
export declare const ExpoPushNotificationChannelV1Schema: any;
export type ExpoPushNotificationChannelV1 = z.infer<typeof ExpoPushNotificationChannelV1Schema>;
export declare const WebhookNotificationChannelV1Schema: any;
export type WebhookNotificationChannelV1 = z.infer<typeof WebhookNotificationChannelV1Schema>;
export declare function hasConfiguredSecretStringValue(secret: SecretStringV1 | null | undefined): boolean;
export declare const NotificationChannelV1Schema: any;
export type NotificationChannelV1 = z.infer<typeof NotificationChannelV1Schema>;
export declare const NotificationChannelsV1Schema: any;
export type NotificationChannelsV1 = z.infer<typeof NotificationChannelsV1Schema>;
export declare function deriveExpoPushNotificationChannelFromLegacySettings(settings: Readonly<NotificationsSettingsV1>): ExpoPushNotificationChannelV1;
//# sourceMappingURL=notificationChannels.d.ts.map