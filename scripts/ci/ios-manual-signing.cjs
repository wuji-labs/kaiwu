// Switch the prebuilt app target(s) to manual App Store signing.
// Usage: node scripts/ci/ios-manual-signing.cjs <project.pbxproj> <teamId> <profileName>
// Only application targets are touched; Pods keep their own settings.
const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

const [pbxPath, teamId, profileName] = process.argv.slice(2);
if (!pbxPath || !teamId || !profileName) {
    throw new Error('usage: ios-manual-signing.cjs <project.pbxproj> <teamId> <profileName>');
}

const quote = (v) => `"${v}"`;
const project = xcode.project(pbxPath).parseSync();
const targets = project.pbxNativeTargetSection();
const lists = project.pbxXCConfigurationList();
const configs = project.pbxXCBuildConfigurationSection();

let patched = 0;
for (const [key, target] of Object.entries(targets)) {
    if (key.endsWith('_comment') || target.productType !== quote('com.apple.product-type.application')) continue;
    for (const ref of lists[target.buildConfigurationList].buildConfigurations) {
        const settings = configs[ref.value].buildSettings;
        settings.CODE_SIGN_STYLE = 'Manual';
        settings.DEVELOPMENT_TEAM = teamId;
        settings.CODE_SIGN_IDENTITY = quote('Apple Distribution');
        settings[quote('CODE_SIGN_IDENTITY[sdk=iphoneos*]')] = quote('Apple Distribution');
        settings.PROVISIONING_PROFILE_SPECIFIER = quote(profileName);
        patched += 1;
    }
}
if (!patched) throw new Error('no application target found');
fs.writeFileSync(pbxPath, project.writeSync());
console.log(`manual signing applied to ${patched} build configuration(s)`);

// Prebuild writes aps-environment=development; the App Store profile carries production,
// and a mismatch fails codesign during archive.
const iosDir = path.dirname(path.dirname(pbxPath));
for (const dir of fs.readdirSync(iosDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(iosDir, dir.name))) {
        if (!file.endsWith('.entitlements')) continue;
        const entPath = path.join(iosDir, dir.name, file);
        const before = fs.readFileSync(entPath, 'utf8');
        const after = before.replace(
            /(<key>aps-environment<\/key>\s*<string>)development(<\/string>)/,
            '$1production$2',
        );
        if (after !== before) {
            fs.writeFileSync(entPath, after);
            console.log(`aps-environment -> production in ${entPath}`);
        }
    }
}
