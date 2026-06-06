import { randomBytes } from "node:crypto";

/** Generate an unguessable shareable-link token (URL-safe). */
export const generateLinkToken = () => randomBytes(24).toString("base64url");
