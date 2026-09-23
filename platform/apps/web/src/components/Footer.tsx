import { ExternalLink } from "lucide-react";
import { REPO_URL, chain, explorerUrl } from "@/lib/chain";
import { short } from "@/lib/utils";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 font-mono text-xs text-muted">
        <div className="flex items-center gap-2">
          <Logo className="size-4" />
          desc
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <ProgramLink label="escrow" id={chain().escrowProgramId} />
          <ProgramLink label="moderation" id={chain().moderationProgramId} />
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-ink">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

function ProgramLink({ label, id }: { label: string; id: string }) {
  return (
    <a href={explorerUrl(id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
      {label} <span className="text-accent-2">{short(id)}</span>
      <ExternalLink className="size-3" />
    </a>
  );
}
