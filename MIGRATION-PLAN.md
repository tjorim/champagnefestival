# Migration Plan: Next.js to React

> **Status**: The project migration from Next.js to a standard React + Vite application is complete. This file now tracks post-migration hardening work only.

## Completed migration outcomes

- ✅ React application structure established in `src/`
- ✅ All core UI components migrated from Next.js to React
- ✅ Paraglide compile-time i18n implemented for `nl`, `en`, and `fr`
- ✅ Vite build pipeline and environment-based configuration in place
- ✅ Cloudflare Pages deployment configuration (`wrangler.toml`) in place
- ✅ Next.js-specific code and dependencies removed

## Validation and delivery status

### Build & CI/CD foundations

- ✅ GitHub Actions CI workflow validates typecheck, lint, tests, and build on push/PR
- ✅ Deployment workflows include quality gates before publish
- ✅ PR preview workflow builds deployable artifacts for review

### Testing foundations

- ✅ Vitest configured and wired into npm scripts
- ✅ React Testing Library integrated for component-level tests
- ✅ Test execution integrated into CI and deployment pipelines

### Still in progress

- ⚠️ Cross-browser regression depth (ongoing verification matrix)
- ⚠️ Accessibility compliance depth (beyond baseline semantic checks)
- ⚠️ Performance monitoring and budget enforcement

## Current priorities

1. **Accessibility audit depth**
   - Expand manual keyboard/screen-reader audits across critical user flows
   - Add repeatable a11y checks to reduce regressions

2. **Performance budget enforcement**
   - Define explicit JS/CSS/image budgets per release
   - Enforce budget thresholds in CI and fail on regressions

3. **Release process hardening**
   - Strengthen rollback/recovery runbooks
   - Document release verification checklist and ownership

## Risks and mitigations (active)

1. **SEO in CSR architecture**
   - Mitigation: maintain structured metadata, validate JSON-LD, and continuously monitor indexing behavior

2. **Client-side performance variability**
   - Mitigation: keep bundle analysis in the release process, monitor Core Web Vitals, and prioritize low-end device testing

3. **Quality drift over time**
   - Mitigation: keep CI gates strict and extend automated tests in areas with recurring defects
