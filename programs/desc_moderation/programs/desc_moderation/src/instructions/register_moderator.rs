use anchor_lang::prelude::*;

use crate::error::ModerationError;
use crate::states::{ModerationConfig, Moderator};

/// The admin registers a moderator: create its `Moderator` account (PDA, seeds =
/// [b"moderator", authority]) bound to this config, storing the mod's wallet,
/// public `age` recipient, and label. Born `active`.
///
/// V1 is admin-gated (platform-run internal mods). Permissionless, stake-gated
/// registration is V2 — those fields are carved from `Moderator::reserved`.
#[derive(Accounts)]
#[instruction(authority: Pubkey)]
pub struct RegisterModerator<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [ModerationConfig::SEED_PREFIX, admin.key().as_ref()],
        bump = config.bump,
        has_one = admin,
    )]
    pub config: Account<'info, ModerationConfig>,

    #[account(
        init,
        payer = admin,
        space = 8 + Moderator::INIT_SPACE,
        seeds = [Moderator::SEED_PREFIX, authority.as_ref()],
        bump,
    )]
    pub moderator: Account<'info, Moderator>,

    pub system_program: Program<'info, System>,
}

impl<'info> RegisterModerator<'info> {
    pub fn register_moderator(
        &mut self,
        authority: Pubkey,
        recipient: String,
        label: String,
        base_bps: u16,
        fee_per_kb: u64,
        max_bundle_kb: u32,
        bumps: &RegisterModeratorBumps,
    ) -> Result<()> {
        require!(recipient.len() <= 64, ModerationError::StringTooLong);
        require!(label.len() <= 64, ModerationError::StringTooLong);
        Moderator::validate_pricing(base_bps, fee_per_kb, max_bundle_kb)?;

        self.moderator.set_inner(Moderator {
            version: Moderator::VERSION,
            config: self.config.key(),
            authority,
            recipient,
            label,
            active: true,
            registered_at: Clock::get()?.unix_timestamp,
            bump: bumps.moderator,
            base_bps,
            fee_per_kb,
            max_bundle_kb,
            reserved: [0; 50],
        });

        Ok(())
    }
}
