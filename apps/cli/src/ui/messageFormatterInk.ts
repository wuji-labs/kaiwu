import type { SDKMessage, SDKAssistantMessage, SDKResultMessage, SDKSystemMessage, SDKUserMessage } from '@/backends/claude/sdk'
import type { MessageBuffer } from './ink/messageBuffer'
import { logger } from './logger'

export type OnAssistantResultInkCallback = (result: SDKResultMessage, messageBuffer: MessageBuffer) => void | Promise<void>

/**
 * Formats Claude SDK messages for Ink display
 */
export function formatClaudeMessageForInk(
    message: SDKMessage,
    messageBuffer: MessageBuffer,
    onAssistantResult?: OnAssistantResultInkCallback
): void {
    logger.debugLargeJson('[CLAUDE INK] Message from remote mode:', message)

    switch (message.type) {
        case 'system': {
            const sysMsg = message as SDKSystemMessage
            if (sysMsg.subtype === 'init') {
                messageBuffer.addMessage('─'.repeat(40), 'status')
                messageBuffer.addMessage(`🚀 会话已初始化：${sysMsg.session_id}`, 'system')
                messageBuffer.addMessage(`  模型：${sysMsg.model}`, 'status')
                messageBuffer.addMessage(`  当前目录：${sysMsg.cwd}`, 'status')
                if (sysMsg.tools && sysMsg.tools.length > 0) {
                    messageBuffer.addMessage(`  工具：${sysMsg.tools.join(', ')}`, 'status')
                }
                messageBuffer.addMessage('─'.repeat(40), 'status')
            }
            break
        }

        case 'user': {
            const userMsg = message as SDKUserMessage
            if (userMsg.message && typeof userMsg.message === 'object' && 'content' in userMsg.message) {
                const content = userMsg.message.content
                
                if (typeof content === 'string') {
                    messageBuffer.addMessage(`👤 用户：${content}`, 'user')
                } 
                else if (Array.isArray(content)) {
                    for (const block of content) {
                        if (block.type === 'text') {
                            messageBuffer.addMessage(`👤 用户：${block.text}`, 'user')
                        } else if (block.type === 'tool_result') {
                            messageBuffer.addMessage(`✅ 工具结果（ID：${block.tool_use_id}）`, 'result')
                            if (block.content) {
                                const outputStr = typeof block.content === 'string' 
                                    ? block.content 
                                    : JSON.stringify(block.content, null, 2)
                                const maxLength = 200
                                if (outputStr.length > maxLength) {
                                    messageBuffer.addMessage(outputStr.substring(0, maxLength) + '……（已截断）', 'result')
                                } else {
                                    messageBuffer.addMessage(outputStr, 'result')
                                }
                            }
                        }
                    }
                }
                else {
                    messageBuffer.addMessage(`👤 用户：${JSON.stringify(content, null, 2)}`, 'user')
                }
            }
            break
        }

        case 'assistant': {
            const assistantMsg = message as SDKAssistantMessage
            if (assistantMsg.message && assistantMsg.message.content) {
                messageBuffer.addMessage('🤖 助手：', 'assistant')
                
                for (const block of assistantMsg.message.content) {
                    if (block.type === 'text') {
                        messageBuffer.addMessage(block.text || '', 'assistant')
                    } else if (block.type === 'tool_use') {
                        messageBuffer.addMessage(`🔧 工具：${block.name}`, 'tool')
                        if (block.input) {
                            const inputStr = JSON.stringify(block.input, null, 2)
                            const maxLength = 500
                            if (inputStr.length > maxLength) {
                                messageBuffer.addMessage(`输入：${inputStr.substring(0, maxLength)}……（已截断）`, 'tool')
                            } else {
                                messageBuffer.addMessage(`输入：${inputStr}`, 'tool')
                            }
                        }
                    }
                }
            }
            break
        }

        case 'result': {
            const resultMsg = message as SDKResultMessage
            if (resultMsg.subtype === 'success') {
                if ('result' in resultMsg && resultMsg.result) {
                    messageBuffer.addMessage('✨ 摘要：', 'result')
                    messageBuffer.addMessage(resultMsg.result || '', 'result')
                }
                
                if (resultMsg.usage) {
                    messageBuffer.addMessage('📊 会话统计：', 'status')
                    messageBuffer.addMessage(`  • 轮次：${resultMsg.num_turns}`, 'status')
                    messageBuffer.addMessage(`  • 输入令牌：${resultMsg.usage.input_tokens}`, 'status')
                    messageBuffer.addMessage(`  • 输出令牌：${resultMsg.usage.output_tokens}`, 'status')
                    if (resultMsg.usage.cache_read_input_tokens) {
                        messageBuffer.addMessage(`  • 缓存读取令牌：${resultMsg.usage.cache_read_input_tokens}`, 'status')
                    }
                    if (resultMsg.usage.cache_creation_input_tokens) {
                        messageBuffer.addMessage(`  • 缓存创建令牌：${resultMsg.usage.cache_creation_input_tokens}`, 'status')
                    }
                    messageBuffer.addMessage(`  • 费用：$${resultMsg.total_cost_usd.toFixed(4)}`, 'status')
                    messageBuffer.addMessage(`  • 用时：${resultMsg.duration_ms}ms`, 'status')

                    if (onAssistantResult) {
                        Promise.resolve(onAssistantResult(resultMsg, messageBuffer)).catch(err => {
                            logger.debug('Error in onAssistantResult callback:', err)
                        })
                    }
                }
            } else if (resultMsg.subtype === 'error_max_turns') {
                messageBuffer.addMessage('❌ 错误：已达到最大轮次', 'result')
                messageBuffer.addMessage(`已完成 ${resultMsg.num_turns} 轮`, 'status')
            } else if (resultMsg.subtype === 'error_during_execution') {
                messageBuffer.addMessage('❌ 执行过程中出错', 'result')
                messageBuffer.addMessage(`出错前已完成 ${resultMsg.num_turns} 轮`, 'status')
                logger.debugLargeJson('[RESULT] Error during execution', resultMsg)
            }
            break
        }

        default: {
            if (process.env.DEBUG) {
                messageBuffer.addMessage(`[未知消息类型：${message.type}]`, 'status')
            }
        }
    }
}
