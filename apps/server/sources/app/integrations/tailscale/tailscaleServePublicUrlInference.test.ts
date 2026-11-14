import { describe, expect, it } from "vitest";

import { inferAndApplyTailscaleServePublicServerUrl } from "./tailscaleServePublicUrlInference";

describe("inferAndApplyTailscaleServePublicServerUrl", () => {
    it("sets KAIWU_PUBLIC_SERVER_URL when inferred and not already set", async () => {
        const env: Record<string, string | undefined> = {
            PORT: "3005",
            KAIWU_PUBLIC_SERVER_URL: "",
            KAIWU_TAILSCALE_INFER_PUBLIC_URL: "1",
        };
        const applied = await inferAndApplyTailscaleServePublicServerUrl(env, {
            runTailscaleServeStatus: async () =>
                [
                    "https://my-machine.tailnet.ts.net",
                    "|-- / proxy http://127.0.0.1:3005",
                    "",
                ].join("\n"),
        });
        expect(applied).toBe("https://my-machine.tailnet.ts.net");
        expect(env.KAIWU_PUBLIC_SERVER_URL).toBe("https://my-machine.tailnet.ts.net");
    });

    it("does not infer a Tailscale URL when serve status points at a different local port", async () => {
        const env: Record<string, string | undefined> = {
            PORT: "52753",
            KAIWU_PUBLIC_SERVER_URL: "",
            KAIWU_TAILSCALE_INFER_PUBLIC_URL: "1",
        };
        const applied = await inferAndApplyTailscaleServePublicServerUrl(env, {
            runTailscaleServeStatus: async () =>
                [
                    "https://my-machine.tailnet.ts.net",
                    "|-- / proxy http://127.0.0.1:24610",
                    "",
                ].join("\n"),
        });
        expect(applied).toBeNull();
        expect(env.KAIWU_PUBLIC_SERVER_URL).toBe("");
    });

    it("does not override KAIWU_PUBLIC_SERVER_URL when already set", async () => {
        const env: Record<string, string | undefined> = {
            PORT: "3005",
            KAIWU_PUBLIC_SERVER_URL: "https://explicit.example.test",
            KAIWU_TAILSCALE_INFER_PUBLIC_URL: "1",
        };
        const applied = await inferAndApplyTailscaleServePublicServerUrl(env, {
            runTailscaleServeStatus: async () => {
                throw new Error("should not be called");
            },
        });
        expect(applied).toBeNull();
        expect(env.KAIWU_PUBLIC_SERVER_URL).toBe("https://explicit.example.test");
    });

    it("respects KAIWU_TAILSCALE_INFER_PUBLIC_URL=0", async () => {
        const env: Record<string, string | undefined> = {
            PORT: "3005",
            KAIWU_PUBLIC_SERVER_URL: "",
            KAIWU_TAILSCALE_INFER_PUBLIC_URL: "0",
        };
        const applied = await inferAndApplyTailscaleServePublicServerUrl(env, {
            runTailscaleServeStatus: async () =>
                [
                    "https://my-machine.tailnet.ts.net",
                    "|-- / proxy http://127.0.0.1:3005",
                    "",
                ].join("\n"),
        });
        expect(applied).toBeNull();
        expect(env.KAIWU_PUBLIC_SERVER_URL).toBe("");
    });
});
