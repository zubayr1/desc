use anchor_lang::prelude::*;

use crate::states::Moderator;

/// A moderator pauses or resumes ITSELF — the signer must be the mod's own
/// wallet (`seeds` bind the account to the signer, `has_one` re-checks it). The
/// admin deliberately cannot toggle this: a mod controls its own availability.
#[derive(Accounts)]
pub struct SetModeratorActive<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Moderator::SEED_PREFIX, authority.key().as_ref()],
        bump = moderator.bump,
        has_one = authority,
    )]
    pub moderator: Account<'info, Moderator>,
}

impl<'info> SetModeratorActive<'info> {
    pub fn set_moderator_active(&mut self, active: bool) -> Result<()> {
        self.moderator.active = active;
        Ok(())
    }
}
