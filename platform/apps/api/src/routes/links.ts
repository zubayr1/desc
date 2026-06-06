import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getContractByLink,
  prepareAccept,
  submitAccept,
  prepareDeliverable,
  submitDeliverable,
} from "../contracts/service";

const prepareSchema = z.object({ committer: z.string().min(1) });
const deliverableSchema = z.object({ payload: z.string().min(1) });
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

  // Submit deliverable — build the unsigned tx (committer read from chain).
  app.post("/links/:token/deliverable/prepare", async (req) => {
    const { token } = req.params as { token: string };
    const { payload } = deliverableSchema.parse(req.body);
    return prepareDeliverable(token, payload);
  });

  // Submit deliverable — submit the signed tx (active → submitted).
  app.post("/links/:token/deliverable/submit", async (req) => {
    const { token } = req.params as { token: string };
    const { signedTx } = submitSchema.parse(req.body);
    return submitDeliverable(token, signedTx);
  });
}
