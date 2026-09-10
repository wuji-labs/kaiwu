import { z } from 'zod';
export declare const MachineReplacementReasonSchema: any;
export type MachineReplacementReason = z.infer<typeof MachineReplacementReasonSchema>;
export declare const MachineReplacementFieldsSchema: any;
export type MachineReplacementFields = z.infer<typeof MachineReplacementFieldsSchema>;
export type MachineReplacementRegistrationIntent = Readonly<{
    replacesMachineId: string;
    replacementReason: MachineReplacementReason;
}>;
export declare function readMachineReplacementRegistrationIntent(input: unknown): MachineReplacementRegistrationIntent | null;
//# sourceMappingURL=machineReplacement.d.ts.map