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
      return
    }
    const parsed = JSON.parse(raw) as Array<StoredAccount>
    state.accounts = parsed.map((acc) => ({
      ...acc,
      accountType: acc.accountType || "individual",
    }))
  } catch (error) {
    consola.warn("Failed to load accounts, starting empty:", error)
    state.accounts = []
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

function getRandomAccount(): Account {
  const index = Math.floor(Math.random() * state.accounts.length)
  return state.accounts[index]!
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

export async function pickAccountForConversation(
  conversationId: string | undefined,
): Promise<Account> {
  if (state.accounts.length === 0) {
    throw new Error("No accounts available. Please add an account first.")
  }

  let account: Account | undefined

  if (conversationId) {
    const accountId = state.conversationAccounts.get(conversationId)
    if (accountId) {
      account = state.accounts.find((a) => a.id === accountId)
    }
  }

  if (!account) {
    account = getRandomAccount()
    if (conversationId) {
      setConversationAccount(conversationId, account.id)
    }
  }

  await ensureAccountReady(account)
  return account
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
  conversationId: string | undefined,
  requestedAccountId?: string,
  requestedModelId?: string,
): Promise<Account> {
  if (state.accounts.length === 0) {
    await ensureAccountsLoadedFromDisk()
  }
  if (state.accounts.length === 0) {
    throw new Error("No accounts available. Please add an account first.")
  }

  let account: Account | undefined

  if (requestedAccountId) {
    account = state.accounts.find((a) => a.id === requestedAccountId)
  }

  if (!account && conversationId) {
    const pinned = state.conversationAccounts.get(conversationId)
    if (pinned) account = state.accounts.find((a) => a.id === pinned)
  }

  const ensureReady = async (acc: Account) => {
    await ensureAccountReady(acc)
    return acc
  }

  const supportsModel = (acc: Account) => {
    if (!requestedModelId) return true
    return acc.models?.data.some((m) => m.id === requestedModelId) ?? false
  }

  if (account) {
    await ensureReady(account)
    if (supportsModel(account)) {
      if (conversationId) setConversationAccount(conversationId, account.id)
      return account
    }
  }

  for (const acc of state.accounts) {
    await ensureReady(acc)
  }

  const candidates = state.accounts.filter(supportsModel)
  account = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : getRandomAccount()

  if (conversationId) {
    setConversationAccount(conversationId, account.id)
  }

  await ensureAccountReady(account)
  return account
}
