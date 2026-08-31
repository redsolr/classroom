import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * THE AGENT DOOR — `POST /mcp`.
 *
 * What is worth protecting here is not that the tools work; it is that
 * they cannot be reached by anyone who should not reach them. This is a
 * PUBLIC endpoint that writes rows — it can put a student on a roster
 * and a lesson on a calendar — so the tests that matter are the refusals.
 *
 * The token is supplied by `playwright.config.ts` for the mocked tier, so
 * these run without any founder credential.
 */

const TOKEN = "e2e-mcp-token";

async function rpc(
  request: APIRequestContext,
  body: unknown,
  bearer?: string,
) {
  return request.post("/mcp", {
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    data: body,
    failOnStatusCode: false,
  });
}

/** The transport streams; the payload is the last SSE data line. */
function parse(text: string): Record<string, unknown> {
  const line = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .pop();
  return JSON.parse((line ?? text).replace(/^data: /, "")) as Record<
    string,
    unknown
  >;
}

test("an anonymous caller cannot reach the agent door", async ({ request }) => {
  const res = await rpc(request, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  });
  expect(res.status()).toBe(401);
});

test("a wrong bearer cannot reach the agent door", async ({ request }) => {
  const res = await rpc(
    request,
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    "not-the-token",
  );
  expect(res.status()).toBe(401);
});

test("a bearer of the right length but wrong bytes is still refused", async ({
  request,
}) => {
  // The comparison is length-then-bytes; a same-length impostor is the
  // case a sloppy check would let through.
  const res = await rpc(
    request,
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    "x".repeat(TOKEN.length),
  );
  expect(res.status()).toBe(401);
});

test("the token opens the door, and only to the tools we meant", async ({
  request,
}) => {
  const res = await rpc(
    request,
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    TOKEN,
  );
  expect(res.status()).toBe(200);

  const body = parse(await res.text());
  const result = body.result as { tools: { name: string }[] };
  const names = result.tools.map((t) => t.name).sort();
  // An exact list, not a subset: a tool appearing here that nobody
  // reviewed is exactly the thing this assertion is for.
  expect(names).toEqual([
    "create_student",
    "list_lessons",
    "list_students",
    "schedule_lesson",
    "whoami",
  ]);
});

test("the token cannot act as a teacher outside the allowlist", async ({
  request,
}) => {
  const res = await rpc(
    request,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "list_students",
        arguments: { teacherEmail: "stranger@example.com" },
      },
    },
    TOKEN,
  );
  expect(res.status()).toBe(200);

  // The refusal arrives as a tool error, not an HTTP one — and it must
  // name the env var, because the only correct fix is to widen it
  // deliberately.
  const text = await res.text();
  expect(text).toContain("CLASSROOM_MCP_TEACHER_EMAILS");
  expect(text).not.toContain("stranger@example.com\",\"students\"");
});
