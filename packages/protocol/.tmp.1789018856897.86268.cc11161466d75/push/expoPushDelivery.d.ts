type ExpoPushTargetLike = string | ReadonlyArray<string>;
type ExpoPushMessageLike = Readonly<{
    to: ExpoPushTargetLike;
}>;
type ExpoPushReceiptsLike = Readonly<Record<string, unknown>> | ReadonlyMap<string, unknown>;
export declare function collectExpoPushTokensMarkedUnregistered(params: Readonly<{
    messages: ReadonlyArray<ExpoPushMessageLike>;
    tickets: ReadonlyArray<unknown>;
    receipts?: ExpoPushReceiptsLike;
}>): string[];
export {};
//# sourceMappingURL=expoPushDelivery.d.ts.map