import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ProgressNotification, RequestMeta } from '@modelcontextprotocol/sdk/types.js';

type SendProgressNotification = (notification: ProgressNotification) => Promise<void>;

export function createMcpProgressForwarder(params: Readonly<{
  requestMetadata?: RequestMeta;
  sendNotification: SendProgressNotification;
  onError: (error: unknown) => void;
}>): Readonly<{
  requestMetadata?: RequestMeta;
  onprogress?: RequestOptions['onprogress'];
  flush: () => Promise<void>;
}> {
  const progressToken = params.requestMetadata?.progressToken;
  const pendingProgressNotifications: Promise<void>[] = [];
  const onprogress = typeof progressToken === 'string' || typeof progressToken === 'number'
    ? (progress: Readonly<{ progress: number; total?: number; message?: string }>) => {
      const notification = params.sendNotification({
        method: 'notifications/progress',
        params: {
          ...progress,
          progressToken,
        },
      }).catch(params.onError);
      pendingProgressNotifications.push(notification);
    }
    : undefined;

  return {
    ...(params.requestMetadata === undefined ? {} : { requestMetadata: params.requestMetadata }),
    ...(onprogress === undefined ? {} : { onprogress }),
    flush: async () => {
      await Promise.all(pendingProgressNotifications);
    },
  };
}
