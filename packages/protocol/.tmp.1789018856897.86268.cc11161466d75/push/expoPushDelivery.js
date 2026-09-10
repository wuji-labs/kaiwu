function getExpoErrorCode(value) {
    if (!value || typeof value !== 'object')
        return null;
    const details = value.details;
    if (details && typeof details === 'object') {
        const detailsError = details.error;
        if (typeof detailsError === 'string' && detailsError.trim()) {
            return detailsError.trim();
        }
    }
    const message = value.message;
    if (typeof message === 'string' && message.trim()) {
        return message.trim();
    }
    return null;
}
function isExpoDeviceNotRegistered(value) {
    return getExpoErrorCode(value) === 'DeviceNotRegistered';
}
function normalizeExpoPushTargets(target) {
    if (Array.isArray(target)) {
        return target.filter((value) => typeof value === 'string' && value.trim().length > 0);
    }
    return typeof target === 'string' && target.trim().length > 0 ? [target] : [];
}
function readReceiptById(receipts, id) {
    if (!receipts)
        return undefined;
    if (receipts instanceof Map)
        return receipts.get(id);
    return receipts[id];
}
export function collectExpoPushTokensMarkedUnregistered(params) {
    const invalidTokens = new Set();
    params.tickets.forEach((ticket, index) => {
        const message = params.messages[index];
        if (!message)
            return;
        if (isExpoDeviceNotRegistered(ticket)) {
            for (const token of normalizeExpoPushTargets(message.to))
                invalidTokens.add(token);
            return;
        }
        if (!ticket || typeof ticket !== 'object')
            return;
        const receiptId = ticket.id;
        if (typeof receiptId !== 'string' || receiptId.trim().length === 0)
            return;
        const receipt = readReceiptById(params.receipts, receiptId);
        if (!isExpoDeviceNotRegistered(receipt))
            return;
        for (const token of normalizeExpoPushTargets(message.to))
            invalidTokens.add(token);
    });
    return [...invalidTokens];
}
//# sourceMappingURL=expoPushDelivery.js.map