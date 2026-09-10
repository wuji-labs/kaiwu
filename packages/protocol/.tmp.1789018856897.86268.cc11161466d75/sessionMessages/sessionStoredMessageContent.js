import { z } from 'zod';
export const SessionStoredMessageContentSchema = z.preprocess((value) => {
    // Backwards compatibility: older clients/servers stored message content as a bare ciphertext string.
    if (typeof value === 'string') {
        const ciphertext = value.trim();
        return ciphertext ? { t: 'encrypted', c: ciphertext } : value;
    }
    // Backwards compatibility: some call sites used `{ ciphertext: string }`.
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value;
        if (typeof record.ciphertext === 'string') {
            const ciphertext = record.ciphertext.trim();
            return ciphertext ? { t: 'encrypted', c: ciphertext } : value;
        }
    }
    return value;
}, z.discriminatedUnion('t', [
    z.object({
        t: z.literal('encrypted'),
        c: z.string().min(1),
    }),
    z.object({
        t: z.literal('plain'),
        v: z.unknown(),
    }),
]));
//# sourceMappingURL=sessionStoredMessageContent.js.map