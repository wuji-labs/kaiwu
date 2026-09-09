import { AGENT_IDS, getAgentBehavior, getAgentCore } from '@/agents/catalog/catalog';

export function listSessionGettingStartedCliCommands(commandName = 'kaiwu'): readonly string[] {
    const commands = [commandName];

    for (const agentId of AGENT_IDS) {
        if (getAgentBehavior(agentId).guidance?.includeInSessionGettingStartedCliExamples !== true) {
            continue;
        }

        commands.push(`${commandName} ${getAgentCore(agentId).cli.detectKey}`);
    }

    return commands;
}
