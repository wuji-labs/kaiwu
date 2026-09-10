import { z } from 'zod';
export declare const ActivityWebhookTopicSchema: any;
export type ActivityWebhookTopic = z.infer<typeof ActivityWebhookTopicSchema>;
export declare const ActivityWebhookPayloadV1Schema: any;
export type ActivityWebhookPayloadV1 = z.infer<typeof ActivityWebhookPayloadV1Schema>;
export declare function buildActivityWebhookPayload(params: Readonly<{
    channelId: string;
    createdAt: number;
    topic: ActivityWebhookTopic;
    content: Readonly<{
        title: string;
        body: string;
    }>;
    session?: Readonly<{
        sessionId: string;
        title?: string | null;
    }> | null;
    request?: Readonly<{
        requestId: string;
        kind: 'permission' | 'user_action';
        toolName: string;
        toolDetails?: string | null;
    }> | null;
    metadata?: Readonly<Record<string, unknown>> | undefined;
}>): ActivityWebhookPayloadV1;
//# sourceMappingURL=webhookPayload.d.ts.map