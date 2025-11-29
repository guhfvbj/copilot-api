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

export interface State {
  accounts: Array<Account>
  conversationAccounts: Map<string, string>

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
  manualApprove: false,
  rateLimitWait: false,
  showToken: false,
  accountRequestTimestamps: new Map(),
}
