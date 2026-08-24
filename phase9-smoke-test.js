const fs = require('fs');
const html = fs.readFileSync('index(9).html','utf8');
const checks = [
  ['Supabase SDK', /@supabase\/supabase-js@2/],
  ['Supabase client', /supabase-init\.js/],
  ['Compatibility bridge', /supabase-firebase-compat\.js/],
  ['Google OAuth', /signInWithOAuth\(\{\s*provider:\s*['"]google/],
  ['No Firebase CDN', !/gstatic\.com\/firebase|firebase-app-compat|firebase-firestore-compat|firebase-auth-compat|firebase-messaging-compat/.test(html)]
];
let failed=0; for(const [name,test] of checks){const ok=typeof test==='boolean'?test:test.test(html); console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed++;}
process.exitCode=failed?1:0;
