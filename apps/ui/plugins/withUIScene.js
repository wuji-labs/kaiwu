/**
 * Expo config plugin: adopt the UIKit scene-based life cycle on iOS.
 *
 * Apple TN3187: in the next major release after iOS 26, apps built with the latest SDK
 * must adopt the UIScene life cycle or they will not launch. Only scene life-cycle adoption
 * is required; multiple scenes stay disabled.
 *
 * What it does on prebuild:
 * - Info.plist: single-scene UIApplicationSceneManifest pointing at SceneDelegate.
 * - AppDelegate.swift: stops creating the window in didFinishLaunching (the factory is still
 *   created there, so app-level subscribers keep working).
 * - SceneDelegate.swift: creates the window for the scene, starts React Native in it, and
 *   forwards URL opens / universal links to the existing AppDelegate handlers so
 *   expo-linking and RCTLinkingManager behave exactly as before.
 */

const fs = require("fs");
const path = require("path");
const {
  withInfoPlist,
  withAppDelegate,
  withXcodeProject,
  IOSConfig,
} = require("@expo/config-plugins");

const SCENE_DELEGATE_FILE = "SceneDelegate.swift";

const SCENE_DELEGATE_SOURCE = `import UIKit
import React

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)

    // Cold-start deep links and universal links arrive here instead of the app delegate.
    if let url = connectionOptions.urlContexts.first?.url {
      _ = appDelegate.application(UIApplication.shared, open: url, options: [:])
    }
    if let activity = connectionOptions.userActivities.first {
      _ = appDelegate.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

// The Expo 54 template creates the window and starts React Native in didFinishLaunching.
const WINDOW_START_PATTERN =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\(\s*\n\s*withModuleName: "main",\s*\n\s*in: window,\s*\n\s*launchOptions: launchOptions\)\s*\n#endif\s*\n/;

const WINDOW_START_REPLACEMENT =
  "    // Window creation and React Native start live in SceneDelegate (UIScene life cycle).\n";

function applyAppDelegateScenePatch(contents) {
  if (contents.includes("live in SceneDelegate (UIScene life cycle)")) {
    return contents;
  }
  if (!WINDOW_START_PATTERN.test(contents)) {
    throw new Error(
      "withUIScene: AppDelegate.swift does not match the Expo 54 window-start block; update the plugin for the new template."
    );
  }
  return contents.replace(WINDOW_START_PATTERN, WINDOW_START_REPLACEMENT);
}

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
      },
    ],
  },
};

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return cfg;
  });

const withAppDelegateScenePatch = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error("withUIScene: only the Swift AppDelegate (Expo 54+) is supported.");
    }
    cfg.modResults.contents = applyAppDelegateScenePatch(cfg.modResults.contents);
    return cfg;
  });

const withSceneDelegateFile = (config) =>
  withXcodeProject(config, (cfg) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const targetDir = path.join(cfg.modRequest.platformProjectRoot, projectName);
    fs.writeFileSync(path.join(targetDir, SCENE_DELEGATE_FILE), SCENE_DELEGATE_SOURCE);

    const groupFile = `${projectName}/${SCENE_DELEGATE_FILE}`;
    if (!cfg.modResults.hasFile(groupFile)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: groupFile,
        groupName: projectName,
        project: cfg.modResults,
      });
    }
    return cfg;
  });

function withUIScene(config) {
  config = withSceneManifest(config);
  config = withAppDelegateScenePatch(config);
  config = withSceneDelegateFile(config);
  return config;
}

module.exports = withUIScene;
module.exports.applyAppDelegateScenePatch = applyAppDelegateScenePatch;
module.exports.SCENE_DELEGATE_SOURCE = SCENE_DELEGATE_SOURCE;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
