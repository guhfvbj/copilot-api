import consola from "consola"
import fs from "node:fs/promises"
import { randomBytes } from "node:crypto"

import { PATHS } from "~/lib/paths"
import { state, type ApiKey } from "~/lib/state"

interface StoredApiKey {
  key: string
  label?: string
  createdAt: number
}

const toStoredApiKey = (apiKey: ApiKey): StoredApiKey => ({
  key: apiKey.key,
  label: apiKey.label,
  createdAt: apiKey.createdAt,
})

export async function loadApiKeysFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(PATHS.API_KEYS_PATH, "utf8")
    if (!raw.trim()) {
      state.apiKeys = new Map()
      return
    }
    const parsed = JSON.parse(raw) as Array<StoredApiKey>
    state.apiKeys = new Map(
      parsed.map((item) => [item.key, { ...item } satisfies ApiKey]),
    )
  } catch (error) {
    consola.warn("加载 API Key 失败，使用空配置：", error)
    state.apiKeys = new Map()
  }
}

export async function persistApiKeys(): Promise<void> {
  const payload = JSON.stringify(
    Array.from(state.apiKeys.values()).map((k) => toStoredApiKey(k)),
    null,
    2,
  )
  await fs.writeFile(PATHS.API_KEYS_PATH, payload)
}

export async function ensureApiKeysLoaded(): Promise<void> {
  if (state.apiKeys.size === 0) {
    await loadApiKeysFromDisk()
  }
}

export function generateApiKeyValue(): string {
  return `cak_${randomBytes(32).toString("base64url")}`
}

export async function createApiKey(label?: string): Promise<ApiKey> {
  await ensureApiKeysLoaded()
  const apiKey: ApiKey = {
    key: generateApiKeyValue(),
    label,
    createdAt: Date.now(),
  }
  state.apiKeys.set(apiKey.key, apiKey)
  await persistApiKeys()
  return apiKey
}

export async function listApiKeys(): Promise<Array<ApiKey>> {
  await ensureApiKeysLoaded()
  return Array.from(state.apiKeys.values())
}

export async function findApiKey(rawKey?: string): Promise<ApiKey | undefined> {
  if (!rawKey) return undefined
  await ensureApiKeysLoaded()
  return state.apiKeys.get(rawKey)
}

export function readApiKeyFromHeaders(headers: Headers): string | undefined {
  const authHeader = headers.get("authorization") ?? headers.get("Authorization")
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length).trim()
  }
  const headerKey = headers.get("x-api-key")
  return headerKey ?? undefined
}

export async function resolveApiKeyFromHeaders(
  headers: Headers,
): Promise<ApiKey | undefined> {
  const raw = readApiKeyFromHeaders(headers)
  return await findApiKey(raw)
}
