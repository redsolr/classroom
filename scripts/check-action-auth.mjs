/**
 * Server-action authentication ratchet.
 *
 * Every exported function in `src/lib/actions/` is a SERVER ACTION: Next
 * compiles it into a POST endpoint that anyone who knows the action id
 * can call. Nothing above it enforces auth — `proxy.ts` runs
 * `middlewareAuth.enabled:false` by design (custom login UI) — so each
 * action is the only line of defense and must resolve the caller itself.
 *
 * Today all of them do. This script is what keeps that true: it parses
 * the real TypeScript AST (not a grep) and fails when an exported action
 * reaches no auth resolver. Written after the CRM shipped the same class
 * of hole — its `/api/*` routes served anonymous callers for nine days
 * because the discipline lived in prose with nothing enforcing it
 * (crm `src/__tests__/api-auth-coverage.test.ts` is the sibling guard).
 *
 * SCOPE — read this before trusting it: this checks AUTHENTICATION only
 * (did the action establish who is calling). It cannot check
 * AUTHORIZATION scoping — that every query is narrowed to that caller's
 * own rows via `assertStudentOwned` / `assertLessonOwned` / an explicit
 * `teacherId` predicate. That part stays a review responsibility.
 *
 * Run: npm run check:actions
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ACTIONS_DIR = join(process.cwd(), "src", "lib", "actions");

/**
 * Calls that establish WHO is calling. `requireTeacher`/`requireStudent`
 * redirect when there is no session; `requirePortalStudent` (local to
 * portal.ts) resolves the bearer token in the URL to exactly one student
 * and throws otherwise.
 *
 * `getAccount` is deliberately ABSENT: it returns null instead of
 * redirecting, so an action using it could ignore the null and proceed
 * anonymously. If an action ever needs it, this must fail until someone
 * proves the null branch is handled.
 */
const AUTH_RESOLVERS = new Set([
  "requireTeacher",
  "requireStudent",
  "requirePortalStudent",
]);

/**
 * Exported symbols that are not server actions (types, schemas, plain
 * helpers) and legitimately need no resolver. Every entry states why —
 * an unexplained exemption is how a gate quietly stops being a gate.
 */
const EXEMPT = new Map([
  // e.g. ["actions.ts:someHelper", "pure formatter, touches no db"],
]);

function isExported(node) {
  return (
    ts
      .getCombinedModifierFlags(node)
      // eslint-disable-next-line no-bitwise
      & ts.ModifierFlags.Export
  ) !== 0;
}

/** Every function-ish exported declaration, with its name and body. */
function collectExportedFunctions(sourceFile) {
  const found = [];
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && isExported(stmt)) {
      found.push({ name: stmt.name.text, body: stmt.body });
      continue;
    }
    if (ts.isVariableStatement(stmt) && isExported(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
          ts.isIdentifier(decl.name)
        ) {
          found.push({ name: decl.name.text, body: init.body });
        }
      }
    }
  }
  return found;
}

/** Does this subtree call one of the auth resolvers? */
function callsAuthResolver(node) {
  if (!node) return false;
  let hit = false;
  const visit = (n) => {
    if (hit) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;
      if (name && AUTH_RESOLVERS.has(name)) {
        hit = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return hit;
}

const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts"));
if (files.length === 0) {
  console.error(`No action files found in ${ACTIONS_DIR} — did the layout move?`);
  process.exit(1);
}

const violations = [];
let checked = 0;

for (const file of files) {
  const path = join(ACTIONS_DIR, file);
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  for (const fn of collectExportedFunctions(sourceFile)) {
    const key = `${file}:${fn.name}`;
    if (EXEMPT.has(key)) continue;
    checked += 1;
    if (!callsAuthResolver(fn.body)) violations.push(key);
  }
}

if (violations.length > 0) {
  console.error(
    `\n✗ ${violations.length} server action(s) reach no auth resolver:\n`,
  );
  for (const v of violations) console.error(`    ${v}`);
  console.error(
    `\n  Every exported function in src/lib/actions/ is a POST endpoint any\n` +
      `  caller can invoke. Call requireTeacher() / requireStudent() /\n` +
      `  requirePortalStudent() before touching data — and scope the query to\n` +
      `  that caller's own rows. If the export is genuinely not an action,\n` +
      `  add it to EXEMPT in this script WITH a reason.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ ${checked} server actions across ${files.length} files all resolve a caller.`,
);
