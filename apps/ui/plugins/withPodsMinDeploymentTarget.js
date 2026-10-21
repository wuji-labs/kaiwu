/**
 * Expo config plugin: raise every Pods target to the app's minimum iOS version.
 *
 * Xcode 27 only accepts deployment targets from iOS 15.0 upward; several pods still declare
 * 6.0-13.4 in their podspecs, which Xcode 27 reports as hard errors. The app itself already
 * targets 15.1 (Expo 54 default), so pods below that are lifted to 15.1 in post_install.
 */

const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

const MIN_IOS = "15.1";

const POST_INSTALL_SNIPPET = `    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${MIN_IOS}')
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS}'
        end
      end
    end`;

function applyPodfilePatch(podfile) {
  const result = mergeContents({
    tag: "kaiwu-pods-min-deployment-target",
    src: podfile,
    newSrc: POST_INSTALL_SNIPPET,
    anchor: /post_install do \|installer\|/,
    offset: 1,
    comment: "#",
  });
  if (!result.didMerge && !result.didClear && !podfile.includes("kaiwu-pods-min-deployment-target")) {
    throw new Error("withPodsMinDeploymentTarget: post_install block not found in Podfile.");
  }
  return result.contents;
}

const withPodsMinDeploymentTarget = (config) =>
  withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      const podfile = fs.readFileSync(podfilePath, "utf8");
      fs.writeFileSync(podfilePath, applyPodfilePatch(podfile));
      return cfg;
    },
  ]);

module.exports = withPodsMinDeploymentTarget;
module.exports.applyPodfilePatch = applyPodfilePatch;
module.exports.MIN_IOS = MIN_IOS;
