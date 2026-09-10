import { z } from 'zod';
export declare const EXECUTION_RUN_ACTION_PERMISSION_MODES: readonly ["read_only", "default", "workspace_write", "yolo"];
export declare const EXECUTION_RUN_ACTION_PERMISSION_MODE_DESCRIPTION: string;
export declare const ExecutionRunActionPermissionModeSchema: any;
export type ExecutionRunActionPermissionMode = z.infer<typeof ExecutionRunActionPermissionModeSchema>;
//# sourceMappingURL=executionRunActionPermissionMode.d.ts.map