# Auto-Improvement Readiness Audit

Date: 2026-04-23

Scope: Assess whether this platform is ready for autonomous self-improvement in the style of [`karpathy/autoresearch`](https://github.com/karpathy/autoresearch), but adapted to AI QA with CUA / Playwright.

## Executive Verdict

The platform is **not yet ready** for true `autoresearch`-style auto-improvement.

Current readiness level:

- `Evidence and memory foundation`: **strong**
- `Automated QA evaluation foundation`: **moderate**
- `Closed-loop autonomous improvement`: **weak**
- `Safe code-changing self-improvement`: **absent**

Practical conclusion:

- The platform is ready for **persisted run memory**, **evidence-backed analysis**, and **human-directed iteration**.
- It is **not ready** for an unattended loop that proposes changes, runs controlled experiments, compares against a baseline, keeps winners, rejects losers, and repeats safely.

## Reference Model: What `autoresearch` Actually Provides

Based on the `autoresearch` README as of April 2026:

- It runs a **real feedback loop**: propose a code change, run an experiment, measure a target metric, keep only improvements, repeat.
- It uses a **small, tightly scoped mutable surface**. The repo is intentionally centered around one main editable file plus a lightweight instruction file.
- It relies on a **fixed experiment budget** and **comparable metric**, so runs are directly comparable.
- It is fundamentally an **experiment runner + promotion loop**, not only a memory system.

Source:

- https://github.com/karpathy/autoresearch

## What This Platform Already Has

These parts are materially useful for a future auto-improvement loop:

### 1. Strong evidence capture

Implemented today:

- append-only `events.jsonl`
- screenshots
- DOM snapshots
- network capture
- Playwright trace output
- structured extractor outputs
- evaluator outputs
- normalized `results.json`

Relevant code:

- [cua-server/src/lib/run-recorder.ts](/Users/alvarovillalba/Desktop/cua-qa-testing/cua-server/src/lib/run-recorder.ts)
- [cua-server/src/lib/computer-use-loop.ts](/Users/alvarovillalba/Desktop/cua-qa-testing/cua-server/src/lib/computer-use-loop.ts)
- [cua-server/src/handlers/cua-loop-handler.ts](/Users/alvarovillalba/Desktop/cua-qa-testing/cua-server/src/handlers/cua-loop-handler.ts)

Assessment:

- This is the correct foundation. An auto-improvement system without reliable evidence becomes prompt superstition.

### 2. Persisted learning memory

Implemented today:

- per-run learning artifacts
- aggregated `patterns.json`
- generated `spl.auto.md`
- injection of that memory into future run setup

Relevant code:

- [cua-server/src/learning/learning-loop.ts](/Users/alvarovillalba/Desktop/cua-qa-testing/cua-server/src/learning/learning-loop.ts)
- [cua-server/src/handlers/test-case-initiation-handler.ts](/Users/alvarovillalba/Desktop/cua-qa-testing/cua-server/src/handlers/test-case-initiation-handler.ts)

Assessment:

- This is useful as **memory injection**.
- It is **not** yet a true research loop.

### 3. Configurable evaluators and outputs

Implemented today:

- per-metric evaluators
- configurable extractors
- configurable response schema
- post-processing into final outputs and files

Relevant code:

- [cua-server/src/evaluators/evaluator-runner.ts](/Users/alvarovillalba/Desktop/cua-qa-testing/cua-server/src/evaluators/evaluator-runner.ts)
- [cua-server/src/extractors/registry.ts](/Users/alvarovillalba/Desktop/cua-qa-testing/cua-server/src/extractors/registry.ts)
- [cua-server/src/pipelines/final-output-runner.ts](/Users/alvarovillalba/Desktop/cua-qa-testing/cua-server/src/pipelines/final-output-runner.ts)

Assessment:

- This gives the system a way to score runs and derive structured outcomes.
- That is necessary for auto-improvement, but still not sufficient.

### 4. Repo-backed editable instructions

Implemented today:

- persisted prompts
- persisted test case configuration
- persisted output instructions
- persisted assets
- project / test case selection in the UI

Relevant code:

- [frontend/lib/server/workspace-store.ts](/Users/alvarovillalba/Desktop/cua-qa-testing/frontend/lib/server/workspace-store.ts)
- [frontend/components/ConfigPanel.tsx](/Users/alvarovillalba/Desktop/cua-qa-testing/frontend/components/ConfigPanel.tsx)

Assessment:

- This is the right direction for a future “research program” layer.
- However, the system does not yet mutate these files autonomously under controlled policy.

## Why It Is Not Yet `Autoresearch`-Ready

The current system has **memory**, but not a **closed experimental control loop**.

### Critical Gap 1. No candidate-generation loop

What exists:

- `runLearningLoop()` derives patterns from one completed run and writes strings into `patterns.json` and `spl.auto.md`.

What is missing:

- no component generates concrete candidate improvements
- no prompt changes are proposed automatically
- no extractor changes are proposed automatically
- no selector changes are proposed automatically
- no evaluator changes are proposed automatically
- no code changes are proposed automatically

Current implementation evidence:

- [cua-server/src/learning/learning-loop.ts](/Users/alvarovillalba/Desktop/cua-qa-testing/cua-server/src/learning/learning-loop.ts) only aggregates heuristics such as runtime failure, missing transcript, failed evaluators, and last action

Impact:

- The loop can remember, but it cannot research.

### Critical Gap 2. No controlled experiment runner

What `autoresearch` has conceptually:

- candidate change
- bounded run
- measurement
- comparison
- keep or discard

What is missing here:

- no experiment queue
- no baseline/challenger model
- no repeated batch of benchmark test runs for comparison
- no automated multi-run sampling to reduce variance
- no experiment metadata for “candidate A beat baseline B”

Impact:

- The platform can execute a run, but not run a **research campaign**.

### Critical Gap 3. No promotion / rollback mechanism

There is currently no system that:

- applies a candidate improvement to prompts/config/code
- runs it in isolation
- compares results to baseline
- promotes it into the canonical workspace only if it wins
- rolls it back automatically otherwise

There is also no safe mutation surface equivalent to `autoresearch`’s intentionally small editable target.

Impact:

- Any autonomous “improvement” would be unsafe and non-auditable.

### Critical Gap 4. No stable objective function for improvement

The platform has metrics and evaluators, but no canonical research objective such as:

- weighted pass rate across a fixed benchmark suite
- regression penalty
- transcript extraction fidelity score
- runtime failure penalty
- mean latency target
- cost-per-run penalty

Right now:

- evaluators are per run
- results are persisted
- but there is no system-wide promotion score or champion selection rule

Impact:

- The system cannot decide what “better” means in a stable, automatable way.

### Critical Gap 5. No benchmark locking / reproducibility discipline

For a real autonomous improvement loop, you need:

- fixed benchmark suites
- stable seeds or repeated samples
- baseline snapshots
- comparable run conditions
- explicit versioning of prompts/extractors/config

Current state:

- persisted artifacts exist
- but no benchmark registry or experiment comparability protocol exists

Impact:

- Improvements and regressions are not yet scientifically comparable.

### Critical Gap 6. No code-safe self-modification layer

`Autoresearch` is fundamentally about autonomous code iteration.

This platform does **not** currently include:

- a mutation policy over allowed files
- branch-based candidate isolation
- diff review gates
- automated revert of losing candidates
- change provenance linking run results to the exact changed files

Impact:

- It is not safe to let the system modify the codebase autonomously.

### Critical Gap 7. Learning loop is heuristic, not model-driven research

Current learning loop behavior:

- derive a few pattern strings
- merge with prior pattern strings
- write `spl.auto.md`
- inject into later runs

This is useful, but limited.

It does **not** yet do:

- hypothesis formation
- experiment planning
- causal analysis across runs
- pattern clustering by failure mode
- confidence-weighted recommendations
- automatic candidate generation tied to specific failure classes

Impact:

- This is “persistent memory injection”, not “autonomous QA research”.

## Secondary Gaps

These matter, but are not the primary blockers:

### 1. No explicit research-org/program file

`Autoresearch` uses `program.md` as the human-authored research org instruction layer.

This platform has persisted prompts and context, but not a clearly separated:

- research strategy file
- improvement policy file
- allowed mutation surface file
- promotion criteria file

### 2. No cross-run comparative analytics layer

Current analytics are useful, but not yet sufficient for auto-improvement:

- counts
- filters
- saved views

Missing:

- compare run set A vs run set B
- compare before/after a candidate change
- grouped failure-mode deltas
- longitudinal win-rate tracking per candidate family

### 3. No intervention budget / safety budget

Needed for unattended auto-improvement:

- maximum runs per cycle
- maximum cost per cycle
- stop conditions
- regression threshold
- fail-fast rules
- human approval boundary for high-risk changes

## Readiness Scorecard

### Foundations

- Evidence capture: **8/10**
- Run persistence: **8/10**
- Extractor/evaluator extensibility: **7/10**
- Workspace configurability: **7/10**

### Auto-improvement-specific

- Learning memory: **5/10**
- Candidate generation: **1/10**
- Experiment orchestration: **1/10**
- Baseline/challenger comparison: **1/10**
- Promotion/rollback: **0/10**
- Safe autonomous code mutation: **0/10**

### Overall

- Human-in-the-loop improvement platform: **7/10**
- Unattended `autoresearch`-style QA improvement platform: **2/10**

## What “Ready” Would Look Like

To honestly call this `autoresearch`-ready for AI QA, the platform should add at least the following:

### Phase 1. Controlled research loop over prompts/config only

Build:

- a `research-program.md` or equivalent persisted strategy file
- a benchmark suite registry of stable test cases / datasets
- a candidate generator that proposes prompt/extractor/config variants
- a baseline vs challenger runner
- a promotion rule based on aggregate evaluator scores
- automatic rollback of losing candidates

This would create a safe first version without touching arbitrary application code.

### Phase 2. Comparative experiment store

Build:

- experiment objects
- baseline and candidate lineage
- run groups
- comparable score aggregation
- regression dashboards
- confidence scoring over repeated runs

### Phase 3. Safe code mutation lane

Only after Phase 1 and 2 are stable:

- restrict mutation to a small allowlist of files
- use isolated worktrees or branches
- require machine-verifiable validation
- persist exact diffs and decision logs
- auto-promote only under strict thresholds

## Recommended Near-Term Positioning

The honest product statement right now is:

> This platform is ready for evidence-first QA execution with persisted learning memory and human-guided improvement.

It is **not** yet honest to say:

> This platform can autonomously improve itself like `autoresearch`.

That claim would currently overstate the system.

## Highest-Leverage Next Build Steps

If the goal is specifically “AI QA autoresearch using CUA”, the next best order is:

1. Add a `research program` layer that defines objectives, mutation scope, and promotion policy.
2. Add benchmark suite execution with repeatable baseline/challenger comparisons.
3. Add candidate generation for prompts, extractors, selectors, and evaluator policies.
4. Add experiment objects and promotion/rollback rules.
5. Only then add safe autonomous code mutation.

## Final Assessment

The platform is **ready to become** an auto-improvement system, because the evidence and persistence foundations are mostly in place.

It is **not yet ready to operate as one**.

The decisive missing capability is not more memory. It is the **closed experimental loop**:

- propose
- run
- compare
- promote or reject
- repeat safely

Until that exists, the current implementation should be treated as a strong QA platform with learning memory, not as full autonomous QA autoresearch.
