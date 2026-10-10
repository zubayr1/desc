use anchor_lang::prelude::*;

use crate::states::ModeratorReputation;

/// Create a moderator's reputation account (PDA, seeds = [b"mod_rep", moderator]).
///
/// Permissionless, caller pays. Safe because the caller supplies only the
/// moderator pubkey, which IS the seed — every other field is written here, so
/// the account is always born zeroed and bound to the key it derives from. An
/// account for a non-registered pubkey is inert: it can never be seated on a
/// panel, so it is never written again.
///
/// It matters that *anyone* can call this: `release` and `refund` require one
/// per seat, so a moderator seated without one would leave its escrow
/// unsettleable. Whoever notices can repair it.
///
/// `init`, never `init_if_needed` — the handler writes zeros, so on an existing
/// account that would wipe a moderator's entire history.
#[derive(Accounts)]
#[instruction(moderator: Pubkey)]
pub struct InitModeratorReputation<'info> {
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
            missed: 0,
            reserved: [0; 44],
        });

        Ok(())
    }
}
