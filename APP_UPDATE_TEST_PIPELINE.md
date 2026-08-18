# App Update — Test Logging Rework & JSON Data Pipeline

**Status:** specification (implemented by this update)
**Scope:** `test.html`, `test-history.html`, `home.html`, `sync.html`, `storage.js`, new `test-store.js`, new `sat-taxonomy.js`
**Date:** 2026-08-17

---

## 1. Why

Today a practice test is a thin record: two scaled scores, a hand-typed list of
missed questions (`{num, section, skill}`), and optional per-section time left.
Every chart in `test-history.html` and `home.html` is built on that shape, so the
analytics ceiling is "which skills did you miss most."

Meanwhile the AI processing pipeline (`data/unprocessed/<test>/` → `data/processed/<test>.json`)
already produces a far richer artifact: all 98 questions, correct **and** incorrect,
each with domain, skill, difficulty, error pattern, Khan Academy path, and an
explanation. That data currently has nowhere to go.

This update makes **one JSON document per practice test the canonical unit of
storage**, and makes both input modes — AI upload and manual entry — produce that
same document. Every graph in the app then reads from those documents.

---

## 2. The two input modes

`test.html` becomes a two-mode page with a segmented control at the top.

### Mode A — Auto (JSON upload)

1. User runs the AI processing pipeline offline against their test screenshots/PDF.
2. Pipeline emits a `schema_version: "1.0"` document (see `data/processed/`).
3. User drops the `.json` onto `test.html`.
4. The page **validates**, **normalizes** to schema 2.0, and shows a full preview
   (score estimate, per-module accuracy, domain breakdown, missed-question list)
   *before* anything is saved.
5. User optionally overrides the scaled scores and fills in time-left, then saves.

### Mode B — Manual

Reworked so it captures **everything the AI analysis captures**, without requiring
the user to type 98 rows:

1. **Test metadata** — name, source, date, format (full test / RW only / Math only),
   module structure.
2. **Question grid** — one cell per question per module, all defaulting to
   *correct*. The user clicks the ones they missed.
3. **Missed-question detail** — each missed question expands to require:
   domain → skill (dependent selects, driven by the shared taxonomy),
   difficulty (Easy/Medium/Hard), question format, user answer / correct answer,
   and error pattern (free text with suggestions from the error-pattern library).
4. **Time left per section** and **linked study session** — unchanged.

Manual mode emits an identical schema-2.0 document. Fields the AI would have
filled but a human did not (`explanation`, `khan_academy_path`, stimulus text)
are `null`, and `difficulty_source` is `"user"`.

---

## 3. Canonical schema — Test Record v2.0

One document per test. This is the *only* representation the app persists.

```jsonc
{
  "schema_version": "2.0",

  // App-owned. Never produced by the AI pipeline; added at ingest.
  "app": {
    "id": "t_1766952000000_a1b2",   // stable primary key
    "date": "2025-12-28T12:00:00.000Z",  // canonical: every chart sorts/filters on this
    "created_at": "2026-08-17T20:00:00.000Z",
    "updated_at": "2026-08-17T20:00:00.000Z",
    "input_mode": "auto" | "manual" | "legacy",
    "source_file": "College Board - SAT Practice 4 - December 28, 2025.json",
    "linked_session_id": null,
    "time_left_seconds": { "rw1": 312, "rw2": null, "m1": null, "m2": null },
    "has_detail": true              // false for upgraded legacy records (misses only)
  },

  "test_metadata": {
    "test_id":        "practice4_20251228",
    "test_name":      "SAT Practice 4",
    "source_type":    "digital" | "paper" | "unknown",
    "source_name":    "College Board" | null,
    "source_detail":  "…free text…" | null,
    "date_completed": "2025-12-28",              // ISO date, authoritative for charts
    "test_format":    "full_test" | "rw_only" | "math_only" | "module",
    "modules_included": ["RW_Module1","RW_Module2","Math_Module1","Math_Module2"],
    "total_questions": 98,
    "correct_count":   68,

    // Scaled scores. `estimated` distinguishes a curve estimate from
    // a real reported score the user typed in.
    "scores": {
      "rw": 610, "math": 620, "total": 1230,
      "estimated": true,
      "raw": { "rw": 38, "rw_total": 54, "math": 30, "math_total": 44 }
    },

    "time_limit_minutes": null,
    "actual_time_used_minutes": null,
    "notes": "…"
  },

  "questions": [
    {
      "question_number": 1,              // 1-based WITHIN its module
      "module": "Reading and Writing" | "Math",
      "module_slug": "rw1" | "rw2" | "m1" | "m2",   // derived at ingest — see §4.2
      "global_index": 1,                 // 1-based across the whole test
      "question_format": "multiple_choice" | "student_produced_response",
      "user_answer": "C", "correct_answer": "A",
      "is_correct": false,

      "domain": "Craft and Structure",
      "skill":  "Words in Context",              // as written by the source
      "skill_key": "words-in-context",           // canonical slug — see §4.3
      "khan_academy_path": "…" | null,

      "difficulty": "Easy" | "Medium" | "Hard" | null,
      "difficulty_source": "…rationale…" | "user" | null,
      "error_pattern": "Missed negation/contrast logic" | null,
      "explanation": "…" | null,

      "time_spent_seconds": null,
      "flagged_for_review": false,
      "confidence_level": null,
      "source_image_reference": "…" | null,

      // Optional heavy fields — kept if present, never required.
      "passage_or_stimulus_text": null,
      "question_text": null,
      "answer_choices": null
    }
  ]
}
```

### 3.1 Compatibility projection ("summary")

Every graph that exists today reads a flat test object. Rather than rewrite all of
them at once, the store derives a **summary** from each record with exactly the
legacy field names, plus new aggregate fields:

```jsonc
{
  // ── legacy fields, unchanged semantics ──
  "id": "t_1766952000000_a1b2",
  "date": "2025-12-28T12:00:00.000Z",
  "rwScore": 610,
  "mathScore": 620,
  "missedQuestions": [ { "num": 1, "section": "rw1", "skill": "Words in Context" }, … ],
  "timeLeft": { "rw1": 312, "rw2": null, "m1": null, "m2": null },
  "linkedSessionId": null,

  // ── new aggregate fields ──
  "testName": "SAT Practice 4",
  "sourceName": "College Board",
  "testFormat": "full_test",
  "isFullTest": true,
  "inputMode": "auto",
  "scoresEstimated": true,
  "rawScores": { "rw": 38, "rw_total": 54, "math": 30, "math_total": 44 },
  "totalQuestions": 98,
  "correctCount": 68,
  "accuracy": 0.694,
  "byModule":      { "rw1": {"total":27,"correct":22}, … },
  "byDomain":      { "Craft and Structure": {"total":15,"correct":10}, … },
  "bySkill":       { "words-in-context": {"label":"Words in Context","section":"rw","total":10,"correct":8}, … },
  "bySkillModule": { "rw1|words-in-context": {"skillKey":"words-in-context","module":"rw1","total":6,"correct":5, …}, … },
  "byDifficulty":  { "Easy": {"total":12,"correct":12}, "Medium": {…}, "Hard": {…} },
  "errorPatterns": { "Comma-splice/run-on distinction miss": 4, … },
  "coverage": { "module": true, "skill": true, "domain": true, "difficulty": true },
  "hasDetail": true
}
```

`missedQuestions` is derived, not stored — it is `questions.filter(q => !q.is_correct)`
projected onto the legacy shape. **Every existing chart keeps working untouched.**

`bySkillModule` is a skill × module crosstab so the per-module skill panels can be
built from the summary alone, without loading the full record.

### 3.2 Coverage — which tests may enter an accuracy denominator

This is the single most important rule in the data model.

A test can know some dimensions for *every* question but others only for the
questions it got **wrong**. Manual entry is the normal case: the user marks which
questions they missed (so the module is known for all 98) but only classifies the
misses (so skill, domain and difficulty are known for those 9 alone).

Counting that test's 9 classified questions as its whole sample would report
`Easy: 0/1` and drag every accuracy rate toward zero. So each summary carries a
per-dimension `coverage` flag, and the selectors obey one rule:

> **A test enters an accuracy denominator for a dimension only if it classified
> that dimension end to end. Otherwise it contributes its misses and nothing else.**

| Record | module | skill | domain | difficulty |
|---|---|---|---|---|
| AI import (full pipeline output) | ✓ | ✓ | ✓ | ✓ |
| Manual entry | ✓ | — | — | — |
| Legacy (`has_detail: false`) | — | — | — | — |

Selectors therefore return **both** numbers: `missed` counts every test, while
`attempted` / `correct` / `accuracy` count only covered tests, and `ratedTests`
says how many tests backed the rate. The UI never shows a bare percentage next to
a miss count it doesn't cover — it writes `7 missed · 3/9 counted` instead of the
nonsensical-looking `7 missed · 33%`.

### 3.3 Partial-format tests

An `rw_only` / `math_only` test has no 1600 score. `SAT_TESTS.scoreLabel(summary)`
returns the right value, denominator and note (`760`, `/ 800`, `Math only`), and
`isFullTest` lets the score-over-time charts and the best/average stat cards skip
them — a 20-question math drill plotted on a 1600 trend reads as a collapse rather
than a shorter test. Partial tests still count everywhere misses are analysed, and
the stat card says how many were excluded.

---

## 4. Normalization rules (ingest)

Implemented in `test-store.js` → `normalize(raw, opts)`.

### 4.1 Version detection

| Input | Detection | Action |
|---|---|---|
| Schema 2.0 record | `schema_version === "2.0"` | pass through, refresh derived fields |
| AI pipeline v1.0 | `schema_version === "1.0"` and `questions` is an array | upgrade (below) |
| Legacy app test | has `rwScore` / `missedQuestions`, no `questions` | wrap into a record with a synthetic `questions` array built from `missedQuestions`; `hasDetail: false` |

Legacy tests already in a user's localStorage are upgraded **in place on first
load**, so no data is lost and no migration step is required from the user.

### 4.2 `module_slug` derivation

The v1.0 pipeline restarts `question_number` at 1 in each module and only records
a coarse `module` ("Reading and Writing" / "Math"), so the module must be recovered.
Resolution order:

1. Explicit `module_slug` / `module_id` field, if the producer supplied one.
2. Regex `(RW|Math)_Module([12])` against `source_image_reference` — this is what
   the current pipeline emits, e.g. `"Compiled.pdf - RW_Module1 Q1: …"`.
3. Positional fallback: within each `module` group, questions are taken in file
   order and split at the standard digital-SAT counts (RW 27+27, Math 22+22).
   If the counts do not match, the group is split in half.

A `question_number` that resets to a lower value than its predecessor inside a
group is also treated as a module boundary.

### 4.3 Skill canonicalization (`skill_key`)

The pipeline writes skills in College Board's own casing
(`"Nonlinear functions"`, `"Linear equations in two variables"`), while the app's
manual picker used Title Case (`"Nonlinear Functions"`). Grouping on the raw
string would split one skill into two bars on every chart.

`sat-taxonomy.js` owns the single source of truth: for each of the 4 domains × N
skills it stores a canonical label, a slug, the section (`rw`/`math`), and a list
of known aliases. `skillKey(raw)` lowercases, strips punctuation, collapses
whitespace, and looks the result up in the alias index; unknown skills fall back
to a slug of their own text and are still charted (labelled with the source's
own wording) rather than dropped.

### 4.4 Score estimation

The v1.0 pipeline leaves `section_scores` null because the review screens don't
show them. The store estimates scaled scores from raw correct counts with a
piecewise-linear curve (`estimateScaled(raw, total, section)`), anchored at:

- **R&W** (of 54): 0→200, 5→260, 10→320, 15→380, 20→430, 25→480, 30→530, 35→580, 40→630, 45→690, 50→750, 54→800
- **Math** (of 44): 0→200, 4→260, 8→320, 12→380, 16→440, 20→490, 24→540, 28→590, 32→650, 36→710, 40→770, 44→800

Results are rounded to the nearest 10 and clamped to 200–800.

> This is an approximation of the adaptive digital-SAT curve, not the real one —
> the real curve varies per form and depends on Module 2 difficulty routing.
> Any estimated score is flagged `estimated: true` and rendered with a `~` prefix
> and an "estimated" chip so it is never mistaken for a reported score. If the
> user types real scores, they replace the estimate and `estimated` flips false.

For the sample file (`SAT Practice 4`): RW 38/54 → ~610, Math 30/44 → ~620,
total ~1230.

### 4.5 Validation

Upload is rejected with a specific, human-readable reason when: the file isn't
valid JSON; `questions` is missing or empty; a question lacks `is_correct`; or
`date_completed` is unparseable. Warnings (shown, but non-blocking): unknown
skill names, missing domains, module counts that don't match `test_format`,
`correct_count` disagreeing with the questions array (the array wins).

---

## 5. Storage & data flow

### 5.1 Layers

```
                      ┌────────────────────────────────────────┐
                      │  AI pipeline (offline)                 │
                      │  data/unprocessed/<test>/*.png,*.pdf   │
                      │            ↓                           │
                      │  data/processed/<test>.json  (v1.0)    │
                      └───────────────┬────────────────────────┘
                                      │  user drops file
                                      ▼
  ┌─────────────┐            ┌──────────────────┐            ┌──────────────┐
  │ test.html   │            │  test-store.js   │            │  storage.js  │
  │  Mode A ────┼──raw JSON─►│  normalize()     │            │  (sessions + │
  │  Mode B ────┼──builder──►│  validate()      │            │   summaries) │
  └─────────────┘            │  derive summary  │            └──────┬───────┘
                             │  save()          │                   │
                             └────────┬─────────┘                   │
                        ┌─────────────┴───────────┐                 │
                        ▼                         ▼                 ▼
              localStorage                  localStorage       Firestore
              sat_test_doc_<id>             sat_prep_tests     users/{uid}/…
              (full record)                 (summary array)
                        │                         │
                        └────────────┬────────────┘
                                     ▼
                    ┌────────────────────────────────────┐
                    │ SAT_TESTS selectors                │
                    │  getSummaries() getDetail(id)      │
                    │  skillStats() domainStats()        │
                    │  difficultyStats() errorPatterns() │
                    └───────┬──────────────┬─────────────┘
                            ▼              ▼
                   test-history.html    home.html
                      (all charts)      (score chart, skill card)
```

### 5.2 localStorage keys

| Key | Contents | Written by |
|---|---|---|
| `sat_prep_sessions` | study sessions (unchanged) | `storage.js` |
| `sat_prep_tests` | array of **summaries** (§3.1) | `test-store.js` via `storage.js` |
| `sat_test_doc_<id>` | one full v2.0 record | `test-store.js` |
| `sat_test_mode` | last-used entry mode (`auto` / `manual`) | `test.html` |

Staleness is detected from the summary's own `updatedAt` against the local
record's `app.updated_at`, so no separate index key is needed.

Keeping summaries in the existing `sat_prep_tests` key is deliberate: `home.html`,
`sync.html` and every current chart continue to read it with no change, and the
Firestore document shape in `storage.js` stays as-is.

### 5.3 Firestore (Google account storage)

```
users/{uid}/
  data/main                  ← { sessions, tests: [summary…], updatedAt }   (existing)
  tests/{testId}             ← { record: <full v2.0 JSON>, updatedAt }      (new)
```

Full records go in their own documents because a single test's JSON is ~100 KB;
98 questions × several tests would blow past Firestore's 1 MB per-document limit
if bundled into `data/main`. Per-test documents also let detail load lazily.

Sync behaviour:

- **On write** — summary array is pushed to `data/main` (existing path), and the
  full record is pushed to `tests/{id}` in the background.
- **On sign-in / pull** — summaries merge as they do today. Detail documents are
  fetched for any summary whose `id` has no local `sat_test_doc_<id>`, or whose
  `updated_at` is newer than the local copy. A `sat:testsynced` event fires when
  detail arrives so open charts re-render.
- **On delete** — `SAT_TESTS.remove(id)` drops the summary, the local detail
  document and `tests/{id}`. `SAT_TESTS.clearAll()` does the same for every test
  (used by a replace-mode import, which would otherwise orphan the old detail
  documents in localStorage).
- **Offline** — everything works from localStorage; pushes are fire-and-forget and
  retried on next write, exactly as `storage.js` behaves today.

**Firestore rules must be widened** from the single-document rule to cover the new
subcollection:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### 5.4 Export / import (`sync.html`)

The backup file gains a `testDocs` array holding full records:

```jsonc
{ "sessions": [...], "tests": [...summaries...], "testDocs": [...v2.0 records...],
  "exportedAt": "…", "version": 2 }
```

Version-1 backups (no `testDocs`) still import — their tests land as legacy
records with `hasDetail: false`.

---

## 6. Chart rework — what reads what

Every chart moves onto `SAT_TESTS` selectors, which read the JSON records.

| Surface | Chart | Source |
|---|---|---|
| `home.html` | Score over time | summaries, `isFullTest` only |
| `home.html` | Focus-on / priority skills | `missedQuestions` keyed by `skillKey`, `skillStats()` on hover |
| `test-history.html` | Best / average stat cards | summaries, `isFullTest` only |
| `test-history.html` | Score over time | summaries, `isFullTest` only |
| `test-history.html` | Avg time left per section | `summary.timeLeft` |
| `test-history.html` | Most missed skills | `skillStats()` — miss count **and** accuracy |
| `test-history.html` | Misses by section | `skillStats({ module })`, `moduleStats()` |
| `test-history.html` | Per-module skill panels | `skillStats({ module })` via `bySkillModule` |
| `test-history.html` | Improving & worsening skills | recency-weighted miss deltas |
| `test-history.html` | Skill trend | `skillTrend(skillKey)` |
| `test-history.html` | **Accuracy by domain** *(new)* | `domainStats()` |
| `test-history.html` | **Accuracy by difficulty** *(new)* | `difficultyStats()` |
| `test-history.html` | **Recurring error patterns** *(new)* | `errorPatternStats()` |
| `test-history.html` | **Question map** *(new, in test detail modal)* | `getDetail(id).questions` |

The important upgrade: with the full question array we know **attempts**, not just
misses. A skill you saw ten times and missed three no longer outranks one you saw
twice and missed both. Where a rate can't honestly be computed, §3.2's coverage rule
suppresses it rather than inventing one.

Trend and "improving / worsening" still key off **miss counts**, not accuracy,
because those must work across a mixed history — a manual entry knows its misses
exactly but not its denominator. Accuracy is reported alongside, from the tests
that do know it.

---

## 7. Visual design — Urban Systems brand

Follows `Urban Systems Brand Guidelines 7-11-26/`.

- **Type** — Inter (titles/headers/body, 500, −0.061em tracking, 0.81 line-height for
  display sizes); Libre Baskerville regular/italic for subheaders and highlights.
  Both already loaded by every page.
- **Palette** — the guidelines list exactly two Main Colors: White `#ffffff` and
  Grey `#1e1e1e`. Every surface, line, icon and label in the app is one of those
  two, or a neutral tint between them (`--off-white #f5f5f5`, `--gray #d0d0d0`,
  `--gray-mid #9a9a9a`, `--gray-text #6b6b6b`). Emphasis comes from weight, fill
  and scale — never from hue.
- **The two exceptions** — data-series colors, and the only chromatic values
  anywhere in the app:

  | Token | Value | Use |
  |---|---|---|
  | `--rw` | `#669bbc` | Reading & Writing data |
  | `--math` | `#c1121f` | Math data |

  They exist so an R&W series is never confused with a Math series in a chart.
  They are not available for UI chrome, states or decoration.
- **Spacing** — 8px base unit; every value a multiple of 8 (`4/8/16/32/64/128`).
- **Buttons** — dark filled pill, generous radius, white Inter label.
- **Icons** — single-weight rounded stroke line icons.

### 7.1 Encoding meaning without hue

Removing the accent ramps meant re-encoding everything that had leaned on color:

| Signal | Was | Now |
|---|---|---|
| Question grid: correct vs missed | Navy vs orange fill | Missed takes the solid `#1e1e1e` fill; correct recedes to an `--off-white` chip with a grey border. Misses are what you scan for, so they get the weight. |
| Question needing a skill | Sand inset ring | Dashed border |
| Error / warning / success message | Orange / sand / blue tint | Each already carries its own icon; they now separate by border treatment — 4px solid, dashed, and hairline respectively |
| Difficulty (Easy → Hard) | Slate → sand → orange | Neutral ramp `#9a9a9a` → `#6b6b6b` → `#1e1e1e`, darker as it gets harder |
| Difficulty toggle (active) | Three different fills | One `#1e1e1e` fill |
| Improving vs worsening | Green vs red | Worsening is `#1e1e1e` at weight 600, improving is `--gray-text`; the ↑ / ↓ arrows carry the direction |
| Error-pattern bars | Orange | `#1e1e1e` |
| AI-import badge | Blue tint | Solid dark chip |
| Focus-score overlay | Green line and dots | Dark line drawn over a white halo (two stacked polylines) with white dots ringed in dark, so it stays legible over both the dark bars and the light chart ground |

The R&W / Math split in the misses-by-section bars, per-module chips and skill
charts keeps its color, because that is exactly the data distinction the two
exception colors exist for.

## 8. Files

| File | Change |
|---|---|
| `sat-taxonomy.js` | **new** — domains, skills, aliases, `skillKey()`, error-pattern library |
| `test-store.js` | **new** — normalize / validate / derive / persist / sync / selectors |
| `test.html` | **rewritten** — two-mode logger |
| `test-history.html` | charts moved onto `SAT_TESTS`; three new panels + question map |
| `home.html` | skill card moved onto `SAT_TESTS.skillStats()` |
| `sync.html` | export/import carries `testDocs`; replace-mode uses `clearAll()` |
| `storage.js` | unchanged API; exposes `_firestore()` so the store can write its own subcollection |
| `app.css` | brand accent tokens + shared components for the new UI |
| `firebase-config.js` | updated rules comment |
| `sw.js` | cache version bump + new files in the precache list |

---

## 9. Acceptance checks

Verified in a headless Chrome harness driving the real pages (two full passes:
happy path, then edge cases).

| # | Check | Result |
|---|---|---|
| 1 | Uploading `data/processed/College Board - SAT Practice 4 - December 28, 2025.json` previews 98 questions, 68 correct, 4 modules | ✅ modules recovered 27/27/22/22 from `source_image_reference` |
| 2 | Score estimated from raw | ✅ RW 38/54 → ~610, Math 30/44 → ~620, total ~1230, flagged estimated |
| 3 | Saved test appears in the test list, home score chart, and every `test-history.html` panel | ✅ |
| 4 | `skillStats()` reports attempts and misses | ✅ Words in Context 6/10 attempts, Boundaries 3/9 |
| 5 | Manual mode produces a record passing the same validator | ✅ `has_detail: true`, `input_mode: "manual"`, 98 questions |
| 6 | Manual mode blocks saving until every missed question has a domain and skill | ✅ |
| 7 | Legacy localStorage tests upgrade in place and keep their date and misses | ✅ |
| 8 | Legacy and manual tests never enter an accuracy denominator (§3.2) | ✅ difficulty stayed 12/12, 44/51, 12/35 from the one covered test |
| 9 | Malformed uploads are rejected with a specific reason | ✅ bad JSON, missing `questions`, missing `is_correct` |
| 10 | Unknown skills and metadata mismatches warn but still import | ✅ charted under the source's own wording |
| 11 | Section-only tests score out of 800 and stay out of the 1600 trend | ✅ `~760 / 800 · Math only` |
| 12 | Delete removes the summary *and* the detail document | ✅ no orphaned `sat_test_doc_*` keys |
| 13 | Reload persists everything | ✅ |
| 14 | Export → clear → replace-import restores full question detail | ✅ 2 tests, 98q each, modes and estimate flags preserved |

**Not verified in the harness:** the Firestore round trip (check 15 in the original
list). It needs a signed-in Google account, which the offline harness has no
credentials for, so the `users/{uid}/tests/{testId}` read/write path is exercised
only by code review. **The Firestore rules must be widened as described in §5.3
before cloud sync will accept the new per-test documents** — the old
`/users/{uid}/data/{doc}` rule denies writes to the `tests` subcollection.
