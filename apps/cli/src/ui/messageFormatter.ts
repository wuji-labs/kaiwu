import chalk from 'chalk';
import type { SDKMessage, SDKAssistantMessage, SDKResultMessage, SDKSystemMessage, SDKUserMessage } from '@/backends/claude/sdk';
import { logger } from './logger';

export type OnAssistantResultCallback = (result: SDKResultMessage) => void | Promise<void>;

/**
 * Formats Claude SDK messages for terminal display
 */
export function formatClaudeMessage(
    message: SDKMessage,
    onAssistantResult?: OnAssistantResultCallback
): void {
    logger.debugLargeJson('[CLAUDE] Message from non interactive & remote mode:', message)

    switch (message.type) {
        case 'system': {
            const sysMsg = message as SDKSystemMessage;
            if (sysMsg.subtype === 'init') {
                console.log(chalk.gray('─'.repeat(60)));
                console.log(chalk.blue.bold('🚀 会话已初始化：'), chalk.cyan(sysMsg.session_id));
                console.log(chalk.gray(`  模型：${sysMsg.model}`));
                console.log(chalk.gray(`  当前目录：${sysMsg.cwd}`));
                if (sysMsg.tools && sysMsg.tools.length > 0) {
                    console.log(chalk.gray(`  工具：${sysMsg.tools.join(', ')}`));
                }
                console.log(chalk.gray('─'.repeat(60)));
            }
            break;
        }

        case 'user': {
            const userMsg = message as SDKUserMessage;
            // Handle different types of user message content
            if (userMsg.message && typeof userMsg.message === 'object' && 'content' in userMsg.message) {
                const content = userMsg.message.content;
                
                // Handle string content
                if (typeof content === 'string') {
                    console.log(chalk.magenta.bold('\n👤 用户：'), content);
                } 
                // Handle array content (can contain text blocks and tool result blocks)
                else if (Array.isArray(content)) {
                    for (const block of content) {
                        if (block.type === 'text') {
                            console.log(chalk.magenta.bold('\n👤 用户：'), block.text);
                        } else if (block.type === 'tool_result') {
                            console.log(chalk.green.bold('\n✅ 工具结果：'), chalk.gray(`（工具 ID：${block.tool_use_id}）`));
                            if (block.content) {
                                const outputStr = typeof block.content === 'string' 
                                    ? block.content 
                                    : JSON.stringify(block.content, null, 2);
                                const maxLength = 200;
                                if (outputStr.length > maxLength) {
                                    console.log(outputStr.substring(0, maxLength) + chalk.gray('\n……（已截断）'));
                                } else {
                                    console.log(outputStr);
                                }
                            }
                        }
                    }
                }
                // Handle other content types
                else {
                    console.log(chalk.magenta.bold('\n👤 用户：'), JSON.stringify(content, null, 2));
                }
            }
            break;
        }

        case 'assistant': {
            const assistantMsg = message as SDKAssistantMessage;
            if (assistantMsg.message && assistantMsg.message.content) {
                console.log(chalk.cyan.bold('\n🤖 助手：'));
                
                // Handle content array (can contain text blocks and tool use blocks)
                for (const block of assistantMsg.message.content) {
                    if (block.type === 'text') {
                        console.log(block.text);
                    } else if (block.type === 'tool_use') {
                        console.log(chalk.yellow.bold(`\n🔧 工具：${block.name}`));
                        if (block.input) {
                            const inputStr = JSON.stringify(block.input, null, 2);
                            const maxLength = 500;
                            if (inputStr.length > maxLength) {
                                console.log(chalk.gray('输入：'), inputStr.substring(0, maxLength) + chalk.gray('\n……（已截断）'));
                            } else {
                                console.log(chalk.gray('输入：'), inputStr);
                            }
                        }
                    }
                }
            }
            break;
        }

        case 'result': {
            const resultMsg = message as SDKResultMessage;
            if (resultMsg.subtype === 'success') {
                if ('result' in resultMsg && resultMsg.result) {
                    console.log(chalk.green.bold('\n✨ 摘要：'));
                    console.log(resultMsg.result);
                }
                
                // Show usage stats
                if (resultMsg.usage) {
                    console.log(chalk.gray('\n📊 会话统计：'));
                    console.log(chalk.gray(`  • 轮次：${resultMsg.num_turns}`));
                    console.log(chalk.gray(`  • 输入令牌：${resultMsg.usage.input_tokens}`));
                    console.log(chalk.gray(`  • 输出令牌：${resultMsg.usage.output_tokens}`));
                    if (resultMsg.usage.cache_read_input_tokens) {
                        console.log(chalk.gray(`  • 缓存读取令牌：${resultMsg.usage.cache_read_input_tokens}`));
                    }
                    if (resultMsg.usage.cache_creation_input_tokens) {
                        console.log(chalk.gray(`  • 缓存创建令牌：${resultMsg.usage.cache_creation_input_tokens}`));
                    }
                    console.log(chalk.gray(`  • 费用：$${resultMsg.total_cost_usd.toFixed(4)}`));
                    console.log(chalk.gray(`  • 用时：${resultMsg.duration_ms}ms`));

                    // Show instructions how to take over terminal control
                    console.log(chalk.gray('\n👀 已经回来了吗？'));
                    console.log(chalk.green('👉 按任意键即可在 `claude` 中继续此会话'));

                    // Call the assistant result callback after showing instructions
                    if (onAssistantResult) {
                        Promise.resolve(onAssistantResult(resultMsg)).catch(err => {
                            logger.debug('Error in onAssistantResult callback:', err);
                        });
                    }
                }
            } else if (resultMsg.subtype === 'error_max_turns') {
                console.log(chalk.red.bold('\n❌ 错误：已达到最大轮次'));
                console.log(chalk.gray(`已完成 ${resultMsg.num_turns} 轮`));
            } else if (resultMsg.subtype === 'error_during_execution') {
                console.log(chalk.red.bold('\n❌ 执行过程中出错'));
                console.log(chalk.gray(`出错前已完成 ${resultMsg.num_turns} 轮`));
                logger.debugLargeJson('[RESULT] Error during execution', resultMsg)
            }
            break;
        }

        default: {
            // Handle other message types
            if (process.env.DEBUG) {
                console.log(chalk.gray(`[未知消息类型：${message.type}]`));
            }
        }
    }
}

/**
 * Prints a divider in the terminal
 */
export function printDivider(): void {
    console.log(chalk.gray('═'.repeat(60)));
}

/**
 * Prints a status message
 */
export function printStatus(message: string): void {
    console.log(chalk.blue.bold(`ℹ️  ${message}`));
}
