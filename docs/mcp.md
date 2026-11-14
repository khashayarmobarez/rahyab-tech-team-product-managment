# Agent API (MCP)

AI agents read and write Team Reports through an [MCP](https://modelcontextprotocol.io) server on the same site. It uses the same functions as the website, so validation, rules and the audit log are identical.

- **Endpoint:** `POST /api/mcp` (Streamable HTTP, stateless, JSON responses, no sessions).
- **Auth:** `Authorization: Bearer <token>`. Tokens are made in `/admin`. Cookies are never accepted.
- **Code:** `src/app/api/mcp/route.ts` (HTTP and auth), `src/server/mcp.ts` (tools), `src/lib/agent-access.ts` (permissions and limits).

## Connect an agent

1. In `/admin`, create a token. Choose who it belongs to and tick only the permissions the agent needs. Copy it: it is shown once, and only its SHA-256 hash is stored.
2. Give the agent the address and the token. The main page ("Connect an agent" at the bottom) and `/admin` show a guide with your real address and copy buttons.

Claude Code:

```bash
claude mcp add --transport http team-reports https://YOUR-SITE/api/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

Other clients that support MCP over HTTP with custom headers:

```json
{
  "mcpServers": {
    "team-reports": {
      "type": "http",
      "url": "https://YOUR-SITE/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

A client that can only run local programs can use the `mcp-remote` bridge with the same address and header.

Without an agent:

```bash
curl -s -X POST https://YOUR-SITE/api/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Permissions

A token has one or more permissions. The agent only **sees** the tools its token allows.

| Permission | Unlocks |
| --- | --- |
| `reports:read` | `get_week_overview`, `get_daily_reports`, `get_decisions`, `get_weekly_reports` |
| `reports:write` | `save_daily_report` |
| `decisions:write` | `raise_decision` |
| `decisions:answer` | `answer_decision`. Separate because answering is normally the CEO's call. |
| `weekly:write` | `save_weekly_report`, and with `reports:read` the prompt `draft_weekly_summary` |

`whoami` is always available.

## Who a write is for

- A token that **belongs to a person** writes only as that person. Passing a different `person` is refused.
- A **team** token must pass `person` on every write.
- The audit log records the token's owner as the actor and `mcp` as the source.

## Tools

Dates are `YYYY-MM-DD` in Tehran time. All results are JSON in a text block. Problems come back as a tool error (`isError: true`) whose text says what to fix.

### Reading

| Tool | Input | Returns |
| --- | --- | --- |
| `whoami` | none | The token's owner and permissions, today's date, the current week and its due time, the team, and the weekly writing rules. Call this first. |
| `get_week_overview` | `week?` any date in the week (default: current week) | The weekly summary or `null`, a progress summary built from the daily reports, which days each person reported, the daily reports (newest first), and the decisions open or recently answered during that week. |
| `get_daily_reports` | `from`, `to?` (default today), `person?`, `limit?` (1 to 200, default 100) | Daily reports, newest first. At most 92 days per call. |
| `get_decisions` | `status?` `open` (default), `answered` or `all`; `limit?` (default 50) | Decisions. Open ones come oldest first with `daysOpen`. |
| `get_weekly_reports` | `weekStart?` a Saturday; `limit?` (1 to 52, default 8) | One summary, or the most recent summaries. |

### Writing

| Tool | Input | Notes |
| --- | --- | --- |
| `save_daily_report` | `person?`, `reportDate?` (default today), `title`, `summary`, `done[]`, `blockers[]`, `next[]` | **Replaces** the person's report for that date. Send the whole report each time. No future dates. |
| `raise_decision` | `person?`, `title`, `description` | Check `get_decisions` first to avoid duplicates. Dated today. |
| `answer_decision` | `person?`, `decisionId`, `answer` | Only to record an answer a human gave. A decision can be answered once. |
| `save_weekly_report` | `person?`, `weekStart?` (default current week), `oneLine`, `results[]` (1 to 5), `byPerson?` (`khashayar`, `mahan`, `hossein` lines), `notFinished[]`, `label` (`green`, `yellow`, `red`) | **Always saved as a draft.** There is no `done` input. Cannot change a summary a person already marked final. The numbers and the "waiting for a decision" list are computed from real data. |

Field limits are the same as the website forms; see [architecture.md](architecture.md#business-rules). Weekly text is checked for file names and code terms and refused if it has any.

### Prompt

`draft_weekly_summary` (optional `week`): tells the agent to call `get_week_overview`, write the summary from what the reports show and nothing else, follow the writing rules, save it with `save_weekly_report`, and tell the user a person must mark it final.

## Rules for weekly summaries

1. Write for the CEO: plain business language and short sentences.
2. No file names, folder paths or code terms.
3. Never invent results. Only list what the daily reports show is finished and checked. If unsure, put it under `notFinished`.
4. Results are 1 to 5 items. By-person lines are one line each, or empty for "No report this week".
5. Status: green = main goals finished; yellow = important work half done or unverified; red = work is blocked.

## HTTP behaviour

| Status | When |
| --- | --- |
| `200` | Normal MCP responses (including tool errors, which are `isError` results). |
| `401` with `WWW-Authenticate: Bearer` | Missing, unknown or revoked token. |
| `405` with `Allow: POST` | `GET` or `DELETE`. There is no event stream or session. |
| `429` with `Retry-After` | More than 120 requests a minute from one token, or more than 20 failed attempts a minute from one caller address. |
| `503` / `500` | The database could not be reached, or an unexpected failure. |

The rate limits are counted in memory by each server instance. On Vercel they slow a runaway agent but are not a hard global limit.

## Changing it

- **Add a tool:** register it in `createMcpServer` inside the right `can("...")` block, take its input from the shared schemas in `src/lib/schemas.ts`, call a function in `reports.ts`, and throw `Refusal` for permission problems. Add a test in `src/server/mcp.integration.test.ts`.
- **Add a permission:** add it to `TOKEN_SCOPES` and `TOKEN_SCOPE_LABELS` in `src/lib/constants.ts` (the admin form picks it up automatically), then gate the tool on it. Scopes are stored as text, so no migration is needed.
- **Keep it in step with the website:** never put a business rule in `mcp.ts`. Put it in `reports.ts` or the schemas so both doors get it.
