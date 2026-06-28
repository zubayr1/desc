import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  FileCheck2,
  FileX2,
  FolderUp,
  Loader2,
  Lock,
} from "lucide-react";
import JSZip from "jszip";
import type { Contract, BundleResult, BundleBlob, InputFile } from "@repo/shared";
import {
  buildBundle,
  encryptToRecipients,
  decryptWithIdentity,
  DELIVERABLE_TYPE_LABELS as TYPE_LABEL,
} from "@repo/shared";
import { api, prepareSignSubmit, uploadDeliverable } from "@/lib/api";
import { deriveDeliverableKey } from "@/lib/deliverableKey";
import { StatusPill } from "@/components/StatusPill";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn, short, usd } from "@/lib/utils";

const fmtSize = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(2)} MB`;

/** Base64-encode bytes in chunks (avoids the spread call-stack limit). */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Decode base64 → bytes (chunk-free; safe for large blobs). */
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decode a hex string → bytes. */
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Initiator-only: on a Pass, re-derive the deliverable key (one wallet signature),
 * download the SAME ciphertext the moderator judged, decrypt it, verify the bytes
 * match the on-chain hash, and hand over the files as a zip. This is what makes a
 * Pass deliver the verified bytes rather than a side-channel promise.
 */
function VerifiedDownload({ c }: { c: Contract }) {
  const { signMessage } = useWallet();
  const [result, setResult] = useState<{ ok: boolean; files: number } | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      if (!signMessage) {
        throw new Error("your wallet can't sign messages, so the key can't be derived");
      }
      const { identity } = await deriveDeliverableKey(signMessage);
      const { ciphertext } = await api.get<{ ciphertext: string }>(
        `/contracts/${c.id}/deliverable/ciphertext`
      );
      const plain = await decryptWithIdentity(fromBase64(ciphertext), identity);
      const blob = JSON.parse(new TextDecoder().decode(plain)) as BundleBlob;

      // Verify: rebuild from the decrypted files + salt, compare to the chain hash.
      const inputs: InputFile[] = blob.files.map((f) => ({
        path: f.path,
        content: fromBase64(f.contentBase64),
      }));
      const rebuilt = buildBundle(inputs, { salt: fromHex(blob.manifest.salt) });
      const ok = rebuilt.deliverableHash === c.deliverable?.deliverableHash;

      // Zip + download.
      const zip = new JSZip();
      for (const f of blob.files) zip.file(f.path, fromBase64(f.contentBase64));
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deliverable-${c.id.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      return { ok, files: blob.files.length };
    },
    onSuccess: setResult,
  });

  return (
    <div className="glass p-4">
      <div className="text-sm font-medium text-zinc-100">Your verified deliverable</div>
      <p className="mt-1 mb-3 text-xs text-zinc-500">
        Re-derive your key (one signature) to download the exact files the moderator
        verified — checked against the on-chain hash.
      </p>
      <Button
        variant="outline"
        className="w-full"
        disabled={run.isPending}
        onClick={() => run.mutate()}
      >
        {run.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FolderUp className="size-4" />
        )}
        Download verified files
      </Button>
      {result && (
        <div
          className={cn(
            "mt-3 flex items-center gap-2 text-sm",
            result.ok ? "text-st-settled" : "text-red-300"
          )}
        >
          {result.ok ? <Check className="size-4" /> : <FileX2 className="size-4" />}
          {result.ok
            ? `Verified — ${result.files} files, hash matches the chain.`
            : "Hash mismatch — these bytes don't match what was verified."}
        </div>
      )}
      {run.error && (
        <div className="mt-3 text-sm text-red-300">{(run.error as Error).message}</div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={cn("mt-1 text-sm text-zinc-200", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}

function Passive({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm",
        ok ? "text-st-settled" : "text-zinc-400"
      )}
    >
      {ok && <Check className="size-4" />}
      {children}
    </div>
  );
}

/** Committer's deliverable submission: pick a folder → bundle + validate locally →
 *  ENCRYPT to the moderators in-browser → upload ciphertext → submit hash on-chain. */
function CommitterSubmit({ c, onDone }: { c: Contract; onDone: () => void }) {
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
      const { recipients } = await api.get<{ recipients: string[] }>("/config/moderators");
      // Seal to the moderators AND (if enrolled) the initiator, so a Pass delivers
      // the exact verified bytes to the initiator — not a side-channel copy.
      const all = c.initiatorRecipient ? [...recipients, c.initiatorRecipient] : recipients;
      if (!all.length) {
        throw new Error("no moderators configured — run moderator-register on the api");
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
              <div className="mb-3 break-all font-mono text-xs text-zinc-500">
                root {short(bundle.root ?? "")}
              </div>
            </>
          ) : (
            <div className="mb-2 text-sm text-red-300">
              No acceptable files — fix the rejections below and re-pick.
            </div>
          )}

          {bundle.rejected.length > 0 && (
            <ul className="mb-3 space-y-1 font-mono text-xs text-zinc-500">
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

/** The contextual action — depends on (status × role). */
function Actions({
  contract: c,
  onDone,
}: {
  contract: Contract;
  onDone: () => void;
}) {
  const { publicKey, connected, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const me = publicKey?.toBase58();
  const isInitiator = me === c.initiator;
  const isCommitter = me === c.committer;
  const pastDeadline = Date.now() > new Date(c.deadline).getTime();

  const accept = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        `/links/${c.linkToken}/accept/prepare`,
        `/links/${c.linkToken}/accept/submit`,
        { committer: me },
        signTransaction!
      ),
    onSuccess: onDone,
  });
  const release = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        `/contracts/${c.id}/release/prepare`,
        `/contracts/${c.id}/release/submit`,
        { signer: me },
        signTransaction!
      ),
    onSuccess: onDone,
  });
  const cancel = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        `/contracts/${c.id}/cancel/prepare`,
        `/contracts/${c.id}/cancel/submit`,
        {},
        signTransaction!
      ),
    onSuccess: onDone,
  });
  const refund = useMutation({
    mutationFn: () =>
      prepareSignSubmit(
        `/contracts/${c.id}/refund/prepare`,
        `/contracts/${c.id}/refund/submit`,
        {},
        signTransaction!
      ),
    onSuccess: onDone,
  });

  if (!connected) {
    return (
      <Button variant="accent" className="w-full" onClick={() => setVisible(true)}>
        Connect wallet
      </Button>
    );
  }

  const err = [accept, release, cancel, refund].find((m) => m.error)
    ?.error as Error | undefined;
  const busy =
    accept.isPending || release.isPending || cancel.isPending || refund.isPending;

  const errorBox = err && (
    <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
      {err.message}
    </div>
  );

  const spin = <Loader2 className="size-4 animate-spin" />;

  function body() {
    switch (c.status) {
      case "funded":
        if (isInitiator) {
          const link = `${window.location.origin}/c/${c.linkToken}`;
          return (
            <div>
              <div className="mb-3 text-sm text-zinc-400">
                Awaiting a committer. Share this link:
              </div>
              <div className="mb-4 flex items-center gap-2">
                <div className="glass flex-1 truncate px-3.5 py-2.5 font-mono text-sm text-zinc-300">
                  {link}
                </div>
                <Button
                  variant="outline"
                  className="px-3"
                  onClick={() => void navigator.clipboard.writeText(link)}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <Button
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending ? spin : "Cancel & reclaim deposit"}
              </Button>
            </div>
          );
        }
        return (
          <Button
            variant="accent"
            className="w-full"
            disabled={busy}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? spin : "Connect & accept this deal"}
          </Button>
        );

      case "active":
        if (isCommitter) {
          return <CommitterSubmit c={c} onDone={onDone} />;
        }
        if (isInitiator && pastDeadline) {
          return (
            <div>
              <div className="mb-3 text-sm text-st-submitted">
                Deadline passed with no deliverable — the committer ghosted.
              </div>
              <Button
                variant="accent"
                className="w-full"
                disabled={busy}
                onClick={() => refund.mutate()}
              >
                {refund.isPending ? spin : "Reclaim deposit"}
              </Button>
            </div>
          );
        }
        return (
          <Passive>
            Awaiting the committer&apos;s deliverable
            {isInitiator
              ? ` (until ${new Date(c.deadline).toLocaleDateString()})`
              : ""}
            .
          </Passive>
        );

      case "submitted":
        if (c.outcome === "pass") {
          if (isInitiator || isCommitter) {
            return (
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm text-st-settled">
                  <Check className="size-4" /> Verdict: PASS
                </div>
                <Button
                  variant="accent"
                  className="w-full"
                  disabled={busy}
                  onClick={() => release.mutate()}
                >
                  {release.isPending ? spin : `Release ${usd(c.amount)} to committer`}
                </Button>
              </div>
            );
          }
          return <Passive ok>Verdict: PASS — awaiting release.</Passive>;
        }
        if (c.outcome === "fail") {
          if (isInitiator) {
            return (
              <div>
                <div className="mb-3 text-sm text-st-submitted">Verdict: FAIL</div>
                <Button
                  variant="accent"
                  className="w-full"
                  disabled={busy}
                  onClick={() => refund.mutate()}
                >
                  {refund.isPending ? spin : "Reclaim deposit"}
                </Button>
              </div>
            );
          }
          // Committer (and any other viewer): just the outcome, no action.
          return (
            <div className="flex items-center gap-2 text-sm text-st-submitted">
              <span className="size-2 rounded-full bg-st-submitted" /> Verdict: FAIL
            </div>
          );
        }
        return (
          <Passive>
            <span className="size-2 animate-pulse rounded-full bg-st-submitted" />
            Awaiting verdict from the moderators.
          </Passive>
        );

      case "settled":
        return (
          <div className="space-y-4">
            <Passive ok>Settled — funds released to the committer.</Passive>
            {isInitiator && c.deliverable && c.initiatorRecipient && (
              <VerifiedDownload c={c} />
            )}
          </div>
        );
      case "refunded":
        return <Passive>Refunded to the initiator.</Passive>;
      case "cancelled":
        return <Passive>Cancelled before acceptance.</Passive>;
    }
  }

  return (
    <>
      {errorBox}
      {body()}
    </>
  );
}

export function ContractView() {
  const { id = "" } = useParams();
  const byLink = useLocation().pathname.startsWith("/c/");
  const queryClient = useQueryClient();

  const queryKey = ["contract", byLink ? "link" : "id", id];
  const {
    data: contract,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () =>
      api.get<Contract>(byLink ? `/links/${id}` : `/contracts/${id}`),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20 text-zinc-500">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (error || !contract) {
    return (
      <div className="mx-auto max-w-2xl text-center text-zinc-400">
        Contract not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {!byLink && (
        <Link
          to="/contracts"
          className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-300"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>
      )}

      <Card>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{contract.title}</h1>
          <StatusPill status={contract.status} />
        </div>
        <p className="mt-3 text-zinc-400">{contract.brief}</p>

        <div className="mt-6 grid grid-cols-2 gap-5">
          <Field label="Pays" value={usd(contract.amount)} mono />
          <Field
            label="Deadline"
            value={new Date(contract.deadline).toLocaleDateString()}
          />
          <Field
            label="Type"
            value={TYPE_LABEL[contract.deliverableType] ?? contract.deliverableType}
          />
          {contract.committer && (
            <Field label="Committer" value={short(contract.committer)} mono />
          )}
        </div>

        <div className="mt-6">
          <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
            Acceptance criteria
          </div>
          <ul className="space-y-2">
            {contract.acceptanceCriteria.map((cr) => (
              <li
                key={cr.id}
                className="flex items-start gap-2 text-sm text-zinc-300"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-st-settled" />
                {cr.description}
              </li>
            ))}
          </ul>
        </div>

        {contract.deliverable && (
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500">
              <Lock className="size-3.5" /> Deliverable — sealed to the moderators
            </div>
            <div className="break-all font-mono text-xs text-zinc-500">
              hash {short(contract.deliverable.deliverableHash)} · root{" "}
              {short(contract.deliverable.root)}
            </div>
          </div>
        )}

        <div className="mt-7 border-t border-white/10 pt-6">
          <Actions
            contract={contract}
            onDone={() => queryClient.invalidateQueries({ queryKey })}
          />
        </div>
      </Card>
    </div>
  );
}
