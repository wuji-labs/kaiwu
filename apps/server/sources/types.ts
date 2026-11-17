import { ImageRef } from "./storage/blob/files";
import type { LinkedProvider } from "./app/auth/providers/linkedProviders";
import type { AccountProfile as ProtocolAccountProfile } from "@happier-dev/protocol";

export type AccountProfile = {
    firstName: string | null;
    lastName: string | null;
    username: string | null;
    avatar: ImageRef | null;
    linkedProviders: LinkedProvider[];
    settings: {
        value: string | null;
        version: number;
    } | null;
    settingsV2?: {
        content: unknown | null;
        version: number;
    } | null;
    connectedServices: string[];
    connectedServicesV2?: ProtocolAccountProfile["connectedServicesV2"];
}
