# Node and pnpm toolchain

Use Node 26.13.0 (the `.node-version` pin) and pnpm 12.16.1 (the
`packageManager` pin). CI reads those files; install pnpm directly with
`npm install --global pnpm@12.16.1`, since Node 26 does not bundle Corepack.

The pnpm 10 to 12 migration keeps dependency versions locked. Configuration
belongs in `pnpm-workspace.yaml`; `allowBuilds` retains explicit dependency
script approvals. The lockfile includes pnpm's own platform packages.
`minimumReleaseAge: 1440` preserves the one-day release quarantine, including
frozen installs. Wait for a new release to mature rather than disabling it.
`pnpm audit --json` may return null `cves`; consumers must treat it as an empty
list. pnpm switches to the exact `packageManager` version when necessary.

## Coordinated rollout

App checks must pass on this toolchain before rollout. Apply tjorim/apps#304
(pnpm 12.16.1) and tjorim/apps#303 (Node 26) to the build host before merging
app changes that require Node 26 or pnpm 12. Run Ansible with `--check --diff`
first, then apply and verify `node --version` and `pnpm --version` as the deploy
user in a non-interactive shell. Until then, production remains on its previous
toolchain; these pins describe the tested target, not a completed host upgrade.

Migration references: https://pnpm.io/migration and
https://pnpm.io/migration-v11.
