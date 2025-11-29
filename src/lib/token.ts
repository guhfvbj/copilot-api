import consola from "consola"

import {
  addAccountInteractive,
  ensureAccountReady,
  ensureAccountsInitialized,
} from "./accounts"
import { state } from "./state"

/**
 * 保留兼容层，确保至少有一个账号并预热 Copilot token。
 * 推荐使用 lib/accounts 中的 API。
 */
export const setupCopilotToken = async () => {
  await ensureAccountsInitialized("individual")
  const account = state.accounts[0]
  if (!account) {
    throw new Error("No accounts available")
  }
  await ensureAccountReady(account)
}

interface SetupGitHubTokenOptions {
  force?: boolean
}

/**
 * 兼容旧接口：强制新增一个账号，否则复用现有账号。
 */
export async function setupGitHubToken(
  options?: SetupGitHubTokenOptions,
): Promise<void> {
  if (state.accounts.length > 0 && !options?.force) {
    return
  }
  await addAccountInteractive("individual", { showToken: state.showToken })
}
