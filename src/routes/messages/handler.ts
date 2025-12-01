import type { Context } from "hono"

import consola from "consola"
import { streamSSE } from "hono/streaming"

import { pickAccountForConversation } from "~/lib/accounts"
import { findApiKey, readApiKeyFromHeaders } from "~/lib/api-keys"
import { awaitApproval } from "~/lib/approval"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import {
  createChatCompletions,
  type ChatCompletionChunk,
  type ChatCompletionResponse,
} from "~/services/copilot/create-chat-completions"

import {
  type AnthropicMessagesPayload,
  type AnthropicStreamState,
} from "./anthropic-types"
import {
  translateToAnthropic,
  translateToOpenAI,
} from "./non-stream-translation"
import { translateChunkToAnthropicEvents } from "./stream-translation"

export async function handleCompletion(c: Context) {
  const rawApiKey = readApiKeyFromHeaders(c.req.raw.headers)
  const apiKey = await findApiKey(rawApiKey)
  if (rawApiKey && !apiKey) {
    return c.json({ error: "API Key 无效" }, 401)
  }

  const anthropicPayload = await c.req.json<AnthropicMessagesPayload>()
  const conversationId =
    c.req.header("x-conversation-id")
    ?? anthropicPayload.metadata?.user_id
    ?? apiKey?.key
  const requestedAccountId = c.req.header("x-account-id")

  const account = await pickAccountForConversation(
    conversationId,
    requestedAccountId,
    anthropicPayload.model,
  )
  await checkRateLimit(state, account.id)
  consola.debug("Anthropic request payload:", JSON.stringify(anthropicPayload))

  const openAIPayload = translateToOpenAI(anthropicPayload)
  consola.debug(
    "Translated OpenAI request payload:",
    JSON.stringify(openAIPayload),
  )
  consola.info(
    `Using account "${account.id}" for conversation "${conversationId ?? "anonymous"}"`,
  )

  if (state.manualApprove) {
    await awaitApproval()
  }

  const response = await createChatCompletions(
    account,
    openAIPayload,
    state.vsCodeVersion!,
  )

  if (isNonStreaming(response)) {
    consola.debug(
      "Non-streaming response from Copilot:",
      JSON.stringify(response).slice(-400),
    )
    const anthropicResponse = translateToAnthropic(response)
    consola.debug(
      "Translated Anthropic response:",
      JSON.stringify(anthropicResponse),
    )
    return c.json(anthropicResponse)
  }

  consola.debug("Streaming response from Copilot")
  return streamSSE(c, async (stream) => {
    const streamState: AnthropicStreamState = {
      messageStartSent: false,
      contentBlockIndex: 0,
      contentBlockOpen: false,
      toolCalls: {},
    }

    for await (const rawEvent of response) {
      consola.debug("Copilot raw stream event:", JSON.stringify(rawEvent))
      if (rawEvent.data === "[DONE]") {
        break
      }

      if (!rawEvent.data) {
        continue
      }

      const chunk = JSON.parse(rawEvent.data) as ChatCompletionChunk
      const events = translateChunkToAnthropicEvents(chunk, streamState)

      for (const event of events) {
        consola.debug("Translated Anthropic event:", JSON.stringify(event))
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        })
      }
    }
  })
}

const isNonStreaming = (
  response: Awaited<ReturnType<typeof createChatCompletions>>,
): response is ChatCompletionResponse => Object.hasOwn(response, "choices")
