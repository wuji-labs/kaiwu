import { z } from 'zod';
/**
 * `MentionRefV1` is the one-way persisted, transmitted and publicly exported shape
 * for a composer reference (D-13). Additive changes only.
 *
 * It carries **identity only** — never provider context. Provider context (a skill's
 * `path`, a vendor plugin's label) is reconstructed at send time from canonical state
 * (D-3, INV-9), because a path embedded in a long-lived reference goes stale.
 */
/**
 * Built-in kinds are namespaced so a later plugin-contributed kind cannot collide with
 * one of ours (D-12). `kind` itself stays an OPEN string: a well-formed reference of an
 * unknown kind survives load, save and transmission inert, and is never reinterpreted as
 * a known kind (INV-4).
 */
export declare const MENTION_KIND_V1: {
    readonly file: "happier.file";
    readonly skill: "happier.skill";
    readonly vendorPlugin: "happier.vendorPlugin";
    readonly session: "happier.session";
};
export type BuiltInMentionKindV1 = (typeof MENTION_KIND_V1)[keyof typeof MENTION_KIND_V1];
/** The `<scheme>` each built-in kind's `ref` uses. Derived in EU-D0 from producer state. */
export declare const MENTION_REF_SCHEME_V1: {
    readonly "happier.file": "file";
    readonly "happier.skill": "skill";
    readonly "happier.vendorPlugin": "vendorPlugin";
    readonly "happier.session": "session";
};
export declare const MENTION_BOUNDS: {
    readonly maxPerMessage: 64;
    readonly maxKindChars: 64;
    readonly maxRefChars: 512;
    readonly maxTokenChars: 256;
    readonly maxLabelChars: 256;
    readonly maxReferenceBlockChars: 2000;
    /** Bounds the sum of all resolved reference context in one message (D-27). */
    readonly maxResolvedContextChars: 2000;
};
export declare function encodeMentionRefComponent(value: string): string;
/** Returns `null` for a malformed escape sequence rather than silently keeping it raw. */
export declare function decodeMentionRefComponent(value: string): string | null;
export declare function buildMentionRefV1(scheme: string, opaque: string): string;
export declare function parseMentionRefV1(ref: string): Readonly<{
    scheme: string;
    opaque: string;
}> | null;
/**
 * Token contract (binding): `token` is the exact text the composer inserted, and the
 * reference is carried by the message whose text still contains it verbatim.
 *
 * A reference is IDENTITY plus the token that names it — never a position. Offsets were the
 * original contract and were removed once it was clear that no consumer read one: the
 * provider projection (`sessionReferenceBlock`) and the transcript row
 * (`messageStructuredReferences`) both work from `{kind, ref}` and both deduplicate position
 * away. What positions did instead was delete correct references, because the submitted text
 * is a TRANSFORM of the composed text — `messageToSend.trim()`, an attachments block, a
 * review-comments wrapper — and every such transform moved the token out from under its range.
 *
 * The bound that needs the message text cannot live here, because the protocol sanitizer
 * parses metadata independently of the text it accompanies — it is the composed admission
 * step, `admitMentionRefsV1ForText`.
 *
 * `token` is deliberately NOT trimmed: it must occur in the text exactly as inserted.
 */
export declare const MentionRefV1Schema: any;
export type MentionRefV1 = z.infer<typeof MentionRefV1Schema>;
/**
 * The two directions of a built-in kind's reference, so no consumer has to know which
 * `<scheme>` belongs to which kind. `readMentionRefOpaqueForKindV1` returns `null` when the
 * scheme does not match the kind asked for, which is what keeps a mismatched or unknown
 * reference from being reinterpreted as a known kind (INV-4).
 */
export declare function buildMentionRefForKindV1(kind: BuiltInMentionKindV1, opaque: string): string;
export declare function readMentionRefOpaqueForKindV1(kind: BuiltInMentionKindV1, ref: string): string | null;
/**
 * Element-wise sanitization (INV-4). A failing element is dropped **individually**; its
 * siblings survive.
 *
 * Order is first occurrence, and a repeat of an already-accepted `{kind, ref}` is dropped
 * (D-26). Without a range, a second entry for the same reference is byte-identical to the
 * first: it carries nothing, and keeping it would spend the per-message budget on nothing.
 * This makes `mentions[]` the SET of references a message carries, which is what every
 * consumer already reduced it to on its own.
 */
export declare function sanitizeMentionRefsV1(value: unknown): MentionRefV1[];
/**
 * The composed admission step: compares references against the submitted message text.
 * A reference whose token no longer occurs in that text is rejected; its siblings are
 * admitted (INV-4).
 *
 * This is what keeps a reference honest without making it fragile. It still enforces the one
 * rule a user can see — delete the `@…` text and the reference goes with it — while surviving
 * every transform the send path applies between composing the text and submitting it.
 *
 * Containment, not a delimited match: a user who deletes the picked token and then writes
 * text that happens to contain it keeps the reference. Recognising a token boundary here
 * would put a second copy of the composer's token grammar in the protocol, and the cost of
 * being wrong is one extra reference the agent is told to use only if the request calls for it.
 */
export declare function admitMentionRefsV1ForText(text: string, mentions: readonly MentionRefV1[]): MentionRefV1[];
//# sourceMappingURL=mentionRefV1.d.ts.map