import { redactBugReportSensitiveText, trimBugReportTextToMaxBytes } from './redaction.js';
export async function withAbortTimeout(timeoutMs, run) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));
    try {
        return await run(controller.signal);
    }
    finally {
        clearTimeout(timeout);
    }
}
export async function readSafeBugReportErrorText(response) {
    try {
        const text = await response.text();
        const sanitized = trimBugReportTextToMaxBytes(redactBugReportSensitiveText(String(text ?? '')), 1024).trim();
        return sanitized || 'unknown error';
    }
    catch {
        return 'unknown error';
    }
}
export async function postJson(input) {
    const response = await withAbortTimeout(input.timeoutMs, async (signal) => await fetch(input.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input.body),
        signal,
    }));
    if (!response.ok) {
        const safeErrorText = await readSafeBugReportErrorText(response);
        throw new Error(`Request failed (${response.status}): ${safeErrorText}`);
    }
    return await response.json();
}
export async function getJson(input) {
    const response = await withAbortTimeout(input.timeoutMs, async (signal) => await fetch(input.url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
        signal,
    }));
    if (!response.ok) {
        const safeErrorText = await readSafeBugReportErrorText(response);
        throw new Error(`Request failed (${response.status}): ${safeErrorText}`);
    }
    return await response.json();
}
//# sourceMappingURL=http.js.map