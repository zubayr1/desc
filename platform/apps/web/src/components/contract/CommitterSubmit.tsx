import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { FileCheck2, FileX2, FolderUp, Loader2 } from "lucide-react";
import type { BundleResult, Contract } from "@repo/shared";
import { buildBundle, encryptToRecipients } from "@repo/shared";
import { api, prepareSignSubmit, uploadDeliverable } from "@/lib/api";
import { fmtSize, toBase64 } from "@/lib/bytes";
import { short } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

/** Committer's deliverable submission: pick a folder → bundle + validate locally →
 *  ENCRYPT to the moderators in-browser → upload ciphertext → submit hash on-chain. */
export function CommitterSubmit({ c, onDone }: { c: Contract; onDone: () => void }) {
  const { signTransaction } = useWallet();
  const [bundle, setBundle] = useState<BundleResult | null>(null);

  const pick = useMutation({
    mutationFn: async (fileList: FileList) => {
      const inputs: { path: string; content: Uint8Array }[] = [];
      for (const file of Array.from(fileList)) {
        if (file.size > 10 * 1024 * 1024) continue; // skip over-cap
        const rel = file.webkitRelativePath || file.name;
        const path = rel.includes("/") ? rel.split("/").slice(1).join("/") : rel;
        inputs.push({ path, content: new Uint8Array(await file.arrayBuffer()) });
      }
      return buildBundle(inputs, { withBlob: true });
    },
    onSuccess: (r) => setBundle(r),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!bundle?.ok || !bundle.blob || !bundle.deliverableHash || !bundle.root) {
        throw new Error("pick a valid folder first");
      }
      // No moderator will ever open this bundle, so don't hand it to them: seal
      // a no-mod deliverable to the initiator alone. Their key is mandatory here
      // — with no moderators, skipping it would seal the work to nobody.
      let all: string[];
      if (c.noMod) {
        if (!c.initiatorRecipient) {
          throw new Error(
            "this contract has no verification and no initiator key — nobody could open the deliverable"
          );
        }
        all = [c.initiatorRecipient];
      } else {
        // Seal to every moderator on THIS contract's panel — and to nobody
        // else. Sealing to every registered moderator would let one read work
        // it was never given; sealing to only one would leave the other two
        // seats unable to judge. The active set is a fallback for a contract
        // whose panel somehow did not reach the client.
        const mods = c.panel?.length
          ? c.panel.map((m) => m.recipient)
          : (await api.get<{ recipients: string[] }>("/config/moderators")).recipients;
        // …and (if enrolled) the initiator, so a Pass delivers the exact
        // verified bytes — not a side-channel copy.
        all = c.initiatorRecipient ? [...mods, c.initiatorRecipient] : mods;
        if (!all.length) {
          throw new Error("no moderator to seal to — run moderator-register on the api");
        }
      }
      const ciphertext = await encryptToRecipients(bundle.blob, all);
      await uploadDeliverable(c.linkToken!, {
        deliverableHash: bundle.deliverableHash,
        root: bundle.root,
        ciphertext: toBase64(ciphertext),
      });
      return prepareSignSubmit(
        `/links/${c.linkToken}/deliverable/prepare`,
        `/links/${c.linkToken}/deliverable/submit`,
        {},
        signTransaction!
      );
    },
    onSuccess: onDone,
  });

  const err = (pick.error || submit.error) as Error | undefined;
  const spin = <Loader2 className="size-4 animate-spin" />;

  return (
    <div>
      <div className="mb-3 text-sm text-zinc-400">
        Submit your deliverable — pick the project folder. It&apos;s validated,
        content-hashed, and{" "}
        <span className="text-zinc-200">encrypted to the moderators</span> in your
        browser; only the ciphertext is uploaded.
      </div>

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/5">
        <FolderUp className="size-4" />
        {bundle ? "Choose a different folder" : "Choose folder"}
        <input
          ref={(el) => {
            if (el) {
              el.setAttribute("webkitdirectory", "");
              el.setAttribute("directory", "");
            }
          }}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && pick.mutate(e.target.files)}
        />
      </label>

      {pick.isPending && (
        <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">{spin} reading…</div>
      )}

      {bundle && (
        <div className="mt-4">
          {bundle.ok ? (
            <>
              <div className="mb-1 flex items-center gap-2 text-sm text-st-settled">
                <FileCheck2 className="size-4" /> {bundle.accepted.length} files ·{" "}
                {fmtSize(bundle.totalSize)}
              </div>
              <div className="mb-3 break-all font-mono text-xs text-muted">
                root {short(bundle.root ?? "")}
              </div>
            </>
          ) : (
            <div className="mb-2 text-sm text-red-300">
              No acceptable files — fix the rejections below and re-pick.
            </div>
          )}

          {bundle.rejected.length > 0 && (
            <ul className="mb-3 space-y-1 font-mono text-xs text-muted">
              {bundle.rejected.map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <FileX2 className="size-3.5 shrink-0 text-red-400/80" />
                  <span className="truncate">{r.path}</span>
                  <span className="ml-auto text-red-300/70">{r.reason}</span>
                </li>
              ))}
            </ul>
          )}

          {bundle.ok && (
            <Button
              variant="accent"
              className="w-full"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? spin : "Encrypt & submit"}
            </Button>
          )}
        </div>
      )}

      {err && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
          {err.message}
        </div>
      )}
    </div>
  );
}
