export type Status =
  | "funded"
  | "active"
  | "submitted"
  | "settled"
  | "refunded"
  | "cancelled";

export interface MockContract {
  id: string;
  title: string;
  brief: string;
  deliverableType: string;
  criteria: string[];
  amount: string; // base units (1e6)
  status: Status;
  committer?: string;
  deadline: string;
  deliverable?: string;
  outcome?: "pass" | "fail";
  linkToken: string;
}

export const MOCK: MockContract[] = [
  {
    id: "a1",
    title: "Implement token vesting program",
    brief:
      "Linear vesting with a configurable cliff; deliver as a merged PR against acme/vesting.",
    deliverableType: "Merged PR",
    criteria: ["PR merged into main of acme/vesting", "All vesting tests pass in CI"],
    amount: "1000000000",
    status: "active",
    committer: "5ovQsdpYGkmsb5c6B22B9mawdXYQsBsVizfgEzAVYqR3",
    deadline: "Jun 20, 2026",
    linkToken: "BI5djvtVEMSOIB4hqZzR69nANI_uFqk4",
  },
  {
    id: "a2",
    title: "NFT mint site",
    brief: "Next.js mint page wired to the candy machine, deployed and live.",
    deliverableType: "Deployed contract",
    criteria: ["Live URL renders the mint button", "Mints on devnet succeed"],
    amount: "500000000",
    status: "submitted",
    outcome: "pass",
    committer: "7xKpQ2r8s9TfWxMvZ1aB3cD4eF5gH6jK7mN8pQ9rS0t",
    deadline: "Jun 15, 2026",
    deliverable: "https://github.com/acme/mint/pull/12",
    linkToken: "abc123",
  },
  {
    id: "a3",
    title: "Security audit report",
    brief: "Audit the escrow program; written report against the checklist.",
    deliverableType: "Technical report",
    criteria: ["Covers all 12 checklist items", "Findings include severity + remediation"],
    amount: "2000000000",
    status: "settled",
    outcome: "pass",
    committer: "9mBxY3z4A5bC6dE7fG8hJ9kL0mN1pQ2rS3tU4vW5xY6",
    deadline: "Jun 1, 2026",
    deliverable: "audit-report.pdf",
    linkToken: "def456",
  },
  {
    id: "a4",
    title: "Landing page copy",
    brief: "Hero + three sections of marketing copy for the launch site.",
    deliverableType: "Technical report",
    criteria: ["Three sections delivered", "On-brand voice"],
    amount: "300000000",
    status: "funded",
    deadline: "Jun 25, 2026",
    linkToken: "ghi789",
  },
  {
    id: "a5",
    title: "Webhook relay service",
    brief: "Small relay forwarding program logs to a Discord webhook.",
    deliverableType: "Deployed contract",
    criteria: ["Forwards events within 5s", "Survives restart"],
    amount: "750000000",
    status: "submitted",
    committer: "3pQwE4r5T6yU7iO8pA9sD0fG1hJ2kL3zX4cV5bN6mM7",
    deadline: "Jun 18, 2026",
    deliverable: "https://github.com/acme/relay/pull/3",
    linkToken: "jkl012",
  },
];

export const findContract = (key: string) =>
  MOCK.find((c) => c.id === key || c.linkToken === key);
