import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DELIVERABLE_TYPES } from "@repo/shared";
import {
  createContract,
  submitContract,
  prepareCancel,
  submitCancel,
  getContract,
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
  moderatorCount: z.number().int().positive(),
  moderatorSurcharge: z.string().regex(/^\d+$/),
  deadline: z.string().min(1),
});

const submitSchema = z.object({ signedTx: z.string().min(1) });

export function registerContractRoutes(app: FastifyInstance) {
  // Draft + build the unsigned create_escrow tx.
  app.post("/contracts", async (req) => {
    const body = createSchema.parse(req.body);
    return createContract({ ...body, deliverableType: body.deliverableType as any });
  });

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

  // Merged read (DB metadata + live chain state).
  app.get("/contracts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const contract = await getContract(id);
    if (!contract) {
      return reply.code(409).send({ error: "contract not funded yet" });
    }
    return contract;
  });
}
