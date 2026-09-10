import { z } from 'zod';
export const WINDOWS_REMOTE_SESSION_LAUNCH_MODES = ['hidden', 'windows_terminal', 'console'];
export const WindowsRemoteSessionLaunchModeSchema = z.enum(WINDOWS_REMOTE_SESSION_LAUNCH_MODES);
//# sourceMappingURL=windowsRemoteSessionLaunchMode.js.map