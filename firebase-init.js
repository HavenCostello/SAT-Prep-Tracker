(function () {
    if (typeof firebase === 'undefined' || typeof FIREBASE_CONFIG === 'undefined') return;
    if (Object.values(FIREBASE_CONFIG).some(v => String(v).startsWith('REPLACE_'))) return;

    try {
        firebase.initializeApp(FIREBASE_CONFIG);
    } catch (e) {
        if (e.code !== 'app/duplicate-app') return;
    }

    const db = firebase.firestore();

    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            SAT_STORAGE._connect(db, user.uid);
        } else {
            SAT_STORAGE._disconnect();
        }
        window.dispatchEvent(new CustomEvent('sat:authchange', { detail: { user } }));
    });
})();
