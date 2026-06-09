import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/Button";
import { short } from "@/lib/utils";

export function ConnectButton() {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
      <Button
        variant="outline"
        className="font-mono text-xs"
        onClick={() => void disconnect()}
        title="Disconnect"
      >
        {short(publicKey.toBase58())}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      className="font-mono text-xs"
      onClick={() => setVisible(true)}
    >
      Connect wallet
    </Button>
  );
}
