# Working on this app from another Mac

Everything here assumes a Mac you have never used for this repo before — a
second laptop, a travel machine, a replacement. It takes about ten minutes, and
the only credential you carry with you is your own Azure and GitHub login.

Nothing secret lives in this repo, in Google Drive, or in a password manager.
Every secret already exists as an Azure app setting, and `npm run env:setup`
reads it from there.

---

## Before you start

```bash
# Homebrew, if the machine is new: https://brew.sh
brew install node gh azure-cli
gh auth login          # GitHub.com -> SSH -> upload key -> web browser
az login               # the Naimisha subscription
```

Node must be 22 or newer — that is what both App Services run.

---

## The five steps

```bash
# 1. Get the code. This clones every project, including this one.
git clone git@github.com:sailavanramesh/mac-setup.git ~/mac-setup
bash ~/mac-setup/bootstrap.sh
cd ~/Documents/Code/naimisha-bhajan-roster

# 2. Work on the dev branch, never straight on main.
git checkout v2

# 3. Dependencies.
npm ci

# 4. Build .env from the dev app service's own settings.
npm run env:setup

# 5. Let this machine, on this network, reach the database.
bash scripts/allow-my-ip.sh
```

Then:

```bash
npm run dev -- -p 3111
```

and open <http://localhost:3111>. The port matters: `AUTH_URL` in the generated
`.env` names 3111, and `next dev` would otherwise pick 3000. To get editor rights, open
`http://localhost:3111/?k=<EDITOR_KEY>` once — the key is in the `.env` that
step 4 generated. It sets a cookie for a year.

---

## Which database am I on?

```bash
npm run env:which
```

This is worth running whenever you are about to migrate, seed or run a test that
writes, because **the two machines do not mean the same thing by `.env`**:

| | `.env` | `.env.local` | `npm run dev` hits | Prisma / vitest / tsx hit |
|---|---|---|---|---|
| Sailavan's main Mac | **production** | dev | dev | **production** |
| Any machine set up by `npm run env:setup` | dev | absent | dev | dev |

The main Mac's arrangement is a trap and has caused near misses — Prisma, `tsx`
scripts and vitest read `.env` and ignore `.env.local`, so a test that writes
lands on live data. A bootstrapped machine has dev in both places, so the safe
thing is the default and production has to be asked for by name:

```bash
# Reach production deliberately, for one command, without writing it to disk.
DATABASE_URL="$(bash scripts/setup-env.sh --print-prod-db)" npx prisma migrate deploy
```

---

## The firewall — the one that will actually bite you

`psql-naimisha-roster` accepts connections from Azure and from a handful of
named IP addresses. Nothing else. On a new network the app does not say
"firewall" — the page just hangs and then fails to connect.

```bash
bash scripts/allow-my-ip.sh            # allow here
bash scripts/allow-my-ip.sh --list     # who is allowed
bash scripts/allow-my-ip.sh --remove   # withdraw, when you leave the network
```

The rule is named after the machine, not the network, and is rewritten in place
each time, so moving between wifi networks never leaves a second rule behind.
Remove it when you are done with a network you do not control.

---

## Shipping a change

Deployment is entirely CI — there is no Azure credential on your laptop
involved, and no publish profile. GitHub proves who it is to Azure with a
federated identity.

1. Commit on `v2` and push. `.github/workflows/deploy-dev.yml` lints, tests,
   runs `prisma migrate deploy` against the dev database, then deploys to
   `naimisha-bhajan-roster-dev`.
2. Look at it on dev.
3. When Sailavan says so — and not before — merge `v2` into `main`.
   `azure-deploy.yml` deploys production.

**A daily job may push `v2` for you.** `com.code.autopush`, installed by
`mac-setup/bootstrap.sh` on every machine, commits and pushes every repo in
`~/Documents/Code` at 18:30 — so uncommitted work here reaches dev on its own
rather than being stranded on whichever laptop you are not holding. It is
hard-wired never to push `main`. If you want a change to sit locally overnight,
commit it on a branch other than `v2`, or `launchctl unload
~/Library/LaunchAgents/com.code.autopush.plist`.

**Production migrations are not automatic.** `main` deploys the app but does not
touch the schema. If the change includes a migration, apply it by hand at merge
time, from a machine whose IP is allowed through the firewall, using the
`--print-prod-db` line above. See `PROGRESS.md`.

---

## If something is wrong

| Symptom | Cause |
|---|---|
| Database connection hangs, then fails | This network's IP is not allowed. `bash scripts/allow-my-ip.sh` |
| `npm run env:setup` says not signed in | `az login` |
| `env:setup` refuses to run | A `.env` already exists. Read it first — on the main Mac it is production. `--force` replaces it. |
| Google sign-in fails locally | Expected. The generated `.env` sets `REQUIRE_SIGN_IN=false`; use the `?k=` link instead. |
| `next start` behaves oddly locally | Known: use `npm run dev`. Client navigation is broken under `next start` on these machines. |
| A test writes to production | You are on the main Mac, where `.env` is production. Pass `DATABASE_URL` explicitly. |

---

## What is NOT in git, and where it comes from instead

| | Where it comes from |
|---|---|
| `.env` | `npm run env:setup`, read live from the dev app service |
| `node_modules/` | `npm ci` |
| `.next/` | `npm run dev` / `npm run build` |
| `data/roster.xlsx` | committed — it clones with the repo |

That is the whole list. Nothing has to be copied from the other Mac by hand.
