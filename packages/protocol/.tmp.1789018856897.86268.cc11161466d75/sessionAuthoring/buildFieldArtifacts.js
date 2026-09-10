import { z } from 'zod';
function parseFieldDefault(key, definition) {
    if (definition.default === undefined) {
        return undefined;
    }
    const parsed = definition.schema.safeParse(definition.default);
    if (!parsed.success) {
        throw new Error(`Invalid default for session authoring field "${key}"`);
    }
    return parsed.data;
}
export function buildSessionAuthoringFieldArtifacts(definitions) {
    const shape = {};
    const defaults = {};
    const syncedFieldIds = [];
    const syncedShape = {};
    for (const key of Object.keys(definitions)) {
        const definition = definitions[key];
        shape[key] = definition.schema;
        if (definition.draftStorage === 'sync') {
            const syncedKey = key;
            syncedFieldIds.push(syncedKey);
            syncedShape[syncedKey] = (definition.draftSchema ?? definition.schema);
        }
        const parsedDefault = parseFieldDefault(String(key), definition);
        if (parsedDefault !== undefined) {
            defaults[key] = parsedDefault;
        }
    }
    return {
        definitions,
        shape,
        valueSchema: z.object(shape).strict(),
        defaults,
        syncedFieldIds,
        syncedShape,
        syncedValueSchema: z.object(syncedShape).strict(),
    };
}
//# sourceMappingURL=buildFieldArtifacts.js.map