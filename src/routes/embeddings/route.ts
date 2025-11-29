import { Hono } from "hono"

import { forwardError } from "~/lib/error"
import { pickAccountForConversation } from "~/lib/accounts"
import { state } from "~/lib/state"
import {
  createEmbeddings,
  type EmbeddingRequest,
} from "~/services/copilot/create-embeddings"

export const embeddingRoutes = new Hono()

embeddingRoutes.post("/", async (c) => {
  try {
    const conversationId = c.req.header("x-conversation-id")
    const payload = await c.req.json<EmbeddingRequest>()
    const account = await pickAccountForConversation(conversationId)
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
