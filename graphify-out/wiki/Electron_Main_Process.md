# Electron Main Process

> 27 nodes · cohesion 0.08

## Key Concepts

- **main.mjs** (30 connections) — `desktop/main.mjs`
- **createWindow()** (2 connections) — `desktop/main.mjs`
- **notchBounds()** (2 connections) — `desktop/main.mjs`
- **projectRoot()** (2 connections) — `desktop/main.mjs`
- **snapshot()** (2 connections) — `desktop/main.mjs`
- **ref_node_child_process** (2 connections)
- **createAppWindow()** (1 connections) — `desktop/main.mjs`
- **here** (1 connections) — `desktop/main.mjs`
- **loadProfileName()** (1 connections) — `desktop/main.mjs`
- **dist_accounts** (1 connections)
- **dist_accounts_accountstates** (1 connections)
- **dist_accounts_beginsignin** (1 connections)
- **dist_accounts_signoutmodels** (1 connections)
- **dist_brain** (1 connections)
- **dist_brain_enabledmodels** (1 connections)
- **dist_brain_findprojectroot** (1 connections)
- **dist_brain_loadbrain** (1 connections)
- **dist_brain_setmode** (1 connections)
- **dist_brain_setmodelenabled** (1 connections)
- **dist_brain_setwriter** (1 connections)
- **dist_chat** (1 connections)
- **dist_chat_appendchat** (1 connections)
- **dist_chat_listchat** (1 connections)
- **dist_policy** (1 connections)
- **dist_policy_writerlabel** (1 connections)
- *... and 2 more nodes in this community*

## Relationships

- [Brain Storage and Config](Brain_Storage_and_Config.md) (2 shared connections)
- [Electron Preload and Package](Electron_Preload_and_Package.md) (1 shared connections)
- [CLI Commands and Routing](CLI_Commands_and_Routing.md) (1 shared connections)
- [Model Accounts and Sign-in](Model_Accounts_and_Sign-in.md) (1 shared connections)

## Source Files

- `desktop/main.mjs`

## Audit Trail

- EXTRACTED: 33 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*