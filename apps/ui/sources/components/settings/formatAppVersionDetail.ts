import type { CurrentAppRuntimeInfo } from '@/sync/runtime/readCurrentAppRuntimeInfo';

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

/**
 * Version text for Settings → About. When the running JS came from an OTA update, append when that
 * update was published, so it is obvious at a glance whether (and which) hot update is live.
 */
export function formatAppVersionDetail(
    appVersion: string,
    runtime: Pick<CurrentAppRuntimeInfo, 'launchSource' | 'updateCreatedAt'>,
): string {
    if (runtime.launchSource !== 'ota' || !runtime.updateCreatedAt) {
        return appVersion;
    }
    const createdAt = new Date(runtime.updateCreatedAt);
    if (Number.isNaN(createdAt.getTime())) {
        return `${appVersion} · OTA`;
    }
    const stamp = `${pad2(createdAt.getMonth() + 1)}-${pad2(createdAt.getDate())} ${pad2(createdAt.getHours())}:${pad2(createdAt.getMinutes())}`;
    return `${appVersion} · OTA ${stamp}`;
}
