import type { Context } from "hono"

import consola from "consola"
import { streamSSE, type SSEMessage } from "hono/streaming"

import { pickAccountForConversation } from "~/lib/accounts"
import { findApiKey, readApiKeyFromHeaders } from "~/lib/api-keys"
import { deriveConversationId } from "~/lib/conversation"
import { awaitApproval } from "~/lib/approval"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import { getTokenCount } from "~/lib/tokenizer"
import { isNullish } from "~/lib/utils"
import {
  createChatCompletions,
  type ChatCompletionResponse,
  type ChatCompletionsPayload,
} from "~/services/copilot/create-chat-completions"

export async function handleCompletion(c: Context) {
  const rawApiKey = readApiKeyFromHeaders(c.req.raw.headers)
  const apiKey = await findApiKey(rawApiKey)
  if (rawApiKey && !apiKey) {
    return c.json({ error: "API Key 无效" }, 401)
  }

  let payload = await c.req.json<ChatCompletionsPayload>()
  const conversationId = deriveConversationId({
    explicitId: c.req.header("x-conversation-id"),
    userId: payload.user,
    apiKey: apiKey?.key,
    headers: c.req.raw.headers,
    messages: payload.messages,
  })
  const requestedAccountId = c.req.header("x-account-id")

  const account = await pickAccountForConversation(
    conversationId,
    requestedAccountId,
    payload.model,
  )
  await checkRateLimit(state, account.id)
  consola.debug("Request payload:", JSON.stringify(payload).slice(-400))
  consola.info(
    `Using account "${account.id}" for conversation "${conversationId ?? "anonymous"}"`,
  )

  // Find the selected model
  const selectedModel = account.models?.data.find(
    (model) => model.id === payload.model,
  )

  // Calculate and display token count
  try {
    if (selectedModel) {
      const tokenCount = await getTokenCount(payload, selectedModel)
      consola.info("Current token count:", tokenCount)
    } else {
      consola.warn("No model selected, skipping token count calculation")
    }
  } catch (error) {
    consola.warn("Failed to calculate token count:", error)
  }

  if (state.manualApprove) await awaitApproval()

  if (isNullish(payload.max_tokens)) {
    payload = {
      ...payload,
      max_tokens: selectedModel?.capabilities.limits.max_output_tokens,
    }
    consola.debug("Set max_tokens to:", JSON.stringify(payload.max_tokens))
  }

  const response = await createChatCompletions(
    account,
    payload,
    state.vsCodeVersion!,
  )

  if (isNonStreaming(response)) {
    consola.debug("Non-streaming response:", JSON.stringify(response))
    return c.json(response)
  }

  consola.debug("Streaming response")
  return streamSSE(c, async (stream) => {
    for await (const chunk of response) {
      consola.debug("Streaming chunk:", JSON.stringify(chunk))
      await stream.writeSSE(chunk as SSEMessage)
    }
  })
}

const isNonStreaming = (
  response: Awaited<ReturnType<typeof createChatCompletions>>,
): response is ChatCompletionResponse => Object.hasOwn(response, "choices")
