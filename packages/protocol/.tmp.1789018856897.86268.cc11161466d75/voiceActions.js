import { z } from 'zod';
import { listVoiceActionBlockSpecs, resolveVoiceClientToolNameAlias } from './actions/actionSpecs.js';
export const VOICE_ACTIONS_BLOCK = {
    startTag: '<voice_actions>',
    endTag: '</voice_actions>',
};
function unwrapVoiceActionSchema(schema) {
    let current = schema;
    for (;;) {
        if (current instanceof z.ZodOptional) {
            current = current._def.innerType;
            continue;
        }
        if (current instanceof z.ZodDefault) {
            current = current._def.innerType;
            continue;
        }
        if (current instanceof z.ZodNullable) {
            current = current._def.innerType;
            continue;
        }
        if (current instanceof z.ZodPipe) {
            current = current._def.in;
            continue;
        }
        break;
    }
    return current;
}
function listVoiceActionSchemaEntries() {
    return listVoiceActionBlockSpecs().flatMap((spec) => {
        const toolName = spec.bindings?.voiceClientToolName;
        if (!toolName)
            return [];
        return [{ toolName, inputSchema: spec.inputSchema }];
    });
}
function buildVoiceAssistantActionSchema() {
    // Centralized: the action block schema is derived from Action Specs.
    // Each spec that opts into surface.voice_action_block must bind a stable voiceClientToolName and inputSchema.
    const voiceActionBlockOptions = listVoiceActionSchemaEntries().map(({ toolName, inputSchema }) => {
        return [
            z.object({
                t: z.literal(toolName),
                args: inputSchema,
            }),
        ];
    });
    return z.discriminatedUnion('t', voiceActionBlockOptions.flat());
}
let memoizedVoiceAssistantActionSchema;
function getVoiceAssistantActionSchema() {
    if (!memoizedVoiceAssistantActionSchema) {
        memoizedVoiceAssistantActionSchema = buildVoiceAssistantActionSchema();
    }
    return memoizedVoiceAssistantActionSchema;
}
export const VoiceAssistantActionSchema = z.lazy(() => getVoiceAssistantActionSchema());
let memoizedVoiceActionSchemaByToolName;
function getVoiceActionSchemaByToolName() {
    if (!memoizedVoiceActionSchemaByToolName) {
        memoizedVoiceActionSchemaByToolName = new Map(listVoiceActionSchemaEntries().map(({ toolName, inputSchema }) => [toolName, inputSchema]));
    }
    return memoizedVoiceActionSchemaByToolName;
}
function coerceVoiceActionScalarStrings(value) {
    if (Array.isArray(value))
        return value.map((entry) => coerceVoiceActionScalarStrings(entry));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, coerceVoiceActionScalarStrings(entry)]));
    }
    if (typeof value !== 'string')
        return value;
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    if (value === 'null')
        return null;
    if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) {
        const parsedNumber = Number(value);
        if (Number.isFinite(parsedNumber))
            return parsedNumber;
    }
    return value;
}
function splitVoiceActionListString(value) {
    return value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}
function coerceVoiceActionValueForSchema(value, schema) {
    const core = unwrapVoiceActionSchema(schema);
    if (core instanceof z.ZodObject) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return coerceVoiceActionScalarStrings(value);
        }
        const shape = core.shape ?? core._def?.shape ?? {};
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
            const fieldSchema = shape?.[key];
            return [key, fieldSchema ? coerceVoiceActionValueForSchema(entry, fieldSchema) : coerceVoiceActionScalarStrings(entry)];
        }));
    }
    if (core instanceof z.ZodArray) {
        const elementSchema = core._def?.element;
        const items = Array.isArray(value)
            ? value
            : typeof value === 'string'
                ? splitVoiceActionListString(value)
                : null;
        if (!items)
            return coerceVoiceActionScalarStrings(value);
        return items.map((entry) => (elementSchema ? coerceVoiceActionValueForSchema(entry, elementSchema) : coerceVoiceActionScalarStrings(entry)));
    }
    if (core instanceof z.ZodUnion || core instanceof z.ZodDiscriminatedUnion) {
        const options = Array.isArray(core._def?.options)
            ? core._def.options
            : core instanceof z.ZodDiscriminatedUnion && core.options instanceof Map
                ? Array.from(core.options.values())
                : [];
        for (const option of options) {
            const candidate = coerceVoiceActionValueForSchema(value, option);
            if (option.safeParse(candidate).success)
                return candidate;
        }
    }
    return coerceVoiceActionScalarStrings(value);
}
function parseVoiceAssistantAction(rawAction) {
    if (!rawAction || typeof rawAction !== 'object')
        return null;
    const rawToolName = typeof rawAction.t === 'string' ? rawAction.t.trim() : '';
    if (rawToolName.length === 0)
        return null;
    const toolName = resolveVoiceClientToolNameAlias(rawToolName);
    if (!toolName)
        return null;
    const inputSchema = getVoiceActionSchemaByToolName().get(toolName);
    if (!inputSchema)
        return null;
    const rawArgs = rawAction.args;
    const direct = inputSchema.safeParse(rawArgs);
    if (direct.success) {
        return { t: toolName, args: direct.data };
    }
    const coercedArgs = coerceVoiceActionValueForSchema(rawArgs, inputSchema);
    const coerced = inputSchema.safeParse(coercedArgs);
    if (!coerced.success)
        return null;
    return { t: toolName, args: coerced.data };
}
export function extractVoiceActionsFromAssistantText(assistantTextRaw) {
    const assistantText = String(assistantTextRaw ?? '');
    const startIndex = assistantText.lastIndexOf(VOICE_ACTIONS_BLOCK.startTag);
    if (startIndex < 0)
        return { assistantText: assistantText.trim(), actions: [] };
    const endIndex = assistantText.indexOf(VOICE_ACTIONS_BLOCK.endTag, startIndex);
    if (endIndex < 0)
        return { assistantText: assistantText.trim(), actions: [] };
    const jsonRaw = assistantText
        .slice(startIndex + VOICE_ACTIONS_BLOCK.startTag.length, endIndex)
        .trim();
    try {
        const parsedJson = JSON.parse(jsonRaw);
        if (!parsedJson || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
            return { assistantText: assistantText.trim(), actions: [] };
        }
        const rawActionsValue = parsedJson.actions;
        if (rawActionsValue !== undefined && !Array.isArray(rawActionsValue)) {
            return { assistantText: assistantText.trim(), actions: [] };
        }
        const rawActions = Array.isArray(rawActionsValue) ? rawActionsValue : [];
        const actions = rawActions
            .map((rawAction) => parseVoiceAssistantAction(rawAction))
            .filter((action) => action !== null);
        if (rawActions.length > 0 && actions.length === 0) {
            return { assistantText: assistantText.trim(), actions: [] };
        }
        const stripped = `${assistantText.slice(0, startIndex)}${assistantText.slice(endIndex + VOICE_ACTIONS_BLOCK.endTag.length)}`;
        return { assistantText: stripped.trim(), actions };
    }
    catch {
        return { assistantText: assistantText.trim(), actions: [] };
    }
}
//# sourceMappingURL=voiceActions.js.map