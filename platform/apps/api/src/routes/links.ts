import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getContractByLink,
  prepareAccept,
  submitAccept,
  uploadDeliverable,
  prepareDeliverable,
  submitDeliverable,
} from "../contracts/service";

const prepareSchema = z.object({ committer: z.string().min(1) });
const uploadSchema = z.object({
  deliverableHash: z.string().regex(/^[0-9a-f]{64}$/),
  root: z.string().regex(/^[0-9a-f]{64}$/),
  ciphertext: z.string().min(1), // base64 age ciphertext
});
const submitSchema = z.object({ signedTx: z.string().min(1) });

export function registerLinkRoutes(app: FastifyInstance) {
  // Committer opens the shareable link → review the contract.
  app.get("/links/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const contract = await getContractByLink(token);
    if (!contract) {
      return reply.code(409).send({ error: "contract not funded yet" });
    }
    return contract;
  });

  // Accept — build the unsigned tx.
  app.post("/links/:token/accept/prepare", async (req) => {
    const { token } = req.params as { token: string };
    const { committer } = prepareSchema.parse(req.body);
    return prepareAccept(token, committer);
  });

  // Accept — submit the signed tx (funded → active).
  app.post("/links/:token/accept/submit", async (req) => {
    const { token } = req.params as { token: string };
    const { signedTx } = submitSchema.parse(req.body);
    return submitAccept(token, signedTx);
  });

  // Upload the (encrypted) deliverable bundle — server stores it blind (no chain).
  app.post(
    "/links/:token/deliverable/upload",
    { bodyLimit: 160 * 1024 * 1024 },
    async (req) => {
      const { token } = req.params as { token: string };
      return uploadDeliverable(token, uploadSchema.parse(req.body));
    }
  );

  // Submit deliverable — build the unsigned tx from the uploaded bundle's hash.
  app.post("/links/:token/deliverable/prepare", async (req) => {
    const { token } = req.params as { token: string };
    return prepareDeliverable(token);
  });

  // Submit deliverable — submit the signed tx (active → submitted).
  app.post("/links/:token/deliverable/submit", async (req) => {
    const { token } = req.params as { token: string };
    const { signedTx } = submitSchema.parse(req.body);
    return submitDeliverable(token, signedTx);
  });
}
