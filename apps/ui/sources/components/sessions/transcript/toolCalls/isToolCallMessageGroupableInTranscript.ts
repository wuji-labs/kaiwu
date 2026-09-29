import type { Message, ToolCallMessage } from '@/sync/domains/messages/messageTypes';
import { readTurnChangeToolMetadataFromToolCall } from '@/sync/domains/session/changes/parsing/readTurnChangeToolMetadata';
import { isPendingUserActionRequest } from '@/utils/sessions/permissions/permissionPromptPolicy';
import { isSendFileToUserToolNameAlias } from '@happier-dev/protocol/tools/v2';

export function isToolCallMessageGroupableInTranscript(message: Message): message is ToolCallMessage {
    if (message.kind !== 'tool-call') return false;

    if (readTurnChangeToolMetadataFromToolCall(message.tool) != null) {
        return false;
    }

    // A file sent to the user is a deliverable, not an intermediate step: never fold it into a collapsed group.
    if (isSendFileToUserToolNameAlias(message.tool.name)) {
        return false;
    }

    return !isPendingUserActionRequest({
        toolName: message.tool.name,
        requestKind: message.tool.permission?.kind,
        permissionStatus: message.tool.permission?.status,
    });
}
