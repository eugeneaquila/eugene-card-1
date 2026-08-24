from pathlib import Path
import re

p = Path('index.html')
s = p.read_text(encoding='utf-8')

# Remove Firebase SDK loading and load the Supabase bridge instead.
s, n = re.subn(
    r'\s*<!-- Google Firebase Compatibility SDKs \(v10\.7\.1\) -->.*?<script src="https://www\.gstatic\.com/firebasejs/10\.7\.1/firebase-analytics-compat\.js"></script>',
    '''\n  <!-- Supabase Authentication + database (Firebase removed) -->\n  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n  <script src="./js/supabase-init.js"></script>\n  <script src="./js/supabase-firebase-compat.js"></script>''',
    s, count=1, flags=re.S
)
if n != 1:
    raise SystemExit('Firebase SDK block not found')

# Replace the legacy Firebase initialization with the Supabase bridge globals.
s, n = re.subn(
    r'\s*const firebaseConfig = \{.*?\n\s*const analytics = firebase\.analytics\(\);',
    '''\n    const db = window.db;\n    const auth = window.auth;\n    const analytics = null;\n    if (!db || !auth || !window.supabaseClient) {\n      throw new Error('Supabase failed to initialize. Check js/supabase-init.js and Supabase configuration.');\n    }''',
    s, count=1, flags=re.S
)
if n != 1:
    raise SystemExit('Firebase initialization block not found')

# Google login now goes through Supabase OAuth.
s = s.replace(
    'const provider = new firebase.auth.GoogleAuthProvider();\n      try {\n        await auth.signInWithPopup(provider);',
    'try {\n        await auth.signInWithPopup();'
)

# Profiles can be resolved by Supabase auth UUID as well as legacy email key.
s = s.replace(
    'const firestoreProfile = globalRawProfilesData[email];',
    'const firestoreProfile = globalRawProfilesData[email] || globalRawProfilesData[user.id] || globalRawProfilesData[user.uid];'
)

# The old Firebase-only users collection is no longer queried.
users_block = '''      try {\n        const usersSnapshot = await db.collection("users").get();\n        globalRawUsersData = {};\n        usersSnapshot.forEach(doc => {\n          globalRawUsersData[doc.id] = doc.data();\n        });\n      } catch (e) {\n        console.warn('Error loading legacy user profiles:', e);\n      }'''
s = s.replace(users_block, '      globalRawUsersData = {}; // Supabase profiles replace Firebase users collection.')

if 'gstatic.com/firebasejs' in s:
    raise SystemExit('Firebase SDK URL still present')

p.write_text(s, encoding='utf-8')
print('Supabase cutover applied to index.html')
