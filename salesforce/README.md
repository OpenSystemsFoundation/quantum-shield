# QuantumShield Salesforce Seed Project

This Salesforce DX project is the deployable seed for the scratch org that QuantumShield scans during end-to-end testing.

The goal is simple: a fresh scratch org created from this folder should already contain the app setup we need to test QuantumShield without rebuilding that setup manually in Salesforce Setup.

## What Lives Here

- Deployable External Client App metadata for `QuantumShield Scanner`
- Deployable OAuth policy and global OAuth settings for that app
- Deployable `CorsWhitelistOrigin` entries for `http://localhost:4321` and `https://quantumshield.opensf.foundation`, and a callback URL for each
- `Security.settings` turning on **Enable CORS for OAuth endpoints** (`enableOauthCorsPolicy`). Without it the browser's PKCE token exchange is blocked by CORS; a fresh scratch org has it off
- Any additional Apex, permissions, tabs, objects, layouts, or other metadata we decide to keep as part of the reproducible test seed

## Fresh Scratch Org Flow

Create and deploy a fresh scratch org:

```bash
npm run scratch:bootstrap -- --devhub <your-devhub-alias> --alias qs-seed --duration-days 7
```

Classic Connected App seed metadata is intentionally excluded from this deployable project. If a test scenario ever needs one again, create it manually after the scratch org is up or cover that scenario with mock fixtures.

What the bootstrap script does:

1. Creates the scratch org from `config/project-scratch-def.json`
2. Deploys this DX project into that org and assigns the `QuantumShield_Seed_Data` permission set (field access to the classified seed fields)
3. Generates a password for browser sign-in
4. Prints the instance URL, username, password, and Consumer Key you need for the QuantumShield app

After bootstrap, update the root app environment with the printed values if needed:

```env
PUBLIC_SF_CLIENT_ID=<consumer-key>
PUBLIC_SF_API_VERSION=66.0
PUBLIC_SF_SCRATCH_INSTANCE=<instance-url>
PUBLIC_DEV_MOCK=0
```

## Retrieve Changes Back Into Source

If you make app-setup changes directly in the scratch org, pull them back into this project with:

```bash
npm run scratch:retrieve:setup -- --target-org qs-seed
```

That command uses `sf project retrieve start` against `manifest/quantum-shield-app-setup.xml` and then strips org-bound linkage fields that do not redeploy cleanly across scratch orgs.

## Why We Sanitize Retrieved Metadata

Salesforce retrieval includes some org-specific fields for External Client Apps that are not portable across orgs:

- `orgScopedExternalApp`
- `oauthLink`

Those values are valid in the org they came from, but they caused deployment failures in a fresh scratch org. The retrieve script removes them automatically so this folder stays deployable.

## Source Of Truth Rule

If we create additional Salesforce metadata in the scratch org that QuantumShield needs for testing, retrieve it into this folder and keep it deployable here. The scratch org is not the source of truth. This DX project is.
