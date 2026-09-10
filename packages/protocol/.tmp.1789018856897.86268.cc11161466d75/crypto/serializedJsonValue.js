const SERIALIZED_JSON_VALUE_SENTINEL = '__happierSerializedJsonValueV1';
export function stringifySerializedJsonValue(value) {
    const envelope = value === undefined
        ? {
            [SERIALIZED_JSON_VALUE_SENTINEL]: true,
            type: 'undefined',
        }
        : {
            [SERIALIZED_JSON_VALUE_SENTINEL]: true,
            type: 'json',
            value,
        };
    return JSON.stringify(envelope, (_key, currentValue) => {
        if (typeof currentValue === 'bigint') {
            return `${currentValue}n`;
        }
        return currentValue;
    });
}
export function parseSerializedJsonValue(serialized) {
    if (serialized === 'undefined') {
        return undefined;
    }
    const parsed = JSON.parse(serialized);
    if (!isSerializedJsonEnvelope(parsed)) {
        return parsed;
    }
    return parsed.type === 'undefined' ? undefined : parsed.value;
}
function isSerializedJsonEnvelope(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value;
    if (candidate[SERIALIZED_JSON_VALUE_SENTINEL] !== true) {
        return false;
    }
    if (candidate.type === 'undefined') {
        return true;
    }
    return candidate.type === 'json' && Object.prototype.hasOwnProperty.call(candidate, 'value');
}
//# sourceMappingURL=serializedJsonValue.js.map