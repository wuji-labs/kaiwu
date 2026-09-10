import { z } from 'zod';
export declare const ActionApprovalFlowSchema: any;
export type ActionApprovalFlow = z.infer<typeof ActionApprovalFlowSchema>;
export declare const ActionApprovalResultSchema: any;
export type ActionApprovalResult = z.infer<typeof ActionApprovalResultSchema>;
export declare const ActionApprovalSchema: any;
export type ActionApproval = z.infer<typeof ActionApprovalSchema>;
export declare function resolveActionApprovalFlow(approval: ActionApproval): ActionApprovalFlow;
//# sourceMappingURL=actionApprovalMetadata.d.ts.map