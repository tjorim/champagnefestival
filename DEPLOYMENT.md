# Deployment (Production): GitHub Pages

This repository's production deployment target is **GitHub Pages**.

The canonical deploy pipeline is the GitHub Actions workflow at
[`./.github/workflows/deploy.yml`](./.github/workflows/deploy.yml), which builds the Vite app and publishes the
`dist/` output to GitHub Pages.

## How production deploys work

Production deploys are triggered by:

1. Publishing a GitHub Release (`release.published`), or
2. Manually running the workflow (`workflow_dispatch`).

On each deploy run, the workflow:

1. Checks out the repository
2. Installs dependencies with `npm ci`
3. Runs linting (`npm run lint`)
4. Runs tests (`npm run test`)
5. Builds the site (`npm run build`)
6. Uploads `dist/` and deploys it to GitHub Pages

## Prerequisites

- GitHub Pages enabled for this repository
- GitHub Actions enabled for this repository
- Node.js 20+ for local validation

## Local pre-deploy check

Run the same core checks locally before creating a release:

```bash
npm ci
npm run lint
npm run test
npm run build
```

The production-ready static output is generated in `dist/`.

## Repository settings

In GitHub repository settings:

1. Go to **Settings → Pages**
2. Ensure the source is set to **GitHub Actions**

## Notes on hosting assumptions

- `vite.config.ts` uses `base: "/champagnefestival/"` to match GitHub Pages
  project-site hosting under the repository path.
- Cloudflare Pages/Wrangler deployment instructions were removed because they
  are not the production deployment path for this repository.
