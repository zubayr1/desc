import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Check, FileX2, FolderUp, Loader2 } from "lucide-react";
import JSZip from "jszip";
import type { BundleBlob, Contract, InputFile } from "@repo/shared";
import { buildBundle, decryptWithIdentity } from "@repo/shared";
import { api } from "@/lib/api";
import { deriveDeliverableKey } from "@/lib/deliverableKey";
import { fromBase64, fromHex } from "@/lib/bytes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

/**
 * Initiator-only: on a Pass, re-derive the deliverable key (one wallet signature),
 * download the SAME ciphertext the moderator judged, decrypt it, verify the bytes
 * match the on-chain hash, and hand over the files as a zip. This is what makes a
 * Pass deliver the verified bytes rather than a side-channel promise.
 */
export function VerifiedDownload({ c }: { c: Contract }) {
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
      <p className="mt-1 mb-3 text-xs text-muted">
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
