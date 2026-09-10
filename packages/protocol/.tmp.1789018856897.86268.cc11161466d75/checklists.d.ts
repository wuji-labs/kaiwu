export declare const CHECKLIST_IDS: {
    readonly NEW_SESSION: "new-session";
    readonly MACHINE_DETAILS: "machine-details";
};
export type ResumeChecklistId = `resume.${string}`;
export type ChecklistId = (typeof CHECKLIST_IDS)[keyof typeof CHECKLIST_IDS] | ResumeChecklistId;
export declare function resumeChecklistId<const TAgentId extends string>(agentId: TAgentId): `resume.${TAgentId}`;
//# sourceMappingURL=checklists.d.ts.map