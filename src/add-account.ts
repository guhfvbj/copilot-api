#!/usr/bin/env node

import { defineCommand } from "citty"
import consola from "consola"

import { addAccountInteractive } from "./lib/accounts"
import { ensurePaths } from "./lib/paths"
import { state } from "./lib/state"

export const addAccount = defineCommand({
  meta: {
    name: "add-account",
    description: "Add another GitHub account to the pool",
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
      description: "Show GitHub token after login",
    },
    "account-type": {
      alias: "a",
      type: "string",
      default: "individual",
      description:
        "Account type for the new account (individual, business, enterprise)",
    },
  },
  async run({ args }) {
    if (args.verbose) {
      consola.level = 5
      consola.info("Verbose logging enabled")
    }

    state.showToken = args["show-token"]
    await ensurePaths()
    const account = await addAccountInteractive(args["account-type"], {
      showToken: args["show-token"],
    })
    consola.success(
      `Added account "${account.id}" to pool (type: ${account.accountType})`,
    )
  },
})
