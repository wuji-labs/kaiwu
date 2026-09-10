import { z } from 'zod';
import type { FeaturesResponse } from '../featuresResponseSchema.js';
export declare const MACHINE_TRANSFER_SERVER_ROUTED_MAX_BYTES_ENV_KEY = "HAPPIER_FEATURE_MACHINES_TRANSFER_SERVER_ROUTED__MAX_BYTES";
export declare function normalizeMachineTransferServerRoutedMaxBytes(raw: unknown): number | null;
export declare const MachineTransferServerRoutedCapabilitiesSchema: any;
export type MachineTransferServerRoutedCapabilities = z.infer<typeof MachineTransferServerRoutedCapabilitiesSchema>;
export declare const DEFAULT_MACHINE_TRANSFER_SERVER_ROUTED_CAPABILITIES: MachineTransferServerRoutedCapabilities;
export declare const MachineTransferCapabilitiesSchema: any;
export type MachineTransferCapabilities = z.infer<typeof MachineTransferCapabilitiesSchema>;
export declare const DEFAULT_MACHINE_TRANSFER_CAPABILITIES: MachineTransferCapabilities;
export declare function readMachineTransferServerRoutedMaxBytes(features: Pick<FeaturesResponse, 'capabilities'> | null | undefined): number | null;
//# sourceMappingURL=machineTransferCapabilities.d.ts.map