// Contract tests for the Xcode 27 / iOS 27 SDK config plugins, run against the real Expo 54
// bare template (fixtures copied from expo-template-bare-minimum@54.0.53).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(here, "__fixtures__", name), "utf8");

const withUIScene = require("./withUIScene.js");
const withPods = require("./withPodsMinDeploymentTarget.js");

test("AppDelegate patch removes window creation and keeps factory setup", () => {
  const patched = withUIScene.applyAppDelegateScenePatch(fixture("expo54-AppDelegate.swift"));
  assert.ok(!patched.includes("UIWindow(frame: UIScreen.main.bounds)"));
  assert.ok(!patched.includes("in: window,"));
  assert.ok(patched.includes("bindReactNativeFactory(factory)"));
  assert.ok(patched.includes("reactNativeFactory = factory"));
  assert.ok(patched.includes("live in SceneDelegate (UIScene life cycle)"));
});

test("AppDelegate patch is idempotent", () => {
  const once = withUIScene.applyAppDelegateScenePatch(fixture("expo54-AppDelegate.swift"));
  assert.equal(withUIScene.applyAppDelegateScenePatch(once), once);
});

test("AppDelegate patch fails loudly on an unknown template", () => {
  assert.throws(() => withUIScene.applyAppDelegateScenePatch("class AppDelegate {}"), /window-start block/);
});

test("SceneDelegate starts React Native in a scene window and forwards links", () => {
  const src = withUIScene.SCENE_DELEGATE_SOURCE;
  assert.match(src, /class SceneDelegate: UIResponder, UIWindowSceneDelegate/);
  assert.match(src, /UIWindow\(windowScene: windowScene\)/);
  assert.match(src, /startReactNative\(withModuleName: "main", in: window/);
  assert.match(src, /openURLContexts/);
  assert.match(src, /continue userActivity/);
  // the template's AppDelegate exposes the members SceneDelegate relies on
  const appDelegate = fixture("expo54-AppDelegate.swift");
  assert.match(appDelegate, /var window: UIWindow\?/);
  assert.match(appDelegate, /var reactNativeFactory: RCTReactNativeFactory\?/);
});

test("scene manifest is single-scene and points at SceneDelegate", () => {
  const m = withUIScene.SCENE_MANIFEST;
  assert.equal(m.UIApplicationSupportsMultipleScenes, false);
  const cfg = m.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0];
  assert.equal(cfg.UISceneDelegateClassName, "$(PRODUCT_MODULE_NAME).SceneDelegate");
});

test("Podfile patch lifts pod deployment targets inside post_install, idempotently", () => {
  const podfile = fixture("expo54-Podfile");
  const once = withPods.applyPodfilePatch(podfile);
  const anchor = once.indexOf("post_install do |installer|");
  const snippet = once.indexOf("IPHONEOS_DEPLOYMENT_TARGET");
  assert.ok(anchor >= 0 && snippet > anchor, "snippet must sit inside post_install");
  assert.ok(once.includes(`Gem::Version.new('${withPods.MIN_IOS}')`));
  assert.equal(withPods.applyPodfilePatch(once), once);
});
