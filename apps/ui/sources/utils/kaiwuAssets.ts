/**
 * Kaiwu's own static asset host. Release-note media and on-device voice model packs are served from
 * here instead of GitHub Releases, so the app never depends on a third-party release page.
 * Files live at `${KAIWU_ASSETS_BASE_URL}/<tag>/<fileName>`.
 */
export const KAIWU_ASSETS_BASE_URL = 'https://kaiwu-static-1444025891.cos.ap-shanghai.myqcloud.com/assets';

export function kaiwuAssetUrl(tag: string, fileName = ''): string {
    return `${KAIWU_ASSETS_BASE_URL}/${tag}/${fileName}`;
}
