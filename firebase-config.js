// Firebase project config — fill in from console.firebase.google.com
// Project Settings → Your apps → Web app → SDK setup and configuration → Config
//
// Setup checklist:
//   1. Create a project at console.firebase.google.com
//   2. Authentication → Sign-in method → Enable Google
//   3. Firestore Database → Create database (start in production mode)
//   4. Firestore → Rules → paste and publish:
//        rules_version = '2';
//        service cloud.firestore {
//          match /databases/{database}/documents {
//            match /users/{uid}/data/{doc} {
//              allow read, write: if request.auth != null && request.auth.uid == uid;
//            }
//          }
//        }
//   5. Project Settings → Your apps → Add app (Web) → copy config below
//
// Note: Firebase web config values are safe to commit — security is enforced
// by Firestore rules on the server, not by keeping these values secret.

const FIREBASE_CONFIG = {
    apiKey:            "REPLACE_WITH_YOUR_API_KEY",
    authDomain:        "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
    projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
    storageBucket:     "REPLACE_WITH_YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
    appId:             "REPLACE_WITH_YOUR_APP_ID"
};
