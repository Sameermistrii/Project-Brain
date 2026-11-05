# Graph Report - project-brain  (2026-11-05)

## Corpus Check
- 42 files · ~25,678 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .jsonl 3, .css 2)

## Summary
- 531 nodes · 1186 edges · 20 communities (15 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

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
- brain.ts
- TypeScript Compiler Config
- Graphify Agent Rules
- Brain Manifest Schema
- MCP Server Config
- Graphify Skill Setup
- build
- appRoot
- work
- ask
- createWindow

## God Nodes (most connected - your core abstractions)
1. `brainDir()` - 29 edges
2. `loadBrain()` - 27 edges
3. `main()` - 24 edges
4. `compileBrief()` - 18 edges
5. `runAsk()` - 16 edges
6. `addDecision()` - 15 edges
7. `addHandoff()` - 15 edges
8. `route()` - 15 edges
9. `setNow()` - 14 edges
10. `run()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Browser login sign-in (no API keys)` --semantically_similar_to--> `Chrome-only sign-in`  [INFERRED] [semantically similar]
  README.md → docs/work-so-far.md
- `Writes choice (code writer)` --semantically_similar_to--> `codeWriter in .brain/manifest.json`  [INFERRED] [semantically similar]
  README.md → docs/work-so-far.md
- `Debate ask form` --implements--> `Debate flow`  [INFERRED]
  desktop/notch.html → docs/work-so-far.md
- `Mode: Work or Debate` --conceptually_related_to--> `Debate flow`  [INFERRED]
  README.md → docs/work-so-far.md
- `Project goal: shared project memory` --conceptually_related_to--> `Work so far`  [INFERRED]
  .brain/goal.md → docs/work-so-far.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **.brain shared project memory** — docs_work_so_far_brain_memory, brain_goal, brain_now, docs_work_so_far_chat_jsonl, docs_work_so_far_codewriter [INFERRED 0.80]
- **Code writer gating across UI and debate** — readme_writes_choice, docs_work_so_far_codewriter, desktop_app_settings_page, desktop_notch, docs_work_so_far_debate [INFERRED 0.80]
- **Graphify agent instruction files** — agents_graphify_rules, claude_graphify_rules, claude_claude_graphify_skill [INFERRED 0.85]

## Communities (20 total, 5 thin omitted)

### Community 0 - "brain.ts"
Cohesion: 0.11
Nodes (51): AskModel, AskResult, clip(), runAsk(), addDecision(), addHandoff(), appendJsonl(), findProjectRoot() (+43 more)

### Community 1 - "session.ts"
Cohesion: 0.10
Nodes (38): accountStates(), Provider, BrainSnapshot, ModelKey, ChatAction, beginCheckpoint(), Checkpoint, describeChange() (+30 more)

### Community 2 - "Model Accounts and Sign-in"
Cohesion: 0.08
Nodes (62): AccountState, active, Answer, askClaude(), askCodex(), askCursor(), askGrok(), askModel() (+54 more)

### Community 3 - "Notch UI Interactions"
Cohesion: 0.07
Nodes (32): accountsEl, ask, Axis, bar, body, chat, closed, engaged() (+24 more)

### Community 4 - "Electron Preload and Package"
Cohesion: 0.05
Nodes (40): api, { contextBridge, ipcRenderer }, author, bin, project-brain, dependencies, electron-updater, @modelcontextprotocol/sdk (+32 more)

### Community 6 - "Desktop App Pages and Memory"
Cohesion: 0.07
Nodes (34): Project goal: shared project memory, Current task: find best AI video generation tool, Chat page, desktop/app.css, Desktop app window (app.html), Integrations page, Settings page (Writes/Mode), Debate ask form (+26 more)

### Community 7 - "Desktop Chat App"
Cohesion: 0.11
Nodes (34): about, actionRow(), afterAction(), chooseFolder(), composer, connectNote, emptyNote(), formatTokens() (+26 more)

### Community 8 - "features.test.ts"
Cohesion: 0.10
Nodes (30): UsageEvent, appendChat(), blankThread(), ChatIndex, ChatMessage, chatsDir(), ChatThread, createThread() (+22 more)

### Community 9 - "brain.ts"
Cohesion: 0.11
Nodes (35): accessFolder(), BRAIN_GITATTRIBUTES, BRAIN_GITIGNORE, brainDir(), BrainMode, clip(), Decision, deleteMemory() (+27 more)

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

### Community 17 - "work"
Cohesion: 1.00
Nodes (3): broadcast(), progress(), work()

## Knowledge Gaps
- **12 isolated node(s):** `C:\Program Files\nodejs\node.exe`, `@types/node`, `electron-builder`, `typescript`, `graphify-out/graph.json` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 218 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `build` connect `build` to `Electron Preload and Package`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `compileBrief()` (e.g. with `formatDecision()` and `formatHandoff()`) actually correct?**
  _`compileBrief()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `C:\Program Files\nodejs\node.exe`, `@types/node`, `electron-builder` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `brain.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10599078341013825 - nodes in this community are weakly interconnected._
- **Why does `electron` connect `Electron Preload and Package` to `Electron Main Process`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Should `session.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1024390243902439 - nodes in this community are weakly interconnected._
- **Why does `electron-updater` connect `Electron Preload and Package` to `Electron Main Process`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._