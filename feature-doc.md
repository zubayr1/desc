# Project Idea — Final Features Document (V1 Planning Complete)

*Planning phase complete for V1. This document is now the source of truth for what V1 is, and the roadmap for V2+.*

**Status legend:**
- ✅ Confirmed
- 🛠 Built — implemented in the current codebase (manual/CI stand-in where the AI isn't wired yet)
- 🔮 Future scope — committed to as a later phase
- 🚫 Considered and set aside

---

## Product Identity

✅ **This is a formalization tool, not a marketplace.** Two parties who have already agreed to a deal (on Twitter, Discord, Telegram, LinkedIn, anywhere) come to the platform to formalize it: escrow the funds, define checkable acceptance criteria, let AI moderators verify delivery, and settle. The platform does not host listings, does not facilitate discovery, does not match buyers with sellers.

This identity is preserved through V1, V2, and V3. Marketplace dynamics, yield products, and tokenization are explicitly out of scope until very late phases (V4+).

### Why this matters

- No two-sided liquidity problem at any phase until very late.
- Each contract is a discrete win — acquisition is per-deal, not per-user.
- Marketing message is sharp: *"You already made the deal — now make it safe."*
- Competitive moat is verification quality + formalization UX, not network effects.
- Resists the founder temptation to bolt on a marketplace prematurely.

---

## Vision vs. Launch

✅ **Vision**: A neutral trust layer for any freelance or small-contract work, globally — addressing scams, non-payment, and unresolved disputes in both Web2 and Web3 contexts. Crypto rails are the implementation; the problem is universal.

✅ **Launch wedge**: Solana **bounty hunters** specifically — bounty-style dev work where the deliverable is objectively checkable (merged PR, deployed contract, test suite pass, written technical report against a defined spec). Crypto-only at v1.

---

## V1 Features (the launch product)

1. ✅ **A formalization tool for Solana bounty-style freelance work**, positioned around the trust-gap problem (scams, non-payment, unresolved disputes). Two parties bring their pre-agreed deal here to make it safe.

2. ✅ **On-chain escrow on Solana** — funds held by the protocol, not by either party.

3. ✅ **AI moderator agents verify delivery** — a registered AI mod decrypts the deliverable and judges it against the criteria; **V1 settles on a single mod's verdict**, while multiple independent agents reaching **consensus is V2**.

4. ✅ **Helper AI for the initiator** — assists in writing the project brief and drafting checkable acceptance criteria. Non-negotiable for v1.

5. ✅ **Launch constraint: objectively-verifiable deliverables only** — v1 only accepts tasks whose acceptance criteria can be checked programmatically or near-programmatically.

6. ✅ **Positioning vs. Web2 incumbents**: faster settlement, lower fees, less regulatory overhead, more automated dispute resolution.

7. 🔮 **Random moderator assignment by protocol (V2)** — initiators never pick their own moderators; random selection from the staked pool prevents collusion and Sybil bias. **V1 has no selection** — each registered internal mod may judge.

8. ✅ **USDC as the settlement currency at launch** — no native token at v1.

9. ✅ **Pricing model**: 2% base protocol fee on each contract + a per-moderator surcharge that flows to the moderator(s). **V1: the surcharge is 1% of the contract, paid to the judging mod on a successful verdict;** V2 grows it to fee + desc-token and scales the % by moderator reputation. Number of moderators set by the protocol based on contract value.

10. ✅ **Standalone platform at launch** — direct user-facing product. SDK is a later phase.

11. ✅ **Platform-run internal moderators at launch** — the platform registers its own mod(s) on-chain (`desc_moderation`), each an automated AI service; a diverse federated pool + **third-party** pluggable mods come in **V2**.

12. ✅ **Formalization flow is the only flow at v1** — no marketplace, no listings, no discovery. The entry point is "I have a deal, let's formalize it."

13. ✅ **Shareable contract link as the primary onboarding mechanism** — initiator drafts the contract, gets a link, sends it to the committer through whatever channel they already used (Discord, Twitter DM, Telegram, etc.). Committer opens the link, connects wallet, reviews, accepts. No prior account creation required. This matches how deals actually happen and reinforces the formalization-tool identity at the UX level.

14. ✅ **Manual dispute review by the platform team at v1** — when AI moderators disagree or one party contests a verdict, the platform team reviews manually. Acceptable at launch volume; replaced by the human juror tier in V2+.

---

## Deliverable Mechanism (V1)

How the committer hands over work so it's **tamper-evident, AI-verifiable, confidential until payment, and scalable.** This is **built** (with a CI/manual check standing in for the AI until the moderator agents land).

- 🛠 **Sealed, content-addressed bundle.** The committer picks a project **folder**; the browser validates + cleans it, builds a deterministic **Merkle root** over the files, and the on-chain anchor is `deliverable_hash = sha256(manifest)` (manifest = `{root, per-file hashes, salt}`). The program stores only that 32-byte hash; the lifecycle is unchanged. `verdict_hash` embeds the deliverable hash, so the chain records *(exact artifact, verdict against it)*.
- 🛠 **Validation pipeline** (security-critical, unit-tested): size/file-count caps + zip-bomb guard, denylist (`node_modules`, `.env`, `.git`, build dirs…), path-safety (no `..` / absolute / symlink → zip-slip), deterministic path-sorted hashing.
- 🛠 **Encrypted to the moderators, in the browser.** The bundle is encrypted with a **multi-recipient `age` envelope** to every active moderator's public key; only the **ciphertext** is uploaded. The server stores it **blind** — it never sees plaintext.
- 🛠 **Moderator decrypts + re-verifies.** A moderator decrypts with its own key, recomputes the bundle, and checks the hash equals the on-chain anchor → proof it judged *exactly* the committed bytes. (Today via a CLI stand-in; moves into the mod service next.)
- ✅ **Deliverable types are an AI hint, not a transport.** The committer always delivers a **deployable** artifact (code / tests / report); the *initiator* does the real-world action (merge, deploy). desc escrows the **work product**, not the outcome — so only objectively-checkable artifacts are escrowed.
- 🔮 **Settlement = decryption (V2):** the initiator's access becomes a cryptographic consequence of an on-chain PASS (threshold key release), not a server ACL flip.

> **Pulled into V1 from later phases:** the sealed/encrypted deliverable, the multi-recipient envelope, and the moderator key registry — because "bring your AI" only makes sense if the encrypt → decrypt → verify pipeline exists from the start.

---

## Moderator Architecture (V1 → V2 → V3)

✅ **The moderator is an automated AI *service*, not a person clicking a UI.** It runs after the committer submits — **decrypt → check against the criteria → sign the verdict** — fully automatic. There is **no moderator UI**; the admin UI is **platform-only, read-only oversight**. **V1 puts mods on-chain**: they sign verdicts with their *own* wallets via the `desc_moderation` program, so there is **no central `settlement_authority` keypair**.

- ✅ **V1 — the `desc_moderation` Anchor program.** Each mod is an on-chain account (PDA) with its own **non-custodial wallet** + age key; the program checks the signer is a registered mod and **CPIs the verdict into the escrow** (authority = the program's PDA). V1 mods are **platform-run internal** (registered by the admin); **no random selection yet** — each registered mod may judge.
- ✅ **V1 reward** — a mod earns **1% of the contract** (the `moderator_surcharge`) on a successful moderation, paid from the escrow on `release`.
- 🛠 **Already built (the seams):** the moderator registry, the **multi-recipient envelope** (deliverables seal to N mods), and an automated **decrypt → verify** path. The "AI" is a **CI/manual stand-in** until the agents land (AI-last).
- 🔮 **V2 — open + decentralize.** External operators bring their own AI mods, **stake** (slashed for dishonesty), are **randomly assigned** per contract, and settle by **on-chain consensus (k-of-n)**; rewards grow to **fee + desc-token**, with the **fee % scaling by reputation**.
- 🔮 **V3 — attested verdicts (TEE / zkML).** The verdict carries proof the agreed AI actually ran on the actual deliverable — the only mechanism that *prevents* (not just penalizes) a mod signing without checking. Receipt anchored on-chain.

> **Honest limit:** *"a mod can only pass/fail after the AI ran"* can't be **enforced** cryptographically until V3. V1 relies on trusted internal mods; V2 adds economic enforcement (stake/slash + consensus); V3 adds proof.

---

## Operational Notes (not features, but real commitments)

- **Dispute review SLA**: manual review means someone on the team must be available to investigate disputes within a defined window (suggest: 48 business hours at launch). This is an operational cost that scales with volume and needs to be planned for, including coverage during off-hours, vacations, and unexpected volume spikes.
- **Helper AI quality is the make-or-break factor**: if acceptance criteria are vague, verification fails, disputes go up, manual review load explodes. Investing in Helper AI prompting and templates is the single highest-leverage v1 work.
- **Cold-start expectation**: this is a formalization tool, so cold-start is per-deal, not per-user — but the first deals still need to come from somewhere. Expect to source the first 10–20 deals from your own network (Solana dev communities, Superteam Discord, Twitter), not from organic traffic.

---

## Future Scope — committed to as later phases

### 🔮 V2 — Multi-task projects and decomposition

When expanding to dev-for-contracts work in V2, projects become naturally multi-component and decomposition becomes valuable.
- 🔮 Atomic task decomposition — large projects broken into sub-tasks.
- 🔮 One committer per atomic task.
- 🔮 Privacy via decomposition — no single committer sees the whole project.
- 🔮 Helper AI extended to propose sub-task graphs.

**Plan**: After bounty wedge proves out (~20–50 successful contracts, <10% manual intervention rate), extend the contract model to support a parent contract with child sub-task contracts, each with their own committer, escrow allotment, and verification.

### 🔮 V2 — Niche expansion beyond bounties

- 🔮 **Phase 2a — Devs hired for one-off contracts**, ~3–6 months after bounty launch.
- 🔮 **Phase 2b — Campaign and marketing work**, ~6–12 months after bounty launch. Requires reputation-weighted moderation and/or the human-juror escalation tier first.

**Plan**: Each niche expansion ships its own template library, its own Helper AI prompt set, and its own verification agent configurations. Re-use the core protocol; specialize the layer on top.

### 🔮 V2 — Human juror escalation tier

**Plan**: Build a staked-juror system (Kleros-style or lightweight homegrown) so disputes that exceed AI disagreement threshold escalate to humans instead of the platform team. Required before subjective deliverables are allowed. Likely the first thing built after the bounty launch stabilizes.

### 🔮 V2 — Pluggable third-party moderator market

**Plan**: Open the moderator pool to external operators who stake tokens and run their own AI agents. Verdicts that match consensus earn fees + reputation; disagreement burns stake. Requires designing staking economics, Sybil resistance for moderators, and verdict commit-reveal to prevent copying.

### 🔮 V2 — Decentralized moderation (on top of the V1 `desc_moderation` program)

**Plan**: The `desc_moderation` program itself ships in **V1** — mods are on-chain PDAs with **non-custodial wallets** that sign verdicts via CPI (no central `settlement_authority`), earning a 1% fee. V2 layers decentralization on top: open registration to **third-party** operators, **staking + slashing**, **random per-contract assignment**, **k-of-n consensus** (a per-contract verdict-record account), and richer rewards (**desc-token + reputation-scaled fee %**), plus Sybil resistance and verdict commit-reveal.

### 🔮 V3 — Verifiable verdicts (TEE / zkML)

**Plan**: The moderator's verdict ships with a proof the agreed AI actually ran on the agreed deliverable — TEE remote-attestation first, zkML later. Receipt anchored in `verdict_hash`; `release` can require it. This is the only mechanism that *prevents* (rather than just penalizes) a mod signing a verdict without checking. Until then, honesty is enforced by trust (V1) → stake/slash (V2).

### 🔮 V2 — SDK / infrastructure offering

**Plan**: Once standalone has real volume and a credible track record (~3–6 months of consistent operation), offer the escrow + verification primitive as an SDK/API for platforms like Superteam Earn, Layer3, Dework, Charmverse, Questbook, Bountycaster. Pitch backed by real metrics, not vapor.

### 🔮 V2 — Web2 access (embedded wallets, fiat on/off ramps)

**Plan**: Integrate Privy/Dynamic/Turnkey-style embedded wallets so users sign up with email and never see the crypto layer. Add fiat ramps (card → USDC → escrow → USDC → bank). Opens the vision-level market (general freelance, LinkedIn deals).

### 🔮 V2+ — Reputation system for users

**Plan**: On-chain reputation for initiators and committers, accumulated over completed deals. Reduces the "every contract starts at zero trust" problem and feeds into moderator weighting decisions.

### 🔮 V2+ — Subjective deliverable support

**Plan**: Once reputation-weighted moderation and human-juror escalation are live, allow subjective work (design, writing, creative). Acceptance criteria stay required but no longer need to be 100% programmatically checkable.

### 🔮 V4+ — Yield, tokenization, marketplace

Explicitly deferred to very late phases. Only after the formalization tool is a proven, widely-used trust primitive across multiple verticals.

- 🔮 **Yield products** — possibly never if it doesn't fit the product identity.
- 🔮 **Native token** — only if it solves a real problem (moderator staking, governance, fee discounts), not as a gimmick.
- 🔮 **Marketplace / discovery side** — only if there's clear user demand beyond what off-platform sources already provide.

---

## Features explicitly set aside

- 🚫 Marketplace, listings, discovery, matching — V4+ at earliest. Possibly never.
- 🚫 Yield products — V4+ at earliest.
- 🚫 Native token — V4+ at earliest.
- 🚫 Atomic task decomposition — V2.
- 🚫 One committer per atomic task — V2.
- 🚫 Privacy via decomposition — V2.
- 🚫 Pluggable third-party moderators — V2.
- 🚫 Marketing/campaign work at launch — V2 Phase 2b.
- 🚫 Dev-for-contract work at launch — V2 Phase 2a.
- 🚫 SDK offering at launch — V2.
- 🚫 Embedded wallets / email signup — V2.
- 🚫 Fiat on/off ramps — V2.
- 🚫 Subjective deliverables — V2+.
- 🚫 Milestone-based partial releases — over-engineering for v1.
- 🚫 Initiator picks moderators — rejected. Random assignment only.
- 🚫 Human juror escalation tier at launch — V2+.
- 🚫 Reputation system for users at launch — V2+.

---

## V1 Summary

A formalization tool for Solana bounty deals. Two parties who already agreed somewhere else come here to make their deal safe — on-chain USDC escrow, Helper AI writes checkable acceptance criteria, federated AI moderators randomly verify deliverables, 2% protocol fee plus per-moderator surcharge. Shareable contract link as the primary onboarding flow. Manual dispute review by the platform team. Objectively-verifiable bounty work only. No marketplace, no discovery, no listings — just formalization.

That's V1. Buildable, focused, and with a clear identity that holds through multiple expansion phases.

---

## V1 — Minimum Buildable Surface

The product reduces to roughly these components (with current build status):

1. 🛠 **Solana escrow program (Anchor)** — deposit, lock, release on verdict, refund on timeout. *Built: 10 instructions, full test suite, deployed to localnet.*
2. **Helper AI service** — brief + bounty type → proposed acceptance criteria; initiator edits before commit. *Not started (AI-last).*
3. **Moderator agent service** — N platform-run instances verifying with different prompts/models → verdict + confidence. *Stand-in built (decrypt → CI/manual check → sign); real AI agents not started.*
4. **Verdict aggregator** — V1 settles on a single registered mod's verdict (no consensus yet); k-of-n consensus across the pool is V2. *Not started — lands with the AI agents.*
5. 🛠 **Frontend** — draft contract, review-and-accept (shareable link), submit deliverable (folder → sealed/encrypted), view verdict + settlement, plus a dashboard. *Built.*
6. 🛠 **Platform admin / dispute tool** — oversight console (contracts, queue, manual verdict stand-in). *Built; matures into the platform-only oversight view.*
7. 🛠 **Deliverable pipeline + moderator registry** — folder → validate → Merkle → encrypt-to-mods → blind storage → decrypt + verify; off-chain registry of moderator recipients. *Built (this milestone).*

---

## Planning Phase: Complete

Everything from here forward is execution: validation conversations with target users, then building the V1 surface above. The features document is now the reference for what V1 is and what is deliberately deferred.
