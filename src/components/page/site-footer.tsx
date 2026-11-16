import Link from "next/link";
import { formatTehranDateTime } from "@/lib/dates";

export function SiteFooter({ lastUpdated }: { lastUpdated: Date | null }) {
  return (
    <footer className="mt-4 border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-muted-foreground">
        <p>
          Last updated:{" "}
          <span className="font-medium text-foreground">
            {lastUpdated ? formatTehranDateTime(lastUpdated) : "nothing yet"}
          </span>
          {lastUpdated ? " (Tehran time)" : ""}
        </p>
        <nav aria-label="More" className="flex flex-wrap gap-x-5 gap-y-1">
          <a href="#agents" className="font-medium text-primary underline underline-offset-4">
            Connect an agent
          </a>
          <Link href="/docs" className="font-medium text-primary underline underline-offset-4">
            Guide your agent
          </Link>
          <Link href="/admin"className="font-medium text-primary underline underline-offset-4">
            Admin
          </Link>
        </nav>
      </div>
    </footer>
  );
}
