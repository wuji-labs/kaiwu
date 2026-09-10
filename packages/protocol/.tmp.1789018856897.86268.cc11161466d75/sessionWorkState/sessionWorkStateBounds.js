export function boundSessionWorkStateItemsV1(params) {
    const maxItems = params.maxItems;
    if (typeof maxItems !== 'number' || !Number.isInteger(maxItems) || maxItems < 0 || maxItems >= params.items.length) {
        return {
            items: [...params.items],
        };
    }
    return {
        items: params.items.slice(0, maxItems),
        truncated: {
            reason: 'item_limit',
            omittedCount: params.items.length - maxItems,
        },
    };
}
//# sourceMappingURL=sessionWorkStateBounds.js.map