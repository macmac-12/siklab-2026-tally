# Manually deploy Siklab to Vercel

Production: https://siklab2026.vercel.app

GitHub is not connected to this Vercel project. Pushing a commit preserves the source in GitHub, but does not publish it. Run the guarded deployment command below to publish that same commit.

## Prerequisites

- Node.js 22 or newer, npm, Git, and access to the repository.
- Vercel access to the `execuus-projects` team and its existing `siklab-tally-free` project.
- Production environment variables already configured in that project. A routine code deployment does not require copying database credentials into the terminal or changing the database.

## 1. Open and prepare the deployment branch

```bash
cd /home/execu/Dev/devbyexe/siklab-2026-tally
git status --short --branch
git switch codex/deploy-vercel-supabase
git pull --ff-only origin codex/deploy-vercel-supabase
npm ci
```

Commit or otherwise preserve local work before switching branches or pulling. Resolve a rejected fast-forward by inspecting the branch history; do not force-push. Keep releases on this deployment branch and leave `main`/`master` untouched.

## 2. Authenticate and check the existing project link

Authenticate if the CLI is not already signed in:

```bash
npx --yes vercel@66.6.0 login
npx --yes vercel@66.6.0 whoami
```

The ignored `.vercel/project.json` should identify:

| Setting      | Expected value                     |
| ------------ | ---------------------------------- |
| Project name | `siklab-tally-free`                |
| Project ID   | `prj_2VPATM5CqqDfZTdSCD3hgJ5t4DL2` |
| Team ID      | `team_43lYGkki2yAy7sOdaxTqHgzb`    |

On a new checkout, link the existing project:

```bash
npx --yes vercel@66.6.0 link --yes --project siklab-tally-free --scope execuus-projects
```

If linking fails, check account/team access instead of creating a replacement project. Do not commit `.vercel/`, `.env` files, backups, or `output/`.

## 3. Validate, commit and push

```bash
npm run typecheck
npm run build
git diff --check
git diff
```

For functional changes, also run `npm test` and the appropriate isolated browser workflows described in [README](../README.md). Database tests need the local PostgreSQL setup; do not point them at production. A simple Analytics/layout addition needs no database migration.

Stage the intended files, then commit and push, for example:

```bash
git add src/app/layout.tsx package.json package-lock.json
git commit -m "Add Vercel Analytics"
git push origin HEAD:refs/heads/codex/deploy-vercel-supabase
git status --short
```

If the change is already committed, skip the staging/commit commands. Include any other intended changed files explicitly. The working tree must be clean before deployment.

## 4. Deploy production

```bash
npm run deploy:production
```

This runs `scripts/deploy-production.mjs`. The guard checks the deployment branch, clean working tree, exact HEAD already pushed to GitHub, and expected Vercel project/team. It deploys with pinned Vercel CLI `66.6.0`, uses `--prod`, and records `siklabCommit` and `siklabBranch` metadata. Wait for a successful exit and a **READY** deployment; a printed deployment URL alone is not proof that the build finished.

The underlying command is shown for reference; prefer the guarded npm command:

```bash
npx --yes vercel@66.6.0 deploy --prod --yes --scope execuus-projects
```

## 5. Verify the actual live deployment

```bash
npx --yes vercel@66.6.0 inspect https://siklab2026.vercel.app --scope execuus-projects
```

Confirm the canonical alias points to the new deployment and its status is **Ready**. Also open the public site and staff sign-in page and check the changed feature. Record the commit from `git rev-parse HEAD` and the deployment ID/URL from the CLI output.

For Analytics, the root layout includes `<Analytics />` from `@vercel/analytics/next`. Check the production page loads `/_vercel/insights/script.js`, then check the project's Web Analytics dashboard for incoming visits. Dashboard enablement, browser blockers, and reporting delay can affect what appears there; successful deployment alone does not prove dashboard data has arrived.

## Failures and recovery

- **Dirty tree:** review and commit the intended changes; do not discard files merely to pass the guard.
- **HEAD not pushed:** push the exact deployment branch, then rerun the guarded command.
- **Wrong project/account:** verify `.vercel/project.json`, sign-in and team access; do not bypass the guard.
- **Build failure:** fix the reported error, validate locally, commit/push, and deploy again.
- **Database migration:** only run an explicitly required, reviewed migration after a private backup; see [deployment and recovery details](DEPLOYMENT.md). Builds must not reset or seed live event data.
- **Code rollback:** inspect and select a known good, correction-aware deployment. Code rollback does not restore database contents; do not roll back to code that ignores saved tally corrections.

Official CLI reference: [Vercel deployment commands](https://vercel.com/docs/cli/deploy).
