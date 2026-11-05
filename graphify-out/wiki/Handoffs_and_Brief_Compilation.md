# Handoffs and Brief Compilation

> 22 nodes · cohesion 0.19

## Key Concepts

- **session.ts** (24 connections) — `src/session.ts`
- **brief.ts** (18 connections) — `src/brief.ts`
- **compileBrief()** (17 connections) — `src/brief.ts`
- **addHandoff()** (13 connections) — `src/brain.ts`
- **setNow()** (13 connections) — `src/brain.ts`
- **submitToBrain()** (13 connections) — `src/session.ts`
- **debate()** (12 connections) — `src/session.ts`
- **writerLabel()** (8 connections) — `src/policy.ts`
- **writerPolicy()** (5 connections) — `src/policy.ts`
- **clip()** (4 connections) — `src/brief.ts`
- **appendJsonl()** (3 connections) — `src/brain.ts`
- **BrainSnapshot** (3 connections) — `src/brain.ts`
- **writeText()** (3 connections) — `src/brain.ts`
- **formatDecision()** (3 connections) — `src/brief.ts`
- **formatHandoff()** (3 connections) — `src/brief.ts`
- **askOrExplain()** (3 connections) — `src/session.ts`
- **clip()** (3 connections) — `src/session.ts`
- **debatePrompt()** (3 connections) — `src/session.ts`
- **requireSignedIn()** (3 connections) — `src/session.ts`
- **workPrompt()** (3 connections) — `src/session.ts`
- **Provider** (2 connections) — `src/accounts.ts`
- **Decision** (2 connections) — `src/brain.ts`

## Relationships

- [CLI Commands and Routing](CLI_Commands_and_Routing.md) (30 shared connections)
- [Brain Storage and Config](Brain_Storage_and_Config.md) (27 shared connections)
- [Model Accounts and Sign-in](Model_Accounts_and_Sign-in.md) (8 shared connections)
- [Model Ask Calls](Model_Ask_Calls.md) (6 shared connections)

## Source Files

- `src/accounts.ts`
- `src/brain.ts`
- `src/brief.ts`
- `src/policy.ts`
- `src/session.ts`

## Audit Trail

- EXTRACTED: 114 (98%)
- INFERRED: 2 (2%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*