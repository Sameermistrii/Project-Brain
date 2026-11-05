# Graph Report - project-brain  (2026-11-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 318 nodes · 699 edges · 15 communities (13 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Brain CLI Core
- Notch Page Bundle
- AI Model Accounts
- Notch UI Widget
- Brain Memory Manifest
- Electron Preload Package
- Electron Main Window
- Minified Bundle Internals A
- Minified Bundle Internals B
- Minified Bundle Internals C
- Desktop Chat App
- Minified Bundle Internals D
- TypeScript Config
- Minified Bundle Internals E
- Minified Bundle Internals F

## God Nodes (most connected - your core abstractions)
1. `main()` - 25 edges
2. `loadBrain()` - 22 edges
3. `compileBrief()` - 17 edges
4. `brainDir()` - 16 edges
5. `runAsk()` - 16 edges
6. `route()` - 15 edges
7. `addHandoff()` - 13 edges
8. `setNow()` - 13 edges
9. `submitToBrain()` - 13 edges
10. `addDecision()` - 12 edges

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

## Communities (15 total, 2 thin omitted)

### Community 0 - "Brain CLI Core"
Cohesion: 0.13
Nodes (29): AskModel, addDecision(), findProjectRoot(), setGoal(), compilePack(), audienceOf(), flag(), main() (+21 more)

### Community 1 - "Notch Page Bundle"
Cohesion: 0.14
Nodes (27): brainDir(), BrainMode, clip(), DEFAULT_MODELS, enabledModels(), initBrain(), loadBrain(), Manifest (+19 more)

### Community 2 - "AI Model Accounts"
Cohesion: 0.16
Nodes (34): AccountState, accountStates(), askClaude(), askCodex(), askCursor(), askGrok(), askModel(), beginSignIn() (+26 more)

### Community 3 - "Notch UI Widget"
Cohesion: 0.08
Nodes (29): accountsEl, ask, Axis, bar, body, chat, closed, engaged() (+21 more)

### Community 4 - "Brain Memory Manifest"
Cohesion: 0.08
Nodes (29): api, { contextBridge, ipcRenderer }, bin, project-brain, dependencies, @modelcontextprotocol/sdk@^1.20.2, zod@^3.25.76, description (+21 more)

### Community 5 - "Electron Preload Package"
Cohesion: 0.08
Nodes (5): createWindow(), here, notchBounds(), projectRoot(), snapshot()

### Community 6 - "Electron Main Window"
Cohesion: 0.12
Nodes (22): Project goal: shared project memory, Current task: find best AI video generation tool, Chat page, desktop/app.css, Desktop app window (app.html), Integrations page, Settings page (Writes/Mode), Debate ask form (+14 more)

### Community 7 - "Minified Bundle Internals A"
Cohesion: 0.11
Nodes (20): about, composer, connectNote, loadChat(), menu, menuNote, message, models (+12 more)

### Community 8 - "Minified Bundle Internals B"
Cohesion: 0.19
Nodes (20): Provider, addHandoff(), appendJsonl(), BrainSnapshot, Decision, setNow(), writeText(), clip() (+12 more)

### Community 9 - "Minified Bundle Internals C"
Cohesion: 0.22
Nodes (16): apiError(), AskResult, callChat(), callClaude(), callModel(), clip(), envFor(), modelEnv() (+8 more)

### Community 10 - "Desktop Chat App"
Cohesion: 0.15
Nodes (12): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+4 more)

### Community 11 - "Minified Bundle Internals D"
Cohesion: 0.29
Nodes (5): graphify-out/GRAPH_REPORT.md, graphify-out/graph.json, Graphify agent rules, graphify-out/wiki/index.md, Graphify project rules

### Community 12 - "TypeScript Config"
Cohesion: 0.29
Nodes (6): codeWriter, created, mode, name, updated, version

## Knowledge Gaps
- **9 isolated node(s):** `C:\Program Files\nodejs\node.exe`, `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/wiki/index.md`, `graphify skill (.claude/skills/graphify/SKILL.md)` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 116 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `electron` connect `Brain Memory Manifest` to `Electron Preload Package`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `compileBrief()` (e.g. with `formatDecision()` and `formatHandoff()`) actually correct?**
  _`compileBrief()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `C:\Program Files\nodejs\node.exe`, `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Brain CLI Core` be split into smaller, more focused modules?**
  _Cohesion score 0.13090418353576247 - nodes in this community are weakly interconnected._
- **Why does `@modelcontextprotocol/sdk` connect `Brain Memory Manifest` to `Brain CLI Core`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Should `Notch Page Bundle` be split into smaller, more focused modules?**
  _Cohesion score 0.1379800853485064 - nodes in this community are weakly interconnected._
- **Why does `zod` connect `Brain Memory Manifest` to `Brain CLI Core`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._