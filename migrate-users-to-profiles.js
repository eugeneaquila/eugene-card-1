#!/usr/bin/env node
/**
 * migrate-users-to-profiles.js
 * ------------------------------------------------------------------
 * ONE-TIME BACKFILL for Eugene Card.
 *
 * Merges the legacy "users" Firestore collection (keyed by Firebase Auth
 * uid; fields: displayName / avatar / bio / instagram / tiktok / username /
 * website) into the "profiles" collection (keyed by email; fields: name /
 * avatarUrl / bio / socialIg / socialTiktok / socialWeb / socialTwitter /
 * username / isPlusMember / uid) that the app actually reads from.
 *
 * WHY THIS NEEDS THE ADMIN SDK: "users" docs don't store an email, only a
 * uid, so the client-side sync already shipped in index.html can only adopt
 * a legacy "users" doc for someone once THEY personally log back in (at
 * which point it knows both their uid and email). This script does the same
 * merge for every account at once, using auth().listUsers() to resolve
 * uid -> email for people who haven't logged back in yet.
 *
 * WHAT IT DOES, PER "users/{uid}" DOC:
 *   1. Look up that uid in Firebase Auth to get its email.
 *      - Not found (e.g. a deleted account) -> SKIPPED, logged at the end.
 *   2. Find the matching "profiles" doc, in order of preference:
 *        a) profiles/{email}, if it exists
 *        b) any existing profiles doc with the same username
 *        c) none -> a new profiles/{email} doc will be created
 *   3. Merge fields: existing "profiles" values always win. Only fields
 *      that are empty/missing on the profiles side get filled in from the
 *      legacy "users" doc, so nothing anyone deliberately edited gets
 *      overwritten.
 *   4. Write the merged result to both "profiles/{targetDocId}" (including
 *      a "uid" field, so index.html's own sync logic keeps the two records
 *      linked from now on) and "users/{uid}" (so both collections match).
 *
 * SAFE BY DEFAULT: running with no flags only PRINTS a plan — it writes
 * nothing. Pass --apply to actually commit the changes.
 *
 * SETUP:
 *   1. npm install firebase-admin
 *   2. Get a service account key: Firebase Console -> Project Settings ->
 *      Service Accounts -> Generate new private key. Save the JSON file
 *      somewhere local. Do NOT commit it to git or share it.
 *   3. Preview first:
 *        node migrate-users-to-profiles.js --service-account=./key.json
 *      Then actually write:
 *        node migrate-users-to-profiles.js --service-account=./key.json --apply
 *      (Alternatively, set GOOGLE_APPLICATION_CREDENTIALS=./key.json in your
 *      environment and omit --service-account.)
 * ------------------------------------------------------------------
 */

const path = require('path');

function parseArgs(argv) {
  const args = { apply: false, serviceAccount: null };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg.startsWith('--service-account=')) args.serviceAccount = arg.split('=')[1];
  }
  return args;
}

// Mirrors mapUsersDocToProfileShape() / mapProfileToUsersDocShape() in
// index.html — keep these in sync if that field mapping ever changes.
function mapUsersDocToProfileShape(u) {
  if (!u) return null;
  return {
    name: u.displayName || u.name || '',
    username: u.username || '',
    avatarUrl: u.avatar || u.avatarUrl || '',
    bio: u.bio || '',
    isPlusMember: !!u.isPlusMember,
    socialIg: u.instagram || u.socialIg || '',
    socialTwitter: u.twitter || u.socialTwitter || '',
    socialTiktok: u.tiktok || u.socialTiktok || '',
    socialWeb: u.website || u.socialWeb || ''
  };
}

function mapProfileToUsersDocShape(p) {
  if (!p) return null;
  return {
    displayName: p.name || '',
    username: p.username || '',
    avatar: p.avatarUrl || '',
    bio: p.bio || '',
    instagram: p.socialIg || '',
    tiktok: p.socialTiktok || '',
    website: p.socialWeb || ''
  };
}

// Existing profile field values always win; only fill genuinely empty ones
// in from the legacy "users" doc.
function mergeProfileFields(existing, legacy) {
  const merged = { ...(existing || {}) };
  const legacyMapped = mapUsersDocToProfileShape(legacy);
  for (const key of Object.keys(legacyMapped)) {
    const current = merged[key];
    const isEmpty = current === undefined || current === null || current === '';
    if (isEmpty && legacyMapped[key] !== '' && legacyMapped[key] !== undefined) {
      merged[key] = legacyMapped[key];
    }
  }
  return merged;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const admin = require('firebase-admin');
  if (args.serviceAccount) {
    const serviceAccount = require(path.resolve(args.serviceAccount));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  const db = admin.firestore();

  console.log(args.apply
    ? '=== APPLY MODE: writes will be committed ==='
    : '=== DRY RUN: no writes will be made (pass --apply to commit) ===');

  // 1. Build uid -> email map from Firebase Auth (paginated, 1000/page).
  console.log('\nFetching all Auth users...');
  const uidToEmail = {};
  let nextPageToken;
  let authUserCount = 0;
  do {
    const page = await admin.auth().listUsers(1000, nextPageToken);
    page.users.forEach(u => {
      authUserCount++;
      if (u.email) uidToEmail[u.uid] = u.email.toLowerCase();
    });
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  console.log(`Found ${authUserCount} Auth users (${Object.keys(uidToEmail).length} with an email).`);

  // 2. Load existing "profiles" docs so we can match by email or username.
  console.log('\nLoading existing "profiles" collection...');
  const profilesSnapshot = await db.collection('profiles').get();
  const profilesByEmail = {};    // lowercased docId(email) -> {docId, data}
  const profilesByUsername = {}; // lowercased username -> {docId, data}
  profilesSnapshot.forEach(doc => {
    const data = doc.data();
    profilesByEmail[doc.id.toLowerCase()] = { docId: doc.id, data };
    if (data.username) profilesByUsername[data.username.toLowerCase()] = { docId: doc.id, data };
  });
  console.log(`Found ${profilesSnapshot.size} existing profile docs.`);

  // 3. Walk every legacy "users" doc and figure out what to do with it.
  console.log('\nLoading legacy "users" collection...');
  const usersSnapshot = await db.collection('users').get();
  console.log(`Found ${usersSnapshot.size} legacy user docs.\n`);

  const plan = [];    // { uid, email, targetDocId, action, mergedProfile }
  const skipped = [];

  usersSnapshot.forEach(doc => {
    const uid = doc.id;
    const legacyData = doc.data();
    const email = uidToEmail[uid];

    if (!email) {
      skipped.push({
        uid,
        username: legacyData.username || legacyData.displayName || '(unknown)',
        reason: 'No matching Firebase Auth user (account may have been deleted)'
      });
      return;
    }

    const existingByEmail = profilesByEmail[email];
    const existingByUsername = legacyData.username ? profilesByUsername[legacyData.username.toLowerCase()] : null;
    const target = existingByEmail || existingByUsername || null;

    const mergedProfile = mergeProfileFields(target ? target.data : null, legacyData);
    mergedProfile.uid = uid;

    plan.push({
      uid,
      email,
      targetDocId: target ? target.docId : email,
      action: target ? 'merge into existing profile' : 'create new profile',
      mergedProfile
    });
  });

  // 4. Print the plan.
  console.log(`--- Plan: ${plan.length} account(s) to sync, ${skipped.length} skipped ---\n`);
  plan.forEach(p => {
    console.log(`[${p.action}] users/${p.uid}  ->  profiles/${p.targetDocId}  (${p.mergedProfile.name || '(no name)'} / @${p.mergedProfile.username || '\u2014'})`);
  });
  if (skipped.length) {
    console.log(`\nSkipped (no Auth email found):`);
    skipped.forEach(s => console.log(`  users/${s.uid}  (@${s.username}) \u2014 ${s.reason}`));
  }

  if (!args.apply) {
    console.log('\nDry run complete. Re-run with --apply to write these changes.');
    return;
  }

  // 5. Commit writes.
  console.log('\nApplying changes...');
  let written = 0;
  for (const p of plan) {
    const batch = db.batch();
    batch.set(db.collection('profiles').doc(p.targetDocId), p.mergedProfile, { merge: true });
    batch.set(db.collection('users').doc(p.uid), mapProfileToUsersDocShape(p.mergedProfile), { merge: true });
    await batch.commit();
    written++;
  }
  console.log(`\nDone. ${written} account(s) synced between "profiles" and "users".`);
}

main().catch(err => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
