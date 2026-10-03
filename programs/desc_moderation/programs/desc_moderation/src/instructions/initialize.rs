use anchor_lang::prelude::*;

use crate::error::ModerationError;
use crate::states::ModerationConfig;

/// Bootstrap the program: create the `ModerationConfig` (PDA, seeds =
/// [b"config", admin]). The signer becomes the `admin` and pays for the account.
///
/// Also stores the bump of the `[b"authority", config]` signer PDA, so
/// `submit_verdict` can sign verdict CPIs as the escrow's settlement authority
/// — without any keypair ever holding that power.
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + ModerationConfig::INIT_SPACE,
        seeds = [ModerationConfig::SEED_PREFIX, admin.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, ModerationConfig>,

    /// Not initialized — only its bump is needed, stored in the config.
    /// CHECK: PDA validated by seeds; never written, used only as a CPI signer.
    #[account(
        seeds = [ModerationConfig::AUTHORITY_SEED_PREFIX, config.key().as_ref()],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn initialize(
        &mut self,
        escrow_program: Pubkey,
        min_verdicts: u8,
        bumps: &InitializeBumps,
    ) -> Result<()> {
        // Panel consensus is decided on the escrow's `Panel`.
        require!(min_verdicts == 1, ModerationError::InvalidMinVerdicts);

        self.config.set_inner(ModerationConfig {
            version: ModerationConfig::VERSION,
            admin: self.admin.key(),
            escrow_program,
            min_verdicts,
            bump: bumps.config,
            authority_bump: bumps.authority,
            reserved: [0; 64],
        });

        Ok(())
    }
}
