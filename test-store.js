/* SAT Prep — practice-test store
 *
 * One JSON document per practice test is the canonical unit of storage.
 * Both input modes (AI-pipeline upload, manual entry) produce the same
 * schema-2.0 record; every chart in the app reads from these records.
 *
 * See APP_UPDATE_TEST_PIPELINE.md for the full schema and data flow.
 *
 * Layers
 *   sat_test_doc_<id>  localStorage   full v2.0 record
 *   sat_prep_tests     localStorage   derived summaries (legacy key/shape, so
 *                                     existing charts keep working untouched)
 *   users/{uid}/data/main             summaries, pushed by storage.js
 *   users/{uid}/tests/{id}            full records, pushed here
 *
 * Depends on: sat-taxonomy.js, storage.js
 */
const SAT_TESTS = (() => {
    const DOC_PREFIX = 'sat_test_doc_';
    const SCHEMA     = '2.0';

    const T = SAT_TAXONOMY;

    /* ══════════════════════════════════════════════════════════
       Score curve
       Piecewise-linear approximation of the digital SAT raw → scaled
       conversion. The real curve varies per form (Module 2 routing), so
       anything produced here is flagged `estimated` and rendered with a "~".
    ══════════════════════════════════════════════════════════ */
    const CURVE = {
        rw:   [[0,200],[5,260],[10,320],[15,380],[20,430],[25,480],[30,530],[35,580],[40,630],[45,690],[50,750],[54,800]],
        math: [[0,200],[4,260],[8,320],[12,380],[16,440],[20,490],[24,540],[28,590],[32,650],[36,710],[40,770],[44,800]]
    };

    function estimateScaled(raw, total, section) {
        const pts = CURVE[section] || CURVE.rw;
        const max = pts[pts.length - 1][0];
        if (!total || total <= 0) return null;
        // Rescale onto the curve's own question count so partial tests still map.
        const x = Math.max(0, Math.min(max, (raw / total) * max));
        let y = pts[pts.length - 1][1];
        for (let i = 0; i < pts.length - 1; i++) {
            const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
            if (x >= x0 && x <= x1) { y = y0 + (y1 - y0) * (x1 === x0 ? 0 : (x - x0) / (x1 - x0)); break; }
        }
        return Math.max(200, Math.min(800, Math.round(y / 10) * 10));
    }

    /* ══════════════════════════════════════════════════════════
       Normalisation
    ══════════════════════════════════════════════════════════ */

    function newId() {
        return 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    }

    /* Turn "2025-12-28" (or an ISO timestamp) into a local-noon ISO string, so
     * a date never slips a day across time zones the way a bare UTC midnight can. */
    function toDateISO(v) {
        if (!v) return null;
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
        if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0).toISOString();
        const d = new Date(v);
        return isNaN(d) ? null : d.toISOString();
    }
    function toDateOnly(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d)) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    /* module_slug recovery — see §4.2 of the spec.
     * The v1.0 pipeline restarts question_number at 1 per module and only
     * records a coarse "Reading and Writing" / "Math", so the module has to be
     * rebuilt from the image reference or from position within the group. */
    function assignModules(questions) {
        const groups = { rw: [], math: [] };
        questions.forEach(q => {
            const isMath = /math/i.test(q.module || '') ||
                           T.sectionOfDomain(q.domain) === 'math';
            (isMath ? groups.math : groups.rw).push(q);
        });

        for (const [section, list] of Object.entries(groups)) {
            const slugs = section === 'rw' ? ['rw1', 'rw2'] : ['m1', 'm2'];
            const std   = section === 'rw' ? 27 : 22;

            // 1 & 2 — explicit field, then the image reference.
            let resolved = list.every(q => {
                if (q.module_slug && slugs.includes(q.module_slug)) return true;
                const ref = q.source_image_reference || q.module_id || '';
                const m   = /(RW|Math)[ _-]*Module[ _-]*([12])/i.exec(ref);
                if (m) { q.module_slug = (/rw/i.test(m[1]) ? 'rw' : 'm') + m[2]; return true; }
                return false;
            });
            if (resolved) continue;

            // 3 — positional. Split where question_number resets, else at the
            //     standard count, else in half.
            let boundary = -1;
            for (let i = 1; i < list.length; i++) {
                const prev = Number(list[i - 1].question_number);
                const cur  = Number(list[i].question_number);
                if (isFinite(prev) && isFinite(cur) && cur <= prev) { boundary = i; break; }
            }
            if (boundary < 0) boundary = list.length > std ? std : Math.ceil(list.length / 2);
            list.forEach((q, i) => { q.module_slug = i < boundary ? slugs[0] : slugs[1]; });
        }
    }

    function normalizeQuestion(raw, i) {
        const domain  = raw.domain || null;
        const entry   = T.resolve(raw.skill, domain);
        const diffRaw = raw.difficulty || raw.difficulty_inferred || null;
        const diff    = diffRaw ? String(diffRaw).trim().replace(/^./, c => c.toUpperCase()) : null;

        return {
            question_number: Number(raw.question_number) || i + 1,
            module:          raw.module || (entry && entry.section === 'math' ? 'Math' : 'Reading and Writing'),
            module_slug:     raw.module_slug || null,
            global_index:    i + 1,
            question_format: raw.question_format || 'multiple_choice',
            user_answer:     raw.user_answer ?? null,
            correct_answer:  raw.correct_answer ?? null,
            is_correct:      !!raw.is_correct,

            domain:      domain,
            skill:       raw.skill || null,
            skill_key:   entry ? entry.key : null,
            khan_academy_path: raw.khan_academy_path || null,

            difficulty:        ['Easy', 'Medium', 'Hard'].includes(diff) ? diff : null,
            difficulty_source: raw.difficulty_source || null,
            error_pattern:     raw.error_pattern || null,
            explanation:       raw.explanation || null,

            time_spent_seconds: raw.time_spent_seconds ?? null,
            flagged_for_review: !!raw.flagged_for_review,
            confidence_level:   raw.confidence_level ?? null,
            source_image_reference: raw.source_image_reference || null,

            passage_or_stimulus_text: raw.passage_or_stimulus_text ?? null,
            question_text:            raw.question_text ?? null,
            answer_choices:           raw.answer_choices ?? null
        };
    }

    /* Legacy app test → synthetic record. Only the misses are known, so the
     * questions array holds just those, and hasDetail stays false so accuracy
     * denominators never count a test whose attempts we don't know. */
    function fromLegacy(t) {
        const questions = (t.missedQuestions || []).map((q, i) => {
            const entry = T.resolve(q.skill, null);
            const slug  = ['rw1', 'rw2', 'm1', 'm2'].includes(q.section) ? q.section
                        : (entry && entry.section === 'math' ? 'm1' : 'rw1');
            return normalizeQuestion({
                question_number: Number(q.num) || i + 1,
                module: T.sectionOfModule(slug) === 'math' ? 'Math' : 'Reading and Writing',
                module_slug: slug,
                is_correct: false,
                skill: q.skill,
                domain: entry ? entry.domain : null
            }, i);
        });

        const dateISO = toDateISO(t.date) || new Date().toISOString();

        return {
            schema_version: SCHEMA,
            app: {
                id: t.id || newId(),
                // app.date is the canonical date every chart sorts and filters on.
                // Set it here rather than leaving it to withDerived(), because
                // getSummaries() calls fromLegacy() directly when upgrading a
                // record it finds in storage.
                date: dateISO,
                created_at: dateISO,
                updated_at: dateISO,
                input_mode: 'legacy',
                source_file: null,
                linked_session_id: t.linkedSessionId || null,
                time_left_seconds: t.timeLeft || { rw1: null, rw2: null, m1: null, m2: null },
                has_detail: false
            },
            test_metadata: {
                test_id: null,
                test_name: t.testName || 'Practice test',
                source_type: 'unknown',
                source_name: null,
                source_detail: null,
                date_completed: toDateOnly(t.date),
                test_format: t.testFormat || 'full_test',
                modules_included: ['RW_Module1', 'RW_Module2', 'Math_Module1', 'Math_Module2'],
                total_questions: null,
                correct_count: null,
                scores: {
                    rw: t.rwScore ?? null,
                    math: t.mathScore ?? null,
                    total: (t.rwScore || 0) + (t.mathScore || 0),
                    estimated: false,
                    raw: null
                },
                time_limit_minutes: null,
                actual_time_used_minutes: null,
                notes: null
            },
            questions
        };
    }

    /* Accepts: a v2.0 record, a v1.0 pipeline document, or a legacy app test. */
    function normalize(raw, opts = {}) {
        if (!raw || typeof raw !== 'object') throw new Error('Not a JSON object.');

        // Legacy app test
        if (!Array.isArray(raw.questions) && ('rwScore' in raw || 'missedQuestions' in raw)) {
            return withDerived(fromLegacy(raw));
        }
        if (!Array.isArray(raw.questions)) throw new Error('Missing a "questions" array.');
        if (raw.questions.length === 0)    throw new Error('The "questions" array is empty.');

        const meta = raw.test_metadata || {};
        const app  = raw.app || {};

        const questions = raw.questions.map(normalizeQuestion);
        assignModules(questions);
        // Re-index global order by module so charts read left-to-right in test order.
        const order = { rw1: 0, rw2: 1, m1: 2, m2: 3 };
        questions.sort((a, b) => (order[a.module_slug] - order[b.module_slug]) ||
                                 (a.question_number - b.question_number));
        questions.forEach((q, i) => { q.global_index = i + 1; });

        const correct = questions.filter(q => q.is_correct).length;

        // Raw counts per section
        const rawRW   = questions.filter(q => T.sectionOfModule(q.module_slug) === 'rw');
        const rawMath = questions.filter(q => T.sectionOfModule(q.module_slug) === 'math');
        const rawCounts = {
            rw: rawRW.filter(q => q.is_correct).length,   rw_total: rawRW.length,
            math: rawMath.filter(q => q.is_correct).length, math_total: rawMath.length
        };

        /* Scores, in precedence order per section:
         *   1. an override the user just typed        → real
         *   2. a reported section score in the file   → real
         *   3. whatever a previous normalize settled on → inherits its estimated flag
         *   4. the curve                              → estimated
         * The record is estimated if *either* section is, since that's what makes
         * the total an approximation. */
        const reported = meta.section_scores || {};
        const prev     = meta.scores || {};
        const override = opts.scores || {};

        function resolveScore(overrideVal, reportedVal, prevVal, raw, total, section) {
            let v = firstNum(overrideVal);
            if (v != null) return { value: v, estimated: false };
            v = firstNum(reportedVal);
            if (v != null) return { value: v, estimated: false };
            v = firstNum(prevVal);
            if (v != null) return { value: v, estimated: !!prev.estimated };
            if (!total) return { value: null, estimated: false };
            return { value: estimateScaled(raw, total, section), estimated: true };
        }

        const rwRes   = resolveScore(override.rw,   reported.reading_writing, prev.rw,
                                     rawCounts.rw,   rawCounts.rw_total,   'rw');
        const mathRes = resolveScore(override.math, reported.math,           prev.math,
                                     rawCounts.math, rawCounts.math_total, 'math');

        const rwScore   = rwRes.value;
        const mathScore = mathRes.value;
        const estimated = rwRes.estimated || mathRes.estimated;

        const dateISO = toDateISO(opts.date || meta.date_completed || app.created_at) ||
                        new Date().toISOString();

        const record = {
            schema_version: SCHEMA,
            app: {
                id: opts.id || app.id || newId(),
                created_at: app.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                input_mode: opts.inputMode || app.input_mode || 'auto',
                source_file: opts.sourceFile || app.source_file || null,
                linked_session_id: opts.linkedSessionId ?? app.linked_session_id ?? null,
                time_left_seconds: opts.timeLeft || app.time_left_seconds ||
                                   { rw1: null, rw2: null, m1: null, m2: null },
                has_detail: true
            },
            test_metadata: {
                test_id:       meta.test_id || null,
                test_name:     opts.testName || meta.test_name || 'Practice test',
                source_type:   meta.source_type || 'unknown',
                source_name:   opts.sourceName ?? meta.source_name ?? null,
                source_detail: meta.source_detail || null,
                date_completed: toDateOnly(dateISO),
                test_format:   meta.test_format || inferFormat(questions),
                modules_included: [...new Set(questions.map(q => slugToModuleName(q.module_slug)))],
                total_questions: questions.length,
                correct_count:   correct,
                scores: {
                    rw: rwScore ?? null,
                    math: mathScore ?? null,
                    total: (rwScore || 0) + (mathScore || 0),
                    estimated,
                    raw: rawCounts
                },
                time_limit_minutes: meta.time_limit_minutes ?? null,
                actual_time_used_minutes: meta.actual_time_used_minutes ?? null,
                notes: opts.notes ?? meta.notes ?? null
            },
            questions
        };
        record.app.date = dateISO;
        return withDerived(record);
    }

    function firstNum(...vals) {
        for (const v of vals) {
            const n = Number(v);
            if (v != null && v !== '' && isFinite(n)) return n;
        }
        return null;
    }
    function slugToModuleName(s) {
        return { rw1: 'RW_Module1', rw2: 'RW_Module2', m1: 'Math_Module1', m2: 'Math_Module2' }[s] || s;
    }
    function inferFormat(questions) {
        const hasRW   = questions.some(q => T.sectionOfModule(q.module_slug) === 'rw');
        const hasMath = questions.some(q => T.sectionOfModule(q.module_slug) === 'math');
        if (hasRW && hasMath) return 'full_test';
        return hasMath ? 'math_only' : 'rw_only';
    }

    /* Stamp the canonical date onto the record so summaries and charts agree. */
    function withDerived(record) {
        if (!record.app.date) {
            record.app.date = toDateISO(record.test_metadata.date_completed) || record.app.created_at;
        }
        return record;
    }

    /* ══════════════════════════════════════════════════════════
       Validation — blocking errors vs. advisory warnings
    ══════════════════════════════════════════════════════════ */
    function validate(raw) {
        const errors = [], warnings = [];
        if (!raw || typeof raw !== 'object') { errors.push('File is not a JSON object.'); return { errors, warnings }; }

        const qs = raw.questions;
        if (!Array.isArray(qs))  errors.push('Missing a "questions" array.');
        else if (!qs.length)     errors.push('The "questions" array is empty.');
        else {
            const missingCorrect = qs.filter(q => typeof q.is_correct !== 'boolean').length;
            if (missingCorrect) errors.push(`${missingCorrect} question(s) missing an "is_correct" boolean.`);

            const noSkill = qs.filter(q => !q.skill).length;
            if (noSkill) warnings.push(`${noSkill} question(s) have no skill and won't appear in skill charts.`);

            const unknown = [...new Set(qs.map(q => {
                const e = T.resolve(q.skill, q.domain);
                return e && e.unknown ? q.skill : null;
            }).filter(Boolean))];
            if (unknown.length) warnings.push(`Unrecognised skill name(s): ${unknown.slice(0, 4).join(', ')}${unknown.length > 4 ? '…' : ''}. They'll still be charted under their own name.`);

            const meta = raw.test_metadata || {};
            if (meta.correct_count != null) {
                const actual = qs.filter(q => q.is_correct).length;
                if (Number(meta.correct_count) !== actual) {
                    warnings.push(`Metadata says ${meta.correct_count} correct, but the questions list has ${actual}. Using ${actual}.`);
                }
            }
            if (meta.date_completed && !toDateISO(meta.date_completed)) {
                errors.push(`Could not read "date_completed": ${meta.date_completed}`);
            }
        }
        return { errors, warnings };
    }

    /* ══════════════════════════════════════════════════════════
       Summary projection (§3.1) — legacy field names preserved
    ══════════════════════════════════════════════════════════ */
    function toSummary(record) {
        const meta = record.test_metadata;
        const qs   = record.questions;
        const hasDetail = !!record.app.has_detail;

        const bucket = () => ({ total: 0, correct: 0 });
        const byModule = {}, byDomain = {}, bySkill = {}, bySkillModule = {},
              byDifficulty = {}, errorPatterns = {};

        qs.forEach(q => {
            const inc = (obj, key, extra) => {
                if (!key) return;
                if (!obj[key]) obj[key] = Object.assign(bucket(), extra || {});
                obj[key].total++;
                if (q.is_correct) obj[key].correct++;
            };
            inc(byModule, q.module_slug);
            inc(byDomain, q.domain);
            if (q.skill_key) {
                // Prefer the canonical label, so an AI import ("Nonlinear functions")
                // and a manual entry ("Nonlinear Functions") share one chart row.
                // Skills outside the official tree keep the source's own wording.
                const known = T.skill(q.skill_key);
                const extra = {
                    label: known ? known.label : (q.skill || q.skill_key),
                    section: T.sectionOfModule(q.module_slug),
                    domain: q.domain || null
                };
                inc(bySkill, q.skill_key, extra);
                // Crosstab, so per-module skill panels can be built from the
                // summary alone without loading the full record.
                inc(bySkillModule, `${q.module_slug}|${q.skill_key}`,
                    Object.assign({ skillKey: q.skill_key, module: q.module_slug }, extra));
            }
            inc(byDifficulty, q.difficulty);
            if (!q.is_correct && q.error_pattern) {
                errorPatterns[q.error_pattern] = (errorPatterns[q.error_pattern] || 0) + 1;
            }
        });

        /* Per-dimension coverage.
         *
         * A test may know some dimensions for every question but others only for
         * the questions it got wrong. Manual entry is the normal case: the user
         * marks which questions they missed (so the module is known for all 98)
         * but only classifies the misses (so skill/domain/difficulty are known
         * for those 9 alone).
         *
         * Counting that test's 9 classified questions as its whole sample would
         * report "Easy: 0/1" and drag every accuracy rate toward zero. So a test
         * only enters an accuracy denominator for a dimension it has classified
         * end to end; otherwise it contributes its misses and nothing else.
         * Legacy records store misses only, so they never cover anything. */
        const coverage = {
            module:     hasDetail,
            skill:      hasDetail && qs.every(q => !!q.skill_key),
            domain:     hasDetail && qs.every(q => !!q.domain),
            difficulty: hasDetail && qs.every(q => !!q.difficulty)
        };

        const missed = qs.filter(q => !q.is_correct).map(q => ({
            num:     q.question_number,
            section: q.module_slug,
            skill:   (T.skill(q.skill_key) || {}).label || q.skill || 'Unspecified',
            skillKey: q.skill_key,
            domain:  q.domain || null,
            difficulty: q.difficulty || null,
            errorPattern: q.error_pattern || null
        }));

        return {
            /* legacy shape — every existing chart reads these */
            id:              record.app.id,
            date:            record.app.date,
            rwScore:         meta.scores.rw ?? 0,
            mathScore:       meta.scores.math ?? 0,
            missedQuestions: missed,
            timeLeft:        record.app.time_left_seconds || {},
            linkedSessionId: record.app.linked_session_id || null,

            /* new aggregates */
            testName:   meta.test_name,
            sourceName: meta.source_name,
            testFormat: meta.test_format,
            /* A section-only test has no 1600 score. Charts that plot totals
             * over time filter on this so a 20-question math drill doesn't
             * read as a catastrophic score drop next to a full test. */
            isFullTest: meta.test_format === 'full_test',
            inputMode:  record.app.input_mode,
            scoresEstimated: !!meta.scores.estimated,
            rawScores:  meta.scores.raw,
            totalQuestions: hasDetail ? qs.length : null,
            correctCount:   hasDetail ? qs.filter(q => q.is_correct).length : null,
            accuracy:       hasDetail && qs.length ? qs.filter(q => q.is_correct).length / qs.length : null,
            byModule, byDomain, bySkill, bySkillModule, byDifficulty, errorPatterns,
            coverage, hasDetail,
            updatedAt: record.app.updated_at
        };
    }

    /* ══════════════════════════════════════════════════════════
       Persistence
    ══════════════════════════════════════════════════════════ */
    function _docKey(id) { return DOC_PREFIX + id; }

    function getDetailSync(id) {
        try { return JSON.parse(localStorage.getItem(_docKey(id))) || null; } catch { return null; }
    }
    function putDetail(record) {
        try {
            localStorage.setItem(_docKey(record.app.id), JSON.stringify(record));
            return true;
        } catch (e) {
            console.warn('[SAT] could not store test detail locally', e);
            return false;
        }
    }
    function dropDetail(id) { try { localStorage.removeItem(_docKey(id)); } catch {} }

    /* ── Firestore (per-test documents) ── */
    function _testsCol() {
        const s = SAT_STORAGE._firestore && SAT_STORAGE._firestore();
        if (!s || !s.db || !s.uid) return null;
        return s.db.collection('users').doc(s.uid).collection('tests');
    }
    async function _pushDoc(record) {
        const col = _testsCol();
        if (!col) return;
        try {
            await col.doc(record.app.id).set({ record, updatedAt: record.app.updated_at });
        } catch (e) { console.warn('[SAT] test doc push failed', e); }
    }
    async function _deleteDoc(id) {
        const col = _testsCol();
        if (!col) return;
        try { await col.doc(id).delete(); } catch (e) { console.warn('[SAT] test doc delete failed', e); }
    }
    /* Fetch any detail document we're missing locally, or whose cloud copy is
     * newer. Fires sat:testsynced so open charts re-render. */
    async function pullDetails() {
        const col = _testsCol();
        if (!col) return;
        const summaries = await SAT_STORAGE.getTests();
        let changed = false;
        for (const s of summaries) {
            const local = getDetailSync(s.id);
            if (local && local.app && local.app.updated_at >= (s.updatedAt || '')) continue;
            try {
                const snap = await col.doc(s.id).get();
                if (!snap.exists) continue;
                const rec = snap.data().record;
                if (rec) { putDetail(normalize(rec, { id: s.id })); changed = true; }
            } catch (e) { console.warn('[SAT] test doc pull failed', s.id, e); }
        }
        if (changed) window.dispatchEvent(new CustomEvent('sat:testsynced'));
    }

    /* ══════════════════════════════════════════════════════════
       Public API
    ══════════════════════════════════════════════════════════ */

    /* Summaries. Any legacy test found in storage is upgraded in place on
     * first read, so old data keeps rendering and gains the new fields. */
    async function getSummaries() {
        const stored = await SAT_STORAGE.getTests();
        let rewrite = false;

        const out = stored.map(t => {
            if (t && t.byModule && t.coverage) return t;   // already a current summary
            const detail = t && t.id ? getDetailSync(t.id) : null;
            const record = detail || fromLegacy(t || {});
            if (!detail) { putDetail(record); }
            rewrite = true;
            return toSummary(record);
        });

        if (rewrite) { await SAT_STORAGE.saveTests(out); }
        return out.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    async function save(record) {
        const rec = normalize(record, { id: record.app && record.app.id });
        putDetail(rec);
        const summary = toSummary(rec);

        const all = await SAT_STORAGE.getTests();
        const ix  = all.findIndex(t => t.id === summary.id);
        if (ix >= 0) all[ix] = summary; else all.push(summary);
        await SAT_STORAGE.saveTests(all);

        _pushDoc(rec);
        return summary;
    }

    async function remove(id) {
        const all = (await SAT_STORAGE.getTests()).filter(t => t.id !== id);
        await SAT_STORAGE.saveTests(all);
        dropDetail(id);
        _deleteDoc(id);
    }

    /* Drop every test: summaries, detail documents, and cloud copies. Used by
     * a replace-mode import, which would otherwise leave the old detail
     * documents orphaned in localStorage after their summaries are gone. */
    async function clearAll() {
        const all = await SAT_STORAGE.getTests();
        await SAT_STORAGE.saveTests([]);
        for (const t of all) {
            if (!t || !t.id) continue;
            dropDetail(t.id);
            _deleteDoc(t.id);
        }
        // Sweep any detail document whose summary had already gone missing.
        Object.keys(localStorage)
            .filter(k => k.startsWith(DOC_PREFIX))
            .forEach(k => { try { localStorage.removeItem(k); } catch {} });
    }

    async function getDetail(id) {
        const local = getDetailSync(id);
        if (local) return local;
        const col = _testsCol();
        if (!col) return null;
        try {
            const snap = await col.doc(id).get();
            if (!snap.exists) return null;
            const rec = normalize(snap.data().record, { id });
            putDetail(rec);
            return rec;
        } catch { return null; }
    }

    /* All detail records available locally, for the summaries given. */
    function detailsFor(summaries) {
        return summaries.map(s => getDetailSync(s.id)).filter(Boolean);
    }

    /* ══════════════════════════════════════════════════════════
       Selectors — every chart reads through these
    ══════════════════════════════════════════════════════════ */

    /* Legacy summaries predate the coverage flags; treat them as covering
     * nothing so they can only ever contribute misses. */
    function covers(summary, dim) {
        return !!(summary.coverage && summary.coverage[dim]);
    }

    /* Per-skill attempts / misses across a set of summaries.
     *
     * `missed` counts every test. `attempted`/`correct`/`accuracy` count only
     * tests that classified the skill of every question, so a history mixing
     * AI imports with manual entries never reports a misleading rate.
     * `ratedTests` says how many tests backed the rate, so the UI can be honest
     * about it. */
    function skillStats(summaries, { section = null, module = null } = {}) {
        const out = {};
        const touch = (key, label, sec, domain) => {
            if (!out[key]) out[key] = {
                key, label, section: sec, domain,
                attempted: 0, correct: 0, missed: 0, tests: 0, ratedTests: 0
            };
            return out[key];
        };

        summaries.forEach(s => {
            const src = module ? (s.bySkillModule || {}) : (s.bySkill || {});
            const rated = covers(s, 'skill');

            for (const v of Object.values(src)) {
                if (module  && v.module  !== module)  continue;
                if (section && v.section !== section) continue;
                const key = v.skillKey || T.skillKey(v.label) || v.label;
                const e = touch(key, v.label, v.section, v.domain);
                e.missed += v.total - v.correct;
                e.tests++;
                if (rated) { e.attempted += v.total; e.correct += v.correct; e.ratedTests++; }
            }
        });

        return Object.values(out)
            .map(e => ({ ...e, accuracy: e.attempted ? e.correct / e.attempted : null }))
            .sort((a, b) => b.missed - a.missed || (a.accuracy ?? 1) - (b.accuracy ?? 1));
    }

    /* Shared shape for the domain / module / difficulty rollups. */
    function bucketStats(summaries, field, dim) {
        const out = {};
        summaries.forEach(s => {
            const rated = covers(s, dim);
            for (const [key, v] of Object.entries(s[field] || {})) {
                if (!out[key]) out[key] = { key, total: 0, correct: 0, missed: 0, ratedTests: 0, tests: 0 };
                const e = out[key];
                e.missed += v.total - v.correct;
                e.tests++;
                if (rated) { e.total += v.total; e.correct += v.correct; e.ratedTests++; }
            }
        });
        return Object.values(out).map(e => ({
            ...e, accuracy: e.total ? e.correct / e.total : null
        }));
    }

    /* Lowest accuracy first, with unrated rows (no denominator) last. */
    function byWeakest(a, b) {
        if (a.accuracy == null && b.accuracy == null) return b.missed - a.missed;
        if (a.accuracy == null) return 1;
        if (b.accuracy == null) return -1;
        return a.accuracy - b.accuracy;
    }

    const domainStats = s => bucketStats(s, 'byDomain', 'domain').sort(byWeakest);
    const moduleStats = s => {
        const order = Object.fromEntries(T.MODULES.map((m, i) => [m.slug, i]));
        return bucketStats(s, 'byModule', 'module')
            .sort((a, b) => (order[a.key] ?? 9) - (order[b.key] ?? 9));
    };
    const difficultyStats = (s) => {
        const order = { Easy: 0, Medium: 1, Hard: 2 };
        return bucketStats(s, 'byDifficulty', 'difficulty')
            .filter(e => e.key in order)
            .sort((a, b) => order[a.key] - order[b.key]);
    };

    function errorPatternStats(summaries) {
        const out = {};
        summaries.forEach(s => {
            for (const [k, n] of Object.entries(s.errorPatterns || {})) out[k] = (out[k] || 0) + n;
            if (!s.errorPatterns || !Object.keys(s.errorPatterns).length) {
                (s.missedQuestions || []).forEach(q => {
                    if (q.errorPattern) out[q.errorPattern] = (out[q.errorPattern] || 0) + 1;
                });
            }
        });
        return Object.entries(out)
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count);
    }

    /* Per-test accuracy for one skill, oldest → newest. Used by the skill-trend
     * chart; falls back to miss counts for tests without detail. */
    function skillTrend(summaries, skillKey) {
        return [...summaries]
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map(s => {
                const v     = (s.bySkill || {})[skillKey];
                const rated = covers(s, 'skill');
                const missed = (s.missedQuestions || []).filter(q => {
                    const e = T.resolve(q.skill, q.domain);
                    return e && e.key === skillKey;
                }).length;
                return {
                    id: s.id, date: s.date, testName: s.testName,
                    attempted: rated && v ? v.total   : null,
                    correct:   rated && v ? v.correct : null,
                    missed:    v ? v.total - v.correct : missed,
                    accuracy:  rated && v && v.total ? v.correct / v.total : null
                };
            });
    }

    /* How a summary's score should be written. A full test scores out of 1600;
     * a section-only test scores out of 800 and says which section, rather than
     * padding the missing half with a zero. */
    function scoreLabel(summary) {
        const est = summary.scoresEstimated ? '~' : '';
        if (summary.testFormat === 'rw_only')
            return { value: `${est}${summary.rwScore}`, denom: '/ 800', note: 'R&W only' };
        if (summary.testFormat === 'math_only')
            return { value: `${est}${summary.mathScore}`, denom: '/ 800', note: 'Math only' };
        return { value: `${est}${summary.rwScore + summary.mathScore}`, denom: '/ 1600', note: null };
    }

    return {
        SCHEMA, CURVE,
        normalize, validate, toSummary, estimateScaled, scoreLabel,
        fromLegacy, toDateISO, toDateOnly, newId,

        getSummaries, getDetail, getDetailSync, detailsFor, save, remove, clearAll,
        pullDetails,

        skillStats, domainStats, moduleStats, difficultyStats,
        errorPatternStats, skillTrend
    };
})();

/* Pull detail documents whenever the summary layer syncs from the cloud. */
window.addEventListener('sat:synced', () => { SAT_TESTS.pullDetails(); });
