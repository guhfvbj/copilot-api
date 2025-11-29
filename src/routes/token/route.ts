import { Hono } from "hono"

import { state } from "~/lib/state"

export const tokenRoute = new Hono()

tokenRoute.get("/", (c) => {
  try {
    return c.json({
      tokens: state.accounts.map((account) => ({
        id: account.id,
        token: account.copilotToken,
      })),
    })
  } catch (error) {
    console.error("Error fetching token:", error)
    return c.json({ error: "Failed to fetch token", tokens: [] }, 500)
  }
})
