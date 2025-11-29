#!/usr/bin/env node

import { defineCommand } from "citty"
import consola from "consola"

import { addAccountInteractive } from "./lib/accounts"
import { PATHS, ensurePaths } from "./lib/paths"
import { state } from "./lib/state"

interface RunAuthOptions {
  verbose: boolean
  showToken: boolean
  accountType: string
}

export async function runAuth(options: RunAuthOptions): Promise<void> {
  if (options.verbose) {
    consola.level = 5
    consola.info("Verbose logging enabled")
  }

  state.showToken = options.showToken

  await ensurePaths()
  const account = await addAccountInteractive(options.accountType, {
    showToken: options.showToken,
  })
  consola.success(
    `GitHub token stored for account "${account.id}" at ${PATHS.ACCOUNTS_PATH}`,
  )
}

export const auth = defineCommand({
  meta: {
    name: "auth",
    description: "Run GitHub auth flow without running the server",
  },
  args: {
    verbose: {
      alias: "v",
      type: "boolean",
      default: false,
      description: "Enable verbose logging",
    },
    "show-token": {
      type: "boolean",
      default: false,
      description: "Show GitHub token on auth",
    },
    "account-type": {
      alias: "a",
      type: "string",
      default: "individual",
      description: "Account type for the new account (individual, business, enterprise)",
    },
  },
  run({ args }) {
    return runAuth({
      verbose: args.verbose,
      showToken: args["show-token"],
      accountType: args["account-type"],
    })
  },
})
