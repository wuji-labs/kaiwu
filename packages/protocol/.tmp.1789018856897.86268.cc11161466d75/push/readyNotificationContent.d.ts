type ReadyNotificationContent = Readonly<{
    title: string;
    body: string;
}>;
export declare function buildReadyNotificationContent(params: Readonly<{
    sessionTitle?: string | null;
    defaultTitle: string;
    waitingForCommandLabel: string;
    fallbackBody: string;
    includeMessageText?: boolean;
    messageText?: string | null;
}>): ReadyNotificationContent;
export {};
//# sourceMappingURL=readyNotificationContent.d.ts.map