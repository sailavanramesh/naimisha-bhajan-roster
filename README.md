# Naimisha Bhajan Roster

A web app for the Naimisha Sai Centre bhajan group (Melbourne). Suggests a set
to sing, rosters singers onto it fairly at the right pitch, and remembers who
sang what, when and at what shruti.

- **What it is and how it works** → [`CLAUDE.md`](CLAUDE.md)
- **What it should do** → [`docs/SPEC.md`](docs/SPEC.md)
- **What has been built, what is next, and why** → [`PROGRESS.md`](PROGRESS.md)

---

## Where it runs

**Azure. Not Vercel** — v1 used Vercel and Neon; v2 does not. Everything now
runs under the centre's Azure nonprofit sponsorship subscription, at roughly
**54 AUD/month**.

| Thing | Where |
|---|---|
| Website | `https://naimisha-bhajan-roster.azurewebsites.net` |
| Database | `psql-naimisha-roster.postgres.database.azure.com` |
| Everything else | Resource group `rg-naimisha-bhajan-roster`, Australia East |

---

## Seeing it on your own machine

This is the quickest way to look at it and try things. Nothing you do here
touches the live website — but it **does** use the real database, so anything
you save is real.

```bash
npm install
npm run build
npm run start -- -p 3111
```

Then open <http://localhost:3111>.

**To be able to edit**, open this once — it sets a cookie that lasts a year:

```
http://localhost:3111/?k=YOUR_EDIT_KEY
```

`YOUR_EDIT_KEY` is the `EDIT_KEY` line in your local `.env`. Without it the app
is read-only, which is also how anybody visiting the public site sees it.

> Your machine's IP address is allowed through the database firewall. If you
> move to a different network the app will fail to connect — see
> "Database firewall" in `PROGRESS.md` for the one command that fixes it.

---

## Putting changes on the live website

Deployment is automatic: **anything merged into `main` deploys itself.**

1. Open a pull request from `v2` into `main`.
2. Merge it.
3. GitHub Actions builds, lints, tests, and deploys to Azure. Watch it at
   <https://github.com/sailavanramesh/naimisha-bhajan-roster/actions>.

There is no password or publish profile involved — GitHub proves who it is to
Azure using a federated identity, so there is no long-lived secret to leak.

---

## Database changes

**Migrations are not run by the deployment.** They are applied by hand, from a
machine whose IP is allowed through the firewall:

```bash
npm run prisma:deploy      # applies any new migrations
```

This is deliberate. The database holds 709 historical `confirmedPitch` values —
what each singer actually sang at — and they exist nowhere else. No automated
process is allowed near them. **Never run `prisma migrate reset`.**

---

## Commands

```bash
npm run dev            # development server, hot reload
npm run build          # production build
npm run start          # run the production build
npm run lint           # ESLint
npm run test:run       # unit tests (187)
npm run db:seed        # initial import from data/roster.xlsx — refuses to overwrite
npm run db:templates   # insert the shipped session templates
npm run db:eligibility # instrument eligibility defaults
```

`npm run test:run` includes the **Phase 0 gate**: it reads the live database and
checks that every singer's pitch-offset profile still reproduces the table in
`CLAUDE.md` exactly. If that test ever fails, stop and investigate — do not
adjust the expected numbers.
