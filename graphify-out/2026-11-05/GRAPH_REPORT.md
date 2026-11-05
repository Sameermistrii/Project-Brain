# Graph Report - project-brain  (2026-11-05)

## Corpus Check
- 50 files · ~33,614 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .jsonl 3, .css 2)

## Summary
- 593 nodes · 1413 edges · 22 communities (17 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e48ed81a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- brain.ts
- session.ts
- Model Accounts and Sign-in
- Notch UI Interactions
- Electron Preload and Package
- Electron Main Process
- Desktop App Pages and Memory
- Desktop Chat App
- features.test.ts
- chat.ts
- TypeScript Compiler Config
- Graphify Agent Rules
- Brain Manifest Schema
- MCP Server Config
- Graphify Skill Setup
- build
- appRoot
- ask
- createWindow
- brain.ts
- work

## God Nodes (most connected - your core abstractions)
1. `loadBrain()` - 33 edges
2. `brainDir()` - 31 edges
3. `main()` - 24 edges
4. `compileBrief()` - 22 edges
5. `addHandoff()` - 17 edges
6. `runAsk()` - 16 edges
7. `setNow()` - 16 edges
8. `runAuto()` - 16 edges
9. `submitToBrain()` - 16 edges
10. `initBrain()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Browser login sign-in (no API keys)` --semantically_similar_to--> `Chrome-only sign-in`  [INFERRED] [semantically similar]
  README.md → docs/work-so-far.md
- `Writes choice (code writer)` --semantically_similar_to--> `codeWriter in .brain/manifest.json`  [INFERRED] [semantically similar]
  README.md → docs/work-so-far.md
- `paintHealthBanner()` --indirect_call--> `state()`  [INFERRED]
  desktop/app.js → src/serve.ts
- `paintSetup()` --indirect_call--> `state()`  [INFERRED]
  desktop/app.js → src/serve.ts
- `Debate ask form` --implements--> `Debate flow`  [INFERRED]
  desktop/notch.html → docs/work-so-far.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **.brain shared project memory** — docs_work_so_far_brain_memory, brain_goal, brain_now, docs_work_so_far_chat_jsonl, docs_work_so_far_codewriter [INFERRED 0.80]
- **Code writer gating across UI and debate** — readme_writes_choice, docs_work_so_far_codewriter, desktop_app_settings_page, desktop_notch, docs_work_so_far_debate [INFERRED 0.80]
- **Graphify agent instruction files** — agents_graphify_rules, claude_graphify_rules, claude_claude_graphify_skill [INFERRED 0.85]

## Communities (22 total, 5 thin omitted)

### Community 0 - "brain.ts"
Cohesion: 0.11
Nodes (47): AskModel, AskResult, clip(), runAsk(), addDecision(), BrainSnapshot, Decision, findProjectRoot() (+39 more)

### Community 1 - "session.ts"
Cohesion: 0.13
Nodes (45): AccountState, accountStates(), askModel(), addHandoff(), ModelKey, setNow(), ChatAction, describeChange() (+37 more)

### Community 2 - "Model Accounts and Sign-in"
Cohesion: 0.08
Nodes (68): active, Answer, askClaude(), askCodex(), askCursor(), askGemini(), askGrok(), AskOptions (+60 more)

### Community 3 - "Notch UI Interactions"
Cohesion: 0.07
Nodes (32): accountsEl, ask, Axis, bar, body, chat, closed, engaged() (+24 more)

### Community 4 - "Electron Preload and Package"
Cohesion: 0.04
Nodes (44): api, { contextBridge, ipcRenderer }, author, bin, project-brain, dependencies, dompurify, electron-updater (+36 more)

### Community 6 - "Desktop App Pages and Memory"
Cohesion: 0.06
Nodes (35): Project goal: shared project memory, Current task: find best AI video generation tool, Chat page, desktop/app.css, Desktop app window (app.html), Integrations page, Settings page (Writes/Mode), Debate ask form (+27 more)

### Community 7 - "Desktop Chat App"
Cohesion: 0.11
Nodes (37): about, actionRow(), afterAction(), chooseFolder(), composer, connectNote, emptyNote(), formatTokens() (+29 more)

### Community 8 - "features.test.ts"
Cohesion: 0.10
Nodes (31): Provider, UsageEvent, beginCheckpoint(), Checkpoint, DirtyError, ensureRepo(), finishCheckpoint(), git() (+23 more)

### Community 9 - "chat.ts"
Cohesion: 0.09
Nodes (32): home, log, tools, setMode(), appendChat(), blankThread(), ChatIndex, ChatMessage (+24 more)

### Community 10 - "TypeScript Compiler Config"
Cohesion: 0.15
Nodes (12): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+4 more)

### Community 11 - "Graphify Agent Rules"
Cohesion: 0.29
Nodes (5): graphify-out/GRAPH_REPORT.md, graphify-out/graph.json, Graphify agent rules, graphify-out/wiki/index.md, Graphify project rules

### Community 12 - "Brain Manifest Schema"
Cohesion: 0.29
Nodes (6): codeWriter, created, mode, name, updated, version

### Community 15 - "build"
Cohesion: 0.10
Nodes (20): build, appId, directories, files, mac, nsis, productName, publish (+12 more)

### Community 16 - "appRoot"
Cohesion: 0.36
Nodes (8): appConfigPath(), appRoot(), chatState(), memoryState(), readAppConfig(), snapshot(), workRoot(), writeAppConfig()

### Community 19 - "createWindow"
Cohesion: 0.50
Nodes (4): createAppWindow(), createWindow(), guardLinks(), notchBounds()

### Community 20 - "brain.ts"
Cohesion: 0.13
Nodes (33): accessFolder(), appendJsonl(), BRAIN_GITATTRIBUTES, BRAIN_GITIGNORE, brainDir(), clip(), deleteMemory(), enabledModels() (+25 more)

### Community 22 - "work"
Cohesion: 1.00
Nodes (3): broadcast(), progress(), work()

## Knowledge Gaps
- **14 isolated node(s):** `C:\Program Files\nodejs\node.exe`, `dompurify`, `electron-builder`, `marked`, `@types/node` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 238 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `state()` connect `brain.ts` to `Desktop Chat App`?**
  _High betweenness centrality (0.284) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `compileBrief()` (e.g. with `formatDecision()` and `formatHandoff()`) actually correct?**
  _`compileBrief()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `C:\Program Files\nodejs\node.exe`, `dompurify`, `electron-builder` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `brain.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10828796128251664 - nodes in this community are weakly interconnected._
- **Why does `loadBrain()` connect `brain.ts` to `features.test.ts`, `chat.ts`, `brain.ts`, `session.ts`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Should `session.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12560386473429952 - nodes in this community are weakly interconnected._
- **Why does `paintHealthBanner()` connect `Desktop Chat App` to `brain.ts`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._