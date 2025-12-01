import consola from "consola"
import fs from "node:fs/promises"
import { randomUUID } from "node:crypto"

import { PATHS } from "~/lib/paths"
import { HTTPError } from "~/lib/error"
import { state, type Account } from "~/lib/state"
import { getCopilotToken } from "~/services/github/get-copilot-token"
import { getDeviceCode } from "~/services/github/get-device-code"
import { getGitHubUser } from "~/services/github/get-user"
import { pollAccessToken } from "~/services/github/poll-access-token"
import { getModels } from "~/services/copilot/get-models"
import {
  getCopilotUsage,
  type CopilotUsageResponse,
  type QuotaDetail,
} from "~/services/github/get-copilot-usage"

interface StoredAccount {
  id: string
  githubToken: string
  accountType: string
  login?: string
}

const toStoredAccount = (account: Account): StoredAccount => ({
  id: account.id,
  githubToken: account.githubToken,
  accountType: account.accountType,
  login: account.login,
})

export async function loadAccountsFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(PATHS.ACCOUNTS_PATH, "utf8")
    if (!raw.trim()) {
      state.accounts = []
      state.accountRotationIndex = -1
      return
    }
    const parsed = JSON.parse(raw) as Array<StoredAccount>
    state.accounts = parsed.map((acc) => ({
      ...acc,
      accountType: acc.accountType || "individual",
    }))
    state.accountRotationIndex = Math.min(
      state.accountRotationIndex ?? -1,
      state.accounts.length - 1,
    )
  } catch (error) {
    consola.warn("Failed to load accounts, starting empty:", error)
    state.accounts = []
    state.accountRotationIndex = -1
  }
}

async function ensureAccountsLoadedFromDisk() {
  if (state.accounts.length === 0) {
    await loadAccountsFromDisk()
  }
}

export async function persistAccounts(): Promise<void> {
  const payload = JSON.stringify(
    state.accounts.map((acc) => toStoredAccount(acc)),
    null,
    2,
  )
  await fs.writeFile(PATHS.ACCOUNTS_PATH, payload)
}

function getNextAccountRoundRobin(): Account {
  if (state.accountRotationIndex >= state.accounts.length - 1) {
    state.accountRotationIndex = 0
  } else {
    state.accountRotationIndex += 1
  }
  return state.accounts[state.accountRotationIndex]!
}

const USAGE_CACHE_TTL_MS = 60_000

async function getAccountUsage(
  account: Account,
  vsCodeVersion: string,
): Promise<CopilotUsageResponse> {
  const cached = state.accountUsage.get(account.id)
  if (cached && Date.now() - cached.fetchedAt < USAGE_CACHE_TTL_MS) {
    return cached.usage
  }
  const usage = await getCopilotUsage(account, vsCodeVersion)
  state.accountUsage.set(account.id, { usage, fetchedAt: Date.now() })
  return usage
}

const hasPremiumBalance = (usage: CopilotUsageResponse | undefined) => {
  if (!usage) return false
  const premium = (usage.quota_snapshots?.premium_interactions ?? null) as
    | QuotaDetail
    | null
  if (!premium) return false
  if (premium.unlimited) return true
  const remaining =
    premium.remaining
    ?? premium.quota_remaining
    ?? 0
  return remaining > 0
}

export function setConversationAccount(
  conversationId: string,
  accountId: string,
) {
  state.conversationAccounts.set(conversationId, accountId)
}

export function clearConversationAccount(conversationId: string) {
  state.conversationAccounts.delete(conversationId)
}

export async function ensureAccountReady(account: Account): Promise<void> {
  if (!state.vsCodeVersion) {
    throw new Error("VSCode version has not been initialized")
  }

  if (!account.copilotToken) {
    await hydrateCopilotToken(account)
  }

  if (!account.models) {
    account.models = await getModels(account, state.vsCodeVersion)
  }
}

async function hydrateCopilotToken(account: Account) {
  if (!state.vsCodeVersion) {
    throw new Error("VSCode version has not been initialized")
  }
  const { token, refresh_in } = await getCopilotToken(
    account,
    state.vsCodeVersion,
  )
  account.copilotToken = token

  consola.debug(`[${account.id}] Copilot token fetched`)
  if (state.showToken) {
    consola.info(`[${account.id}] Copilot token:`, token)
  }

  const refreshInterval = Math.max(30, refresh_in - 60) * 1000

  if (account.refreshHandle) {
    clearInterval(account.refreshHandle)
  }

  account.refreshHandle = setInterval(async () => {
    try {
      const refreshed = await getCopilotToken(account, state.vsCodeVersion!)
      account.copilotToken = refreshed.token
      consola.debug(`[${account.id}] Copilot token refreshed`)
      if (state.showToken) {
        consola.info(`[${account.id}] Copilot token:`, refreshed.token)
      }
    } catch (error) {
      consola.error(`[${account.id}] Failed to refresh Copilot token:`, error)
    }
  }, refreshInterval)
}

async function upsertAccount(account: Account) {
  const existingIndex = state.accounts.findIndex(
    (acc) => acc.id === account.id || acc.githubToken === account.githubToken,
  )
  if (existingIndex >= 0) {
    const existing = state.accounts[existingIndex]
    if (existing.refreshHandle) {
      clearInterval(existing.refreshHandle)
    }
    state.accounts[existingIndex] = {
      ...state.accounts[existingIndex],
      ...account,
      copilotToken: undefined,
      models: undefined,
    }
  } else {
    state.accounts.push(account)
  }
  await persistAccounts()
}

export async function addAccountWithToken(
  githubToken: string,
  accountType: string,
  { showToken }: { showToken?: boolean } = {},
): Promise<Account> {
  await ensureAccountsLoadedFromDisk()
  const user = await getGitHubUser(githubToken)
  const account: Account = {
    id: user.login || `account-${randomUUID().slice(0, 8)}`,
    githubToken,
    accountType,
    login: user.login,
  }

  await upsertAccount(account)

  if (showToken) {
    consola.info(`[${account.id}] GitHub token:`, githubToken)
  }

  consola.success(`Added account: ${account.id}`)
  return account
}

export async function addAccountInteractive(
  accountType: string,
  { showToken }: { showToken?: boolean } = {},
): Promise<Account> {
  await ensureAccountsLoadedFromDisk()
  consola.info("Starting GitHub device login for new account")
  const response = await getDeviceCode()
  consola.info(
    `Please enter the code "${response.user_code}" in ${response.verification_uri}`,
  )

  try {
    const token = await pollAccessToken(response)
    return await addAccountWithToken(token, accountType, { showToken })
  } catch (error) {
    if (error instanceof HTTPError) {
      consola.error(
        "Failed to complete login:",
        await error.response.text().catch(() => "unknown error"),
      )
    }
    throw error
  }
}

export async function ensureAccountsInitialized(
  accountType: string,
  options: { githubToken?: string; showToken?: boolean } = {},
): Promise<void> {
  await loadAccountsFromDisk()
  const existingCount = state.accounts.length

  if (existingCount > 0) {
    return
  }

  // Legacy fallback: use previous single-account token file if present
  const legacyToken = await fs
    .readFile(PATHS.GITHUB_TOKEN_PATH, "utf8")
    .then((t) => t.trim())
    .catch(() => "")
  if (legacyToken) {
    await addAccountWithToken(legacyToken, accountType, {
      showToken: options.showToken,
    })
    return
  }

  if (options.githubToken) {
    await addAccountWithToken(options.githubToken, accountType, {
      showToken: options.showToken,
    })
    return
  }

  await addAccountInteractive(accountType, { showToken: options.showToken })
}

export async function pickAccountForConversation(
  _conversationId: string | undefined,
  requestedAccountId?: string,
  _requestedModelId?: string,
): Promise<Account> {
  if (state.accounts.length === 0) await ensureAccountsLoadedFromDisk()
  if (state.accounts.length === 0) {
    throw new Error("No accounts available. Please add an account first.")
  }

  const hasBalance = async (acc: Account) => {
    await ensureAccountReady(acc)
    const usage = await getAccountUsage(acc, state.vsCodeVersion!)
    return hasPremiumBalance(usage)
  }

  // 优先使用显式指定账号（且有余额）
  if (requestedAccountId) {
    const target = state.accounts.find((a) => a.id === requestedAccountId)
    if (target && (await hasBalance(target))) {
      return target
    }
  }

  // 轮询查找有余额的账号
  for (let i = 0; i < state.accounts.length; i++) {
    const candidate = getNextAccountRoundRobin()
    if (await hasBalance(candidate)) {
      return candidate
    }
  }

  // 兜底：全部耗尽时，返回第一个账号（可能触发上游限额错误）
  const fallback = state.accounts[0]
  await ensureAccountReady(fallback)
  return fallback
}
