import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DELIVERABLE_TYPES, CONTRACT_STATUSES, type ContractStatus } from "@repo/shared";
import {
  createContract,
  submitContract,
  prepareCancel,
  submitCancel,
  prepareRelease,
  submitRelease,
  prepareRefund,
  submitRefund,
  prepareMutualCancel,
  submitMutualCancel,
  getContract,
  getDeliverableCiphertext,
  listContracts,
} from "../contracts/service";

const createSchema = z.object({
  initiator: z.string().min(1),
  title: z.string().min(1),
  brief: z.string().min(1),
  deliverableType: z
    .string()
    .refine((v) => (DELIVERABLE_TYPES as readonly string[]).includes(v), {
      message: "invalid deliverableType",
    }),
  acceptanceCriteria: z.array(z.object({ description: z.string().min(1) })).min(1),
  amount: z.string().regex(/^\d+$/),
  moderatorCount: z.number().int().nonnegative(),
  moderatorSurcharge: z.string().regex(/^\d+$/),
  deadline: z.string().min(1),
  initiatorRecipient: z.string().min(1).optional(),
});

const submitSchema = z.object({ signedTx: z.string().min(1) });
const releaseSchema = z.object({ signer: z.string().min(1) });

export function registerContractRoutes(app: FastifyInstance) {
  // Draft + build the unsigned create_escrow tx. Tighter rate limit: this writes
  // an (unfunded) draft row before any wallet signature, so it's the spam vector.
  app.post(
    "/contracts",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const body = createSchema.parse(req.body);
      return createContract({ ...body, deliverableType: body.deliverableType as any });
    }
  );

  // Submit the signed tx, confirm funded, mint the link token.
  app.post("/contracts/:id/submit", async (req) => {
    const { id } = req.params as { id: string };
    const { signedTx } = submitSchema.parse(req.body);
    return submitContract(id, signedTx);
  });

  // Cancel (initiator) — build the unsigned tx.
  app.post("/contracts/:id/cancel/prepare", async (req) => {
    const { id } = req.params as { id: string };
    return prepareCancel(id);
  });

  // Cancel — submit the signed tx (refund + mark cancelled).
  app.post("/contracts/:id/cancel/submit", async (req) => {
    const { id } = req.params as { id: string };
    const { signedTx } = submitSchema.parse(req.body);
    return submitCancel(id, signedTx);
  });

  // Release (either party) — build the unsigned tx.
  app.post("/contracts/:id/release/prepare", async (req) => {
    const { id } = req.params as { id: string };
    const { signer } = releaseSchema.parse(req.body);
    return prepareRelease(id, signer);
  });

  // Release — submit the signed tx (Pass → settled, committer + treasury paid).
  app.post("/contracts/:id/release/submit", async (req) => {
    const { id } = req.params as { id: string };
    const { signedTx } = submitSchema.parse(req.body);
    return submitRelease(id, signedTx);
  });

  // Refund (initiator) — build the unsigned tx.
  app.post("/contracts/:id/refund/prepare", async (req) => {
    const { id } = req.params as { id: string };
    return prepareRefund(id);
  });

  // Refund — submit the signed tx (Fail/ghost → refunded).
  app.post("/contracts/:id/refund/submit", async (req) => {
    const { id } = req.params as { id: string };
    const { signedTx } = submitSchema.parse(req.body);
    return submitRefund(id, signedTx);
  });

  // Mutual cancel (both parties) — build the unsigned tx (needs two signatures).
  app.post("/contracts/:id/mutual-cancel/prepare", async (req) => {
    const { id } = req.params as { id: string };
    return prepareMutualCancel(id);
  });

  // Mutual cancel — submit the doubly-signed tx (→ refunded).
  app.post("/contracts/:id/mutual-cancel/submit", async (req) => {
    const { id } = req.params as { id: string };
    const { signedTx } = submitSchema.parse(req.body);
    return submitMutualCancel(id, signedTx);
  });

  // List (read model) — filter by initiator and/or status.
  app.get("/contracts", async (req) => {
    const { initiator, status } = req.query as {
      initiator?: string;
      status?: string;
    };
    const validStatus =
      status && (CONTRACT_STATUSES as readonly string[]).includes(status)
        ? (status as ContractStatus)
        : undefined;
    return listContracts({ initiator, status: validStatus });
  });

  // Merged read (DB metadata + live chain state).
  app.get("/contracts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const contract = await getContract(id);
    if (!contract) {
      return reply.code(409).send({ error: "contract not funded yet" });
    }
    return contract;
  });

  // The initiator downloads the sealed deliverable to decrypt it (settle gated).
  app.get("/contracts/:id/deliverable/ciphertext", async (req) => {
    const { id } = req.params as { id: string };
    return getDeliverableCiphertext(id);
  });
}
