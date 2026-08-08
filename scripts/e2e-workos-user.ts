/**
 * Provision the synthetic WorkOS teacher the real-auth e2e tier signs in
 * as — the class-room sibling of the crm repo's E2E_WORKOS_* users.
 *
 *   npm run e2e:user        (tsx --env-file=.env.local)
 *
 * Idempotent: finds-or-creates the user by E2E_TEACHER_EMAIL, forces the
 * password to E2E_TEACHER_PASSWORD, marks the email verified (no real
 * mailbox exists — verification rides the API, never a code email), then
 * proves the credentials with a real authenticateWithPassword call. When
 * the E2E_TEACHER_* vars are missing it generates them and APPENDS them
 * to .env.local so the next `npm run test:e2e:real-auth` just works.
 *
 * The user lands in whatever WorkOS environment WORKOS_API_KEY points at
 * (today: the Jurisimus TEST environment class-room borrows — see
 * platform docs/project/classroom/overview.md § Shared-infrastructure
 * boundaries). No real mailbox, no personal data.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WorkOS } from "@workos-inc/node";

const apiKey = process.env.WORKOS_API_KEY;
const clientId = process.env.WORKOS_CLIENT_ID;
if (!apiKey || !clientId) {
  console.error(
    "WORKOS_API_KEY / WORKOS_CLIENT_ID missing — run via `npm run e2e:user` " +
      "so .env.local is loaded.",
  );
  process.exit(1);
}

const email = process.env.E2E_TEACHER_EMAIL ?? "e2e-teacher@class-room.dev";
let password = process.env.E2E_TEACHER_PASSWORD;
const generated = !password;
if (!password) {
  // 24 base64url chars ≈ 144 bits — comfortably past WorkOS's strength bar.
  password = `E2e-${randomBytes(18).toString("base64url")}`;
}

const workos = new WorkOS(apiKey, { clientId });

async function main(): Promise<void> {
  const { data } = await workos.userManagement.listUsers({ email });
  let userId: string;

  if (data.length === 0) {
    const created = await workos.userManagement.createUser({
      email,
      password,
      emailVerified: true,
      firstName: "E2E",
      lastName: "Teacher",
    });
    userId = created.id;
    console.log(`created ${email} (${userId})`);
  } else {
    userId = data[0].id;
    await workos.userManagement.updateUser({
      userId,
      password,
      emailVerified: true,
    });
    console.log(`updated ${email} (${userId}) — password reset, email verified`);
  }

  // Prove the credentials the way the login action will use them.
  await workos.userManagement.authenticateWithPassword({
    clientId: clientId as string,
    email,
    password: password as string,
  });
  console.log("authenticateWithPassword OK — credentials are live");

  if (generated) {
    const envPath = join(process.cwd(), ".env.local");
    if (!existsSync(envPath)) {
      console.error(
        `.env.local not found at ${envPath} — add these yourself:\n` +
          `E2E_TEACHER_EMAIL=${email}\nE2E_TEACHER_PASSWORD=${password}`,
      );
      process.exit(1);
    }
    appendFileSync(
      envPath,
      `\n# Synthetic real-auth e2e teacher (scripts/e2e-workos-user.ts)\n` +
        `E2E_TEACHER_EMAIL=${email}\nE2E_TEACHER_PASSWORD=${password}\n`,
      "utf8",
    );
    console.log("appended E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD to .env.local");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("e2e user provisioning failed:", err);
  process.exit(1);
});
