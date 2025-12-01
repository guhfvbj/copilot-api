import type { ModelsResponse } from "~/services/copilot/get-models"

export interface Account {
  id: string
  githubToken: string
  accountType: string
  login?: string

  copilotToken?: string
  models?: ModelsResponse

  refreshHandle?: ReturnType<typeof setInterval>
}

export interface ApiKey {
  key: string
  label?: string
  createdAt: number
}

export interface State {
  accounts: Array<Account>
  conversationAccounts: Map<string, string>
  apiKeys: Map<string, ApiKey>

  vsCodeVersion?: string

  manualApprove: boolean
  rateLimitWait: boolean
  showToken: boolean

  // Rate limiting configuration
  rateLimitSeconds?: number
  lastRequestTimestamp?: number
  accountRequestTimestamps: Map<string, number>
}

export const state: State = {
  accounts: [],
  conversationAccounts: new Map(),
  apiKeys: new Map(),
  manualApprove: false,
  rateLimitWait: false,
  showToken: false,
  accountRequestTimestamps: new Map(),
}
