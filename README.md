# GARDN

**Build agents that act. Prove what works. Run them yourself—or publish them for others.**

GARDN is an operating layer and marketplace for AI agents. A user can define an outcome, connect the required context, test the behaviour, run it on demand or on a schedule, and publish a proven agent for somebody else to fork.

[Website](https://gardn.run) · [Application](https://gardn.run/app) · [Architecture](docs/architecture.md) · [Security](SECURITY.md)

## The product loop

1. **Define** a concrete outcome.
2. **Configure** sources, rules, permissions and delivery.
3. **Test** the agent against a real sample.
4. **Run** it manually or on a schedule.
5. **Prove** its output with recorded evidence.
6. **Publish** a versioned definition for other users to fork.

The buyer receives an independent copy of the definition. Private credentials, wallet sessions and historical user data are never transferred with it.

## Public repository scope

This repository is a deliberately bounded public mirror. It will contain inspectable contracts, lifecycle rules, reference runtime components and selected application surfaces as they are reviewed for publication.

Production credentials, model-provider routing, private prompts, managed workers, abuse controls and settlement-verification internals remain hosted.

## Development status

GARDN existed as a private product prototype before this public source history began. Earlier milestones are recorded in [PROVENANCE.md](PROVENANCE.md); they are not represented as backdated GitHub activity.

Public components are being released as small, working changes with their real commit times. Each functional slice is validated before it reaches `main`.

## Local requirements

- Node.js 22.13 or newer
- No wallet seed phrase or private key is ever required

```sh
npm test
npm run check
```

Both commands run without third-party runtime dependencies.

## Security boundary

Never commit private keys, seed phrases, wallet exports, API credentials, bearer tokens or populated environment files. See [SECURITY.md](SECURITY.md) for reporting guidance.
