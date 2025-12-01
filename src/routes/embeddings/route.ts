import { Hono } from "hono"

import { forwardError } from "~/lib/error"
import { pickAccountForConversation } from "~/lib/accounts"
import { findApiKey, readApiKeyFromHeaders } from "~/lib/api-keys"
import { state } from "~/lib/state"
import {
  createEmbeddings,
  type EmbeddingRequest,
} from "~/services/copilot/create-embeddings"

export const embeddingRoutes = new Hono()

embeddingRoutes.post("/", async (c) => {
  try {
    const rawApiKey = readApiKeyFromHeaders(c.req.raw.headers)
    const apiKey = await findApiKey(rawApiKey)
    if (rawApiKey && !apiKey) {
      return c.json({ error: "API Key 无效" }, 401)
    }

    const conversationId =
      c.req.header("x-conversation-id")
      ?? apiKey?.key
    const requestedAccountId = c.req.header("x-account-id")
    const payload = await c.req.json<EmbeddingRequest>()
    const account = await pickAccountForConversation(
      conversationId,
      requestedAccountId,
    )
    const response = await createEmbeddings(
      account,
      payload,
      state.vsCodeVersion!,
    )

    return c.json(response)
  } catch (error) {
    return await forwardError(c, error)
  }
})
