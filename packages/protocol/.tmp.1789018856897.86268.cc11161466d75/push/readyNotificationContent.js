function normalizeNotificationText(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}
export function buildReadyNotificationContent(params) {
    const title = normalizeNotificationText(params.sessionTitle) ??
        normalizeNotificationText(params.defaultTitle) ??
        normalizeNotificationText(params.waitingForCommandLabel) ??
        'Session';
    const previewText = params.includeMessageText === false ? null : normalizeNotificationText(params.messageText);
    const fallbackBody = normalizeNotificationText(params.fallbackBody) ??
        `${normalizeNotificationText(params.waitingForCommandLabel) ?? 'Session'} is waiting for your command`;
    return {
        title,
        body: previewText ?? fallbackBody,
    };
}
//# sourceMappingURL=readyNotificationContent.js.map