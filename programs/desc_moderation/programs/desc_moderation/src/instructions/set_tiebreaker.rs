use anchor_lang::prelude::*;

use crate::states::{ModerationConfig, Moderator};

/// Admin-only: it decides who gets the final say on contested deals.
#[derive(Accounts)]
pub struct SetTiebreaker<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [ModerationConfig::SEED_PREFIX, admin.key().as_ref()],
        bump = config.bump,
        has_one = admin,
    )]
    pub config: Account<'info, ModerationConfig>,

    #[account(mut, has_one = config)]
    pub moderator: Account<'info, Moderator>,
}

impl<'info> SetTiebreaker<'info> {
    pub fn set_tiebreaker(&mut self, is_tiebreaker: bool) -> Result<()> {
        self.moderator.is_tiebreaker = is_tiebreaker;
        Ok(())
    }
}
