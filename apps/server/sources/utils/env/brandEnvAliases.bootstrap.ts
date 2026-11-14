/**
 * Side-effect module: must be the first import of every server entrypoint so that the
 * KAIWU_* / HAPPIER_* aliases exist before any module reads configuration at load time.
 */
import { applyBrandEnvAliases, formatLegacyBrandEnvNotice } from './brandEnvAliases';

const notice = formatLegacyBrandEnvNotice(applyBrandEnvAliases(process.env).legacyKeysUsed);
if (notice) {
    console.warn(notice);
}
