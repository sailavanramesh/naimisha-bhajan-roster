# PROGRESS

Running log for the v2 rebuild. **Assume the reader has no memory of previous
sessions** and only has `CLAUDE.md`, `docs/SPEC.md`, this file, and the code.

Updated after every phase: what is done, what is next, decisions and why, and
open uncertainties.

---

## Current state

**Branch:** `v2` (branched from `main` @ `0788398`)
**Phase:** Setup complete. Phase 0 not started — blocked on the seven answers
in [OPEN-QUESTIONS](#open-questions).

---

## Infrastructure (live, provisioned via Azure CLI on 2026-08-09)

Subscription: `Azure subscription 1` / `d068b431-9d2e-4045-9688-2a7e5fa14fea`
Tenant: JNANA VEDANTA INSTITUTE LTD. (`apps.jnanavedanta.org`)
Confirmed nonprofit sponsorship: subscription `quotaId` is `Sponsored_2016-01-01`.

| Resource | Name | Detail |
|---|---|---|
| Resource group | `rg-naimisha-bhajan-roster` | `australiaeast` (Sydney) |
| PostgreSQL Flexible Server | `psql-naimisha-roster` | Burstable `Standard_B1ms`, PG 16.14, 32 GiB |
| Database | `naimisha` | UTF8 / `en_US.utf8` |
| App Service plan | `asp-naimisha-roster` | Linux, B1 Basic |
| Web App | `naimisha-bhajan-roster` | `NODE|22-lts`, Always On, startup `npm run start` |
| Entra app registration | `gha-naimisha-bhajan-roster` | OIDC deploy identity, Contributor on the RG |

Host: `psql-naimisha-roster.postgres.database.azure.com`
Site: `https://naimisha-bhajan-roster.azurewebsites.net`

**Firewall rules on the Postgres server**

- `AllowAllAzureServicesAndResourcesWithinAzureIps…` — `0.0.0.0/0.0.0.0`, the
  "allow Azure services" toggle. This is what lets the Web App connect.
- `AllowSailavanDevMachine` — `122.199.63.165`. **Migrations run from an
  allowlisted machine, not from CI.** GitHub-hosted runners have unpredictable
  egress IPs and are deliberately not allowlisted.

**Estimated cost** (Azure retail price API, Australia East, AUD, 730 h/month)

| Line | Rate | Monthly |
|---|---|---:|
| App Service Basic B1 Linux | 0.0275 AUD/h | 20.08 |
| PostgreSQL Burstable B1MS compute | 0.0377 AUD/h | 27.52 |
| PostgreSQL storage, 32 GiB | 0.20 AUD/GiB/mo | 6.40 |
| Backup (≤100% of provisioned storage) | included | 0.00 |
| **Total** | | **≈ 54 AUD/month** |

Resource group, Entra app registration, and OIDC federation cost nothing.

---

## Secrets

- `.env` at the repo root holds `DATABASE_URL`, `DIRECT_URL`, `EDIT_KEY`,
  `XLSX_PATH`. Mode `600`, git-ignored. Not committed, ever.
- The same four values (minus `XLSX_PATH` semantics) are set as Web App
  application settings.
- The DB admin password and `EDIT_KEY` were generated locally; they exist in
  `.env` and in the Web App settings and nowhere else.
- `.env.save` was untracked with `git rm --cached` and added to `.gitignore`.
  Its contents were never read. **It was committed to `main` historically, so
  anything it contained must still be treated as compromised and rotated** —
  removing it from the tip does not remove it from history.

---

## Deployment

`.github/workflows/azure-deploy.yml`, on push to `main` (plus manual dispatch).

Decision: **OIDC federated identity, not a publish profile.** The Web App was
created with SCM basic auth disabled (`allow: false`, the current Azure
default). A publish profile would have required re-enabling basic auth on the
SCM endpoint — a permanent security downgrade — so a federated credential was
used instead. GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
`AZURE_SUBSCRIPTION_ID`. No long-lived secret exists.

The workflow lints, tests, builds, prunes dev dependencies, and ships a
prebuilt zip (`SCM_DO_BUILD_DURING_DEPLOYMENT=false`) — a B1 instance is too
small to build Next.js reliably on-box.

The workflow does **not** run `prisma migrate deploy`. Migrations are applied
by hand from an allowlisted machine. This is deliberate: it keeps automated
processes away from a database whose 709 `confirmedPitch` values exist nowhere
else.

---

## Done so far

- [x] Azure CLI installed; `az login` and `gh` auth confirmed
- [x] All infrastructure provisioned (table above)
- [x] Repo cloned, branch `v2` created
- [x] `docs/` created; `CLAUDE.md` → root, `SPEC.md` → `docs/`,
      `Naimisha Bhajan Roster .xlsx` → `data/roster.xlsx`
- [x] `.env.save` untracked and ignored, committed
- [x] `CLAUDE.md` and `docs/SPEC.md` read in full; existing code reviewed
- [x] `npm install`; `prisma migrate deploy` applied `20260101081006_init` to
      the live Azure database — 9 tables present, connection confirmed
- [x] vitest added (`npm run test:run`)
- [x] GitHub Actions deploy workflow written, OIDC identity + secrets in place

## Next

1. Answers to the seven questions below.
2. Push `v2` (needs the `workflow` scope on the `gh` token — see below).
3. **Phase 0** — schema migration, seed rewrite, `lib/pitch.ts`, and the
   singer-offset regression test.

---

## Decisions and why

| Decision | Why |
|---|---|
| Region `australiaeast` | Widest service availability of the Australian regions; the group is in Melbourne, so latency from `australiasoutheast` would be marginally better but B-series and App Service SKU coverage is better in Sydney. |
| **Node 22 LTS, not Node 20** | Node 20 LTS is **no longer offered** on Azure App Service Linux — the only runtimes available are `NODE\|24-lts` and `NODE\|22-lts`. 22 is the closest to what was asked for and is supported to 2027-04-30. Change with `az webapp config set --linux-fx-version`. |
| `prisma migrate deploy`, never `migrate dev` | `migrate dev` can offer to reset the database. Against production that is unrecoverable. |
| Migrations not run from CI | GitHub runner egress IPs are not allowlisted, and automating writes to this database is not worth the convenience. |
| OIDC over publish profile | Avoids re-enabling SCM basic auth. See Deployment above. |
| Patched local `pyexpat` | Homebrew's `azure-cli` ships Python 3.14 whose `pyexpat` links against the macOS system `libexpat`, which lacks a symbol it needs — every `az webapp` command crashed on import. Repointed the module at Homebrew's `expat` with `install_name_tool` + `codesign`. Purely a local toolchain repair; undo with `brew reinstall python@3.14`. |

---

## OPEN-QUESTIONS

Blocking Phase 1 onward. Section 9 of `docs/SPEC.md`, asked verbatim; answers
to be written back into `docs/SPEC.md` once given.

1. Is the Ganesha-opener a rule or just a strong habit? Same for the Sai closer.
2. Is 10 the right default session length? History says weekday sessions run 3–4.
3. Should a singer ever be assigned a bhajan they have never sung, or is the
   roster always drawn from known repertoire?
4. What is the real "don't repeat within" window — 90 days? A term? A year?
5. Who should be able to edit? Coordinator only, or every singer for their own
   pitch?
6. Is the `Recent Bhajans` count sheet still maintained by hand, or can it be
   fully derived?
7. Are the Gents/Ladies reference pitches ever wrong in the masterlist, and if
   so should the app let the group correct them locally?

### Also open

- **`gh` token is missing the `workflow` scope**, so pushing `v2` is rejected
  (`refusing to allow an OAuth App to create or update workflow ...`). Fix with
  `gh auth refresh -s workflow` (browser flow), then `git push -u origin v2`.
- `data/roster.xlsx` was replaced with the newer export from `~/Downloads`
  (1,926,870 bytes, replacing 1,863,345). The previous file remains in git
  history at `75a48fe^` if a diff is ever needed.
- Local Node is v26 while the Web App runs Node 22. Not currently a problem,
  but local-only build behaviour should not be trusted as proof the deploy will
  work.
