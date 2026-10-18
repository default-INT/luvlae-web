# QA environment proposal

## Decision and status — 2026-10-18

- User selected MongoDB Atlas for future order storage.
- User requested stage: pushes to `main` will deploy a separate Worker using its automatic Cloudflare hostname, without a custom domain. Stage code/workflow is implemented; its remote deployment is not yet verified. Provider isolation details below remain proposals.
- Current deployment remains one Worker, `luvlae-web`; the workflow now routes production deployment to creation/updates of the highest numbered `release/release-x.y.z` branch, with a current-head check. `main` checks/builds and deploys stage. PRs build without deploying. MongoDB, checkout, email, and queues are not implemented.

## Recommended first topology

| Resource | Production | QA proposal |
| --- | --- | --- |
| Worker | Existing `luvlae-web` | Separate `luvlae-web-stage` (configured) |
| Host | Existing `www.luvlae.com` | Automatic Cloudflare hostname (`workers.dev`) |
| Atlas | Future production project/cluster | Separate QA project/cluster, database and least-privilege user |
| Stripe | Future live integration | Dedicated QA sandbox, keys, product/price IDs and webhook secret |
| Email | Future customer/manager notifications | Provider test mode or server-enforced recipient allowlist, QA subject prefix |
| Analytics | Existing production GA4 | Disabled initially |
| Queues/background jobs | Future production resources | Separate QA resources and consumers |

- Deploy pushes to `main` automatically to one stable stage environment. No permanent `develop` branch or PR-specific environments are required initially. Rebuild production with production configuration after review and merge; do not reuse an artifact containing QA URLs or build-time variables.
- Use GitHub Environments `stage` and `production` with separate secret sets; restrict production deployment to the intended branch. Keep QA deployment concurrency separate from production, and serialize deployments to the shared QA target. Never run untrusted PR code with deployment secrets.
- Cloudflare typed config uses functions receiving `mode`; installed vinext `--env stage` passes mode to `cf`. Build/deploy wrappers reject invalid environments and mismatched artifacts. Retries reuse a build for the same mode and Worker. See [implemented stage setup](architecture.md#stage-deployment-2026-10-18).
- Future account configuration: protect QA browser routes with Cloudflare Access (not implemented by the repository change). Stripe must reach its exact webhook path without interactive login; verify signatures and reject live events in QA. Account for alternate `workers.dev` and preview URLs so they do not bypass the intended access policy.
- Stage `noindex` headers are implemented for Worker and directly served static responses; robots disallows crawling and sitemap is empty. `robots.txt` is not an access control. Use an explicit environment-specific application origin for future Stripe redirect URLs and cookies. Existing production metadata/structured-data URLs are hardcoded; inspect them deliberately during implementation rather than replacing every URL blindly.
- Use synthetic fixtures only; give QA credentials no production database permissions. Seed/reset tooling must verify the expected environment and target database. Shared QA resets should be explicit operations, not happen on every deployment.
- Persist payment updates and email jobs atomically and deduplicate webhook handling in both environments. Configure QA to reject live Stripe configuration, production DB targets and non-allowlisted email recipients. Keep secrets out of `NEXT_PUBLIC_*` and tracked files.

## Validation before checkout rollout

- First prove the selected MongoDB driver works in the installed vinext/Workers runtime: connection, indexed reads, atomic writes/transactions, connection cleanup and concurrent webhook handling. Decide whether direct connections are sufficient before adding Durable Objects.
- Test successful/declined/3DS payments, cancellation, expired checkout, duplicate and reordered webhooks, invalid signatures, refund state, email retries, and DB/email outages. Confirm order data survives redeployment and QA cannot modify production resources.
- Test browser return before webhook, webhook without browser return, and recovery when payment succeeds but a database write temporarily fails. QA with a free Atlas cluster is suitable for functional tests; it does not establish production capacity.

## References

- [Cloudflare typed configuration and modes](https://developers.cloudflare.com/cf/projects/cloudflare-config/)
- [MongoDB Atlas production environment guidance](https://www.mongodb.com/docs/atlas/production-notes/)
- [MongoDB from Workers](https://developers.cloudflare.com/workers/tutorials/connect-to-mongodb-atlas/)
- [Stripe sandboxes](https://docs.stripe.com/sandboxes)
- [Cloudflare Access application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)

Unknowns: Atlas organization/project availability, chosen cluster tier and region, Stripe account readiness, email provider, QA testers/access identities, and DNS/Cloudflare account permissions. Proposed names are not confirmed resources.
