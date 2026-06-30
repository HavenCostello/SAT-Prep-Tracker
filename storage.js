/* SAT Prep — storage
 * Primary store: localStorage (instant, always available).
 * Cloud sync:    Firestore when signed in via firebase-init.js.
 *                Writes push to cloud in the background.
 *                On sign-in, cloud data merges into localStorage and
 *                a 'sat:synced' event fires so pages can re-render.
 */
const SAT_STORAGE = (() => {
    const LS_KEY       = 'sat_prep_sessions';
    const LS_TESTS_KEY = 'sat_prep_tests';

    let _db  = null;
    let _uid = null;

    // ── localStorage ──
    function _lsGet()       { try { return JSON.parse(localStorage.getItem(LS_KEY))       || []; } catch { return []; } }
    function _lsSet(s)      { localStorage.setItem(LS_KEY,       JSON.stringify(s)); }
    function _lsGetTests()  { try { return JSON.parse(localStorage.getItem(LS_TESTS_KEY)) || []; } catch { return []; } }
    function _lsSetTests(t) { localStorage.setItem(LS_TESTS_KEY, JSON.stringify(t)); }
    function _merge(a, b)   { const m = {}; [...a, ...b].forEach(x => { m[x.id] = x; }); return Object.values(m); }

    // ── Firestore ──
    function _ref() {
        return _db && _uid ? _db.collection('users').doc(_uid).collection('data').doc('main') : null;
    }

    async function _push(sessions, tests) {
        const ref = _ref();
        if (!ref) return;
        try {
            await ref.set({
                sessions,
                tests,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.warn('[SAT] cloud push failed', e);
        }
    }

    async function _pull() {
        const ref = _ref();
        if (!ref) return;
        try {
            const snap = await ref.get();
            if (!snap.exists) {
                await _push(_lsGet(), _lsGetTests());
                window.dispatchEvent(new CustomEvent('sat:synced', { detail: { source: 'seed' } }));
                return;
            }
            const { sessions = [], tests = [] } = snap.data();
            const mergedS = _merge(_lsGet(), sessions);
            const mergedT = _merge(_lsGetTests(), tests);
            _lsSet(mergedS);
            _lsSetTests(mergedT);
            window.dispatchEvent(new CustomEvent('sat:synced', { detail: { source: 'pull' } }));
        } catch (e) {
            console.warn('[SAT] cloud pull failed', e);
        }
    }

    return {
        _connect(db, uid) { _db = db; _uid = uid; _pull(); },
        _disconnect()     { _db = null; _uid = null; },
        isConnected()     { return !!(_db && _uid); },
        manualSync()      { return _pull(); },

        async getSessions()          { return _lsGet(); },
        async getTests()             { return _lsGetTests(); },
        async saveSessions(sessions) { _lsSet(sessions); _push(sessions, _lsGetTests()); },
        async saveTests(tests)       { _lsSetTests(tests); _push(_lsGet(), tests); },
    };
})();
