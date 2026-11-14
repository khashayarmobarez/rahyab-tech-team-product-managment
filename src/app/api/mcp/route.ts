import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { bearerToken, createRateLimiter } from "@/lib/agent-access";
import { databaseProblem } from "@/lib/db-errors";
import { createMcpServer } from "@/server/mcp";
import { authenticateApiToken } from "@/server/reports";

/**
 * POST /api/mcp: the MCP endpoint for agents (Streamable HTTP, no sessions).
 * Authentication is a token from /admin, sent as "Authorization: Bearer <token>".
 * Cookies are never used here.
 */

// Wrong or missing tokens: slow down guessing, by caller address.
const failedAttempts = createRateLimiter({ limit: 20, windowMs: 60_000 });
// Valid tokens: stop a runaway agent from hammering the database.
const perToken = createRateLimiter({ limit: 120, windowMs: 60_000 });

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

function callerAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request.headers.get("authorization"));
  const address = callerAddress(request);

  const unauthorized = (message: string) => {
    const limited = failedAttempts.check(address);
    if (!limited.allowed) {
      return jsonRpcError(429, "Too many failed attempts. Wait a minute.", {
        "Retry-After": String(limited.retryAfterSeconds),
      });
    }
    return jsonRpcError(401, message, { "WWW-Authenticate": 'Bearer realm="team-reports"' });
  };

  if (!token) return unauthorized('Missing token. Send "Authorization: Bearer <token>". Tokens are created in /admin.');

  let auth;
  try {
    auth = await authenticateApiToken(token);
  } catch (error) {
    console.error("MCP authentication failed:", error);
    return jsonRpcError(databaseProblem(error) ? 503 : 500, "The server could not check the token. Try again later.");
  }
  if (!auth) return unauthorized("This token is not valid, or it has been revoked.");

  const limited = perToken.check(auth.id);
  if (!limited.allowed) {
    return jsonRpcError(429, "Too many requests from this token. Slow down.", {
      "Retry-After": String(limited.retryAfterSeconds),
    });
  }

  const server = createMcpServer(auth);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // no sessions: every request stands alone
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("MCP request failed:", error);
    return jsonRpcError(500, "The server failed to handle this request.");
  }
}

// This server does not offer a standing event stream or sessions.
function methodNotAllowed(): Response {
  return jsonRpcError(405, "Use POST.", { Allow: "POST" });
}
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
