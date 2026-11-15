import { Platform } from 'react-native';

type KokoroSupportOverrides = {
  platformOs?: string;
  hasNativeModule?: boolean;
};

export function isKokoroRuntimeSupported(
  globals: Partial<typeof globalThis> = globalThis,
  overrides: KokoroSupportOverrides = {},
): boolean {
  const platformOs = overrides.platformOs ?? Platform.OS;

  // On native, Kokoro has no first-party runtime implementation; only an injected native module is supported.
  if (platformOs !== 'web') {
    return overrides.hasNativeModule === true;
  }

  // On web, Kokoro (via transformers + onnxruntime-web) requires fetch/Response and WebAssembly for the default WASM backend.
  // If any required runtime primitive is missing, avoid attempting to initialize the runtime.
  if (typeof globals.fetch !== 'function') return false;
  if (typeof (globals as any).Response === 'undefined') return false;
  if (typeof (globals as any).WebAssembly === 'undefined') return false;
  if (typeof (globals as any).TextEncoder === 'undefined') return false;
  return true;
}
