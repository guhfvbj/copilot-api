import { Hono } from "hono"

import {
  addAccountWithToken,
  ensureAccountReady,
  ensureAccountsInitialized,
} from "~/lib/accounts"
import { forwardError } from "~/lib/error"
import { cacheVSCodeVersion } from "~/lib/utils"
import { state } from "~/lib/state"

export const accountRoutes = new Hono()

accountRoutes.get("/", (c) => {
  try {
    return c.json({
      accounts: state.accounts.map((a) => ({
        id: a.id,
        accountType: a.accountType,
        hasToken: Boolean(a.copilotToken),
      })),
    })
  } catch (error) {
    return c.json({ error: "Failed to list accounts" }, 500)
  }
})

accountRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json<{
      githubToken: string
      accountType?: string
    }>()
    if (!body.githubToken) {
      return c.json({ error: "githubToken is required" }, 400)
    }

    // 确保基础环境就绪，防止首次添加时状态缺失
    await ensureAccountsInitialized(body.accountType ?? "individual")
    if (!state.vsCodeVersion) await cacheVSCodeVersion()

    const account = await addAccountWithToken(
      body.githubToken,
      body.accountType ?? "individual",
      { showToken: state.showToken },
    )
    await ensureAccountReady(account)

    return c.json({
      message: "Account added",
      account: {
        id: account.id,
        accountType: account.accountType,
      },
      accounts: state.accounts.map((a) => ({ id: a.id, accountType: a.accountType })),
    })
  } catch (error) {
    return await forwardError(c, error)
  }
})
