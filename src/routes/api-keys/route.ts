import { Hono } from "hono"

import {
  createApiKey,
  listApiKeys,
} from "~/lib/api-keys"
import { forwardError } from "~/lib/error"

export const apiKeyRoutes = new Hono()

apiKeyRoutes.get("/", async (c) => {
  try {
    const keys = await listApiKeys()
    return c.json({
      apiKeys: keys.map((key) => ({
        key: key.key,
        label: key.label,
        createdAt: key.createdAt,
      })),
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})

apiKeyRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json<{ label?: string }>().catch(() => ({}))
    const apiKey = await createApiKey(body.label)
    return c.json({
      message: "API Key created",
      apiKey: {
        key: apiKey.key,
        label: apiKey.label,
        createdAt: apiKey.createdAt,
      },
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})
