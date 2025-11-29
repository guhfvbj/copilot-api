import { Hono } from "hono"

import { ensureAccountReady } from "~/lib/accounts"
import { getCopilotUsage } from "~/services/github/get-copilot-usage"
import { state } from "~/lib/state"

export const usageRoute = new Hono()

usageRoute.get("/", async (c) => {
  try {
    const targetAccountId = c.req.header("x-account-id")
    const account =
      (targetAccountId &&
        state.accounts.find((acc) => acc.id === targetAccountId)) ||
      state.accounts[0]

    if (!account) {
      return c.json(
        { error: "No accounts configured. Please add an account first." },
        400,
      )
    }

    if (!state.vsCodeVersion) {
      return c.json(
        { error: "VSCode version not initialized. Please restart the server." },
        500,
      )
    }

    await ensureAccountReady(account)

    const usage = await getCopilotUsage(account, state.vsCodeVersion!)
    return c.json({ account: account.id, ...usage })
  } catch (error) {
    console.error("Error fetching Copilot usage:", error)
    return c.json({ error: "Failed to fetch Copilot usage" }, 500)
  }
})
