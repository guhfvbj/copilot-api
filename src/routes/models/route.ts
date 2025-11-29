import { Hono } from "hono"

import { ensureAccountReady } from "~/lib/accounts"
import { forwardError } from "~/lib/error"
import { state } from "~/lib/state"

export const modelRoutes = new Hono()

modelRoutes.get("/", async (c) => {
  try {
    if (state.accounts.length === 0) {
      throw new Error("No accounts available. Please add an account first.")
    }

    await Promise.all(
      state.accounts.map((account) => ensureAccountReady(account)),
    )

    const modelMap = new Map(
      state.accounts.flatMap((account) => account.models?.data ?? []).map(
        (model) => [model.id, model],
      ),
    )

    const models = Array.from(modelMap.values()).map((model) => ({
      id: model.id,
      object: "model",
      type: "model",
      created: 0, // No date available from source
      created_at: new Date(0).toISOString(), // No date available from source
      owned_by: model.vendor,
      display_name: model.name,
    }))

    return c.json({
      object: "list",
      data: models,
      has_more: false,
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})
