# Clause — contract review, triaged

A working demo of a first-line contract review tool for an in-house legal team.

Someone in the organisation submits a contract through an intake form. **Fixed rules — no AI —**
assign a risk level and explain exactly why. An AI assistant then writes a first-pass review
against the organisation's own standard positions: what each clause says in plain language,
whether it sits inside or outside the acceptable range, and a concrete proposal where it does not.
A lawyer picks it up on a dashboard, decides, and records the decision.

**A lawyer always decides.** The AI produces a draft to react to, never a verdict.

> ⚠️ **Demonstration software.** It does not provide legal advice, and its output should never be
> relied on without a qualified lawyer's review. The demo organisation, the counterparties, the
> people and the contract text are **entirely fictional**.

---

## Run it

```bash
./run.sh
```

Node.js 18+ and nothing else. First run installs dependencies and loads the demo data.

| | |
|---|---|
| **Intake form** — what a colleague submitting a contract sees | http://localhost:5173/ |
| **Legal dashboard** — what the legal team sees | http://localhost:5173/legal |
| Dashboard password | `demo` |

Stop with Ctrl-C. Reload the sample data any time with `./run.sh --reseed`.

**No API keys, no accounts, no internet required.** The six sample reviews are stored rather than
generated, so the demo works offline — on conference wifi, or on a laptop with nothing configured.

## What's in the demo

The fictional organisation is **Northside Legal Aid**, an advice charity, and the sample contracts
are the kind such an organisation actually signs:

| Contract | Risk | Why it's interesting |
|---|---|---|
| Case management SaaS | HIGH | Supplier claims a perpetual licence to train its AI models on client matter data; no data processing agreement; liability capped at three months' fees |
| Office lease | HIGH | Five years with no break clause, full repairing obligation, personal guarantees sought from trustees |
| Funder grant agreement | MEDIUM | Funder wants approval rights over strategic litigation and media work, and case-level client data in monthly reports |
| Partner NDA | LOW | Capped at LOW by policy regardless of anything else — shows the rules are the organisation's, not the model's |
| Backup DPA | HIGH | Deemed sub-processor consent after five days |
| Referral MOU | — | Discarded as a duplicate, with the reason recorded |

## How the risk level works

The tier is **deterministic** — a fixed funnel over the intake answers, no AI involved:

1. Any HIGH trigger fires (value, term, data volume, cross-border data, IP transfer, critical systems) → **HIGH**
2. Otherwise, if it meets a LOW path → **LOW**
3. Otherwise → **MEDIUM**

Then a per-type cap applies (an NDA never exceeds LOW), and a separate *mandatory review* flag is
raised by value or term independently of the tier. Every rule that fired is recorded on the request,
so a lawyer — or a funder, or an auditor — can see exactly why a contract landed where it did, and
get the same answer every time.

The AI review is bounded by that tier (a LOW contract gets a short review, a HIGH one the full
treatment) — but a material problem is always reported, whatever the tier.

## What a legal team would change — without a developer

There is a **Settings page** in the app (`/legal/settings`). A lawyer can edit the risk
thresholds, the standard positions, the per-contract-type AI focus and the list of counsels,
save, and the change takes effect on the very next contract — no redeploy. Overrides are stored
separately from the code defaults, and "Reset to defaults" discards them.

The code defaults behind it live in **`server/config.mjs`**:

- the organisation's name, entities and teams
- the risk thresholds (values, term lengths, data volumes)
- the contract types, each with its own red flags and an optional cap on the risk level
- the standard positions the AI reviews against, and the bands for green / amber / red

Change a threshold there and both the risk engine and the AI review follow. In a real deployment
this belongs behind an admin screen so legal can edit it without a developer.

## Wiring it up for real

The demo deliberately runs on a JSON file with a shared password. Each integration below is written
and gated behind environment variables — unset, they no-op, which is why the demo is self-contained.

**AI review** — targets Anthropic's Claude on AWS Bedrock (`server/bedrock.mjs`), pinned to EU
regions for data residency. Set `AWS_PROFILE` / `AWS_REGION` and newly submitted contracts are
reviewed live. (The six stored reviews are only for offline demoing.)

```bash
AWS_PROFILE=your-profile AWS_REGION=eu-central-1 ./run.sh
```

**E-signature (DocuSign) — not yet integrated.** `server/docusign.mjs` implements the real thing:
JWT auth, a draft-only envelope, sender view, status polling and signed-PDF download. It is inert
without credentials — the button returns a clean "not configured" message and nothing is sent
anywhere. To connect it, create a DocuSign integration key, generate an RSA keypair, grant one-time
consent for the impersonated user, and set:

```
DOCUSIGN_INTEGRATION_KEY   the integration key (client id)
DOCUSIGN_USER_ID           the user GUID to impersonate
DOCUSIGN_PRIVATE_KEY       the RSA private key PEM
DOCUSIGN_OAUTH_BASE        https://account-d.docusign.com (sandbox) / https://account.docusign.com
DOCUSIGN_ACCOUNT_ID        optional — pin one account if the user belongs to several
```

Envelopes are **draft-only by design**: the app never sends to a counterparty. A lawyer reviews and
sends from DocuSign. That invariant is covered by a test.

**Slack notifications** — `server/notify.mjs`; set `SLACK_WEBHOOK_URL` (channel) and/or
`SLACK_BOT_TOKEN` (assignment DMs).

**Before any real use** you would also need: a database and object storage in place of
`server/data` and `server/uploads`, and single sign-on in place of the demo password.

## Tests

```bash
cd server && npm test
```

28 tests covering the risk funnel (every trigger, every path, the type cap, the hard rule) and the
draft-only e-signature invariant.

## Notes

The frontend is React + Vite with Tailwind and [shadcn/ui](https://ui.shadcn.com) components;
icons are [Lucide](https://lucide.dev). The backend sets strict security headers (CSP, HSTS,
nosniff, Referrer-Policy) and rate-limits the public intake endpoint.

## Stack

React (Vite) frontend, Node/Express backend, no database. Builds into a single container
(`Dockerfile`). Deliberately small and readable — the interesting part is the risk model and the
review prompt, not the plumbing.

## Licence

MIT — see [LICENSE](LICENSE).
