use anchor_lang::prelude::*;

use crate::states::ModeratorReputation;

/// Create a moderator's reputation account (PDA, seeds = [b"mod_rep", moderator]).
///
/// **Permissionless on purpose.** Anyone may create anyone's, and the caller
/// pays the rent. Three reasons that is right rather than merely convenient:
///
///  1. The caller supplies only the moderator pubkey, which *is* the seed. Every
///     other field is written by this handler, so the account is always born
///     zeroed and bound to the key it is derived from. There is no field an
///     attacker could pre-poison.
///  2. An account for a pubkey that is not a registered moderator is inert — it
///     can never be seated on a panel, so it can never be written again. The
///     worst case is a stranger donating ~0.0015 SOL to a dead account.
///  3. `release` and `refund` require one of these per seat. If a moderator were
///     ever seated without one, its escrow could not settle and real money would
///     be stuck. Letting *anybody* create the missing account means that
///     situation is always repairable by whoever notices, without the
///     moderator's key or ours.
///
/// This is why settlement does not create accounts lazily: `release` is signed
/// by a party, not by a moderator, so `init_if_needed` there would make the
/// initiator or committer pay rent for a moderator's account.
///
/// `init`, never `init_if_needed`. The handler writes zeros, so on an account
/// that already exists `init_if_needed` would **wipe a moderator's entire
/// history** — a one-instruction reputation reset anyone could call. `init`
/// fails on an existing account, which is the behaviour that protects it.
#[derive(Accounts)]
#[instruction(moderator: Pubkey)]
pub struct InitModeratorReputation<'info> {
    /// Whoever is paying. Has no authority over the account afterwards —
    /// nobody does.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + ModeratorReputation::INIT_SPACE,
        seeds = [ModeratorReputation::SEED_PREFIX, moderator.as_ref()],
        bump,
    )]
    pub reputation: Account<'info, ModeratorReputation>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitModeratorReputation<'info> {
    pub fn init_moderator_reputation(
        &mut self,
        moderator: Pubkey,
        bumps: &InitModeratorReputationBumps,
    ) -> Result<()> {
        self.reputation.set_inner(ModeratorReputation {
            version: ModeratorReputation::VERSION,
            moderator,
            verdicts_cast: 0,
            panel_verdicts: 0,
            majority_agreements: 0,
            fail_votes: 0,
            bump: bumps.reputation,
            reserved: [0; 48],
        });

        Ok(())
    }
}
