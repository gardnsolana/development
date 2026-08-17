# Security

## Reporting

Do not open a public issue for a suspected vulnerability. Send the project team a private report containing the affected surface, reproduction steps, expected impact and any supporting evidence.

## Repository boundary

This public repository intentionally excludes:

- production credentials and model-provider keys
- wallet-session and signing internals
- managed worker and queue infrastructure
- private prompts and abuse controls
- RPC failover and settlement-verification services

Their absence from this mirror does not mean those controls are absent from the hosted product.

## Secret handling

Never commit seed phrases, private keys, wallet exports, API keys, access tokens, RPC credentials or populated environment files. Any exposed credential must be revoked and replaced immediately.
