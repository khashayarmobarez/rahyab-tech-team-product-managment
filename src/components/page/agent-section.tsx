import { BotIcon } from "lucide-react";
import { AgentGuide } from "./agent-guide";

/** Section 5 on the main page: the guide for connecting an agent, folded away until someone needs it. */
export function AgentSection({ origin }: { origin: string }) {
  return (
    <section id="agents" aria-labelledby="agents-title">
      <details className="group rounded-2xl border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-start gap-3">
            <BotIcon aria-hidden className="mt-1 size-5 shrink-0" />
            <span className="grid gap-0.5">
              <span id="agents-title" className="text-xl font-semibold tracking-tight">
                Connect an agent
              </span>
              <span className="text-muted-foreground">
                Let an AI assistant read the reports and add to them. Step-by-step guide.
              </span>
            </span>
          </span>
          <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="border-t p-5">
          <AgentGuide origin={origin} audience="team" />
        </div>
      </details>
    </section>
  );
}
