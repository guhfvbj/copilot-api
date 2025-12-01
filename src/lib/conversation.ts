import { createHash } from "node:crypto"

import type { Message as OpenAIMessage } from "~/services/copilot/create-chat-completions"
import type { AnthropicMessagesPayload } from "~/routes/messages/anthropic-types"

const hashText = (text: string) =>
  createHash("sha256").update(text).digest("hex").slice(0, 12)

const extractUserMessageText = (
  messages?: Array<OpenAIMessage | AnthropicMessagesPayload["messages"][number]>,
): string | undefined => {
  if (!messages?.length) return undefined
  const userMessage = messages.find((m) => m.role === "user")
  if (!userMessage) return undefined

  const content = userMessage.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    const textPart = content.find(
      (part) => typeof part === "object" && part?.type === "text",
    )
    if (textPart && typeof textPart === "object" && "text" in textPart) {
      return String(textPart.text)
    }
  }
  return undefined
}

interface DeriveConversationIdOptions {
  explicitId?: string | null
  userId?: string | null
  apiKey?: string
  headers?: Headers
  messages?:
    | Array<OpenAIMessage>
    | AnthropicMessagesPayload["messages"]
  fallbackText?: string
}

/**
 * 尝试根据请求上下文推导会话 ID：
 * 1) 显式提供的 conversation id（如 X-Conversation-Id）
 * 2) payload.user / metadata.user_id
 * 3) 常见 header（x-request-id/x-session-id/x-client-id/x-title/referer）
 * 4) 统一 API Key
 * 5) 首个 user 消息文本的 hash（作为兜底，用于分散无 ID 请求）
 */
export function deriveConversationId(options: DeriveConversationIdOptions): string | undefined {
  const { explicitId, userId, apiKey, headers, messages, fallbackText } = options
  const headerId =
    headers?.get("x-request-id")
    ?? headers?.get("x-session-id")
    ?? headers?.get("x-client-id")
    ?? headers?.get("x-conversation-id")
    ?? headers?.get("x-title")
    ?? headers?.get("x-referer")
    ?? headers?.get("referer")
    ?? headers?.get("http-referer")
    ?? headers?.get("origin")

  const direct =
    explicitId
    ?? userId
    ?? headerId
    ?? apiKey

  if (direct) return direct

  const text =
    fallbackText
    ?? extractUserMessageText(messages as Array<OpenAIMessage>)

  if (text) return `msg-${hashText(text)}`

  return undefined
}
