/* SAT Prep — storage
 * Primary store: localStorage.
 * Cross-device sync: Export JSON → save to OneDrive → Import JSON on the other device.
 */
const SAT_STORAGE = (() => {
    const LS_KEY       = 'sat_prep_sessions';
    const LS_TESTS_KEY = 'sat_prep_tests';

    function _lsGet() {
        try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
        catch { return []; }
    }
    function _lsSet(sessions) {
        localStorage.setItem(LS_KEY, JSON.stringify(sessions));
    }
    function _lsGetTests() {
        try { return JSON.parse(localStorage.getItem(LS_TESTS_KEY)) || []; }
        catch { return []; }
    }
    function _lsSetTests(tests) {
        localStorage.setItem(LS_TESTS_KEY, JSON.stringify(tests));
    }
    function _merge(a, b) {
        const m = {};
        [...a, ...b].forEach(s => { m[s.id] = s; });
        return Object.values(m);
    }

    return {
        async getSessions()          { return _lsGet(); },
        async saveSessions(sessions) { _lsSet(sessions); },
        async getTests()             { return _lsGetTests(); },
        async saveTests(tests)       { _lsSetTests(tests); },

        /* Save current sessions to a JSON file the user picks. */
        async exportSessions() {
            const data = JSON.stringify(_lsGet(), null, 2);

            if (typeof window.showSaveFilePicker === 'function') {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: 'sat-prep-sessions.json',
                        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(data);
                    await writable.close();
                    return;
                } catch (e) {
                    if (e.name === 'AbortError') return; // user cancelled
                }
            }

            // Fallback for browsers without showSaveFilePicker
            const blob = new Blob([data], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = Object.assign(document.createElement('a'), {
                href: url, download: 'sat-prep-sessions.json'
            });
            a.click();
            URL.revokeObjectURL(url);
        },

        /* Read a File object, merge its sessions with current data, persist.
         * Returns the number of sessions after merging. */
        async importSessions(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        const imported = JSON.parse(e.target.result);
                        if (!Array.isArray(imported)) throw new Error('Not a session array');
                        const merged = _merge(_lsGet(), imported);
                        _lsSet(merged);
                        resolve(merged.length);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = () => reject(new Error('Could not read file'));
                reader.readAsText(file);
            });
        }
    };
})();
