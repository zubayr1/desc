use anchor_lang::prelude::*;

use crate::error::EscrowError;

/// A moderator's quoted price, read from its `desc_moderation::Moderator`
/// account.
///
/// Escrow cannot import that type: `desc_moderation` already depends on this
/// crate to CPI into `record_verdict`, so the reverse import would be circular.
/// Instead the account is read raw and trusted only after three checks:
///
///  1. its 8-byte discriminator is `Moderator`'s,
///  2. it decodes as the field layout below, and
///  3. the `desc_moderation` verdict-authority PDA derived from the program that
///     OWNS the account, for the config the moderator is registered under, is
///     exactly this escrow's `settlement_authority`.
///
/// (3) is what makes it safe. A look-alike account owned by some other program
/// would need a config whose authority PDA collides with ours — infeasible. So
/// passing the check proves the moderator is registered with the very
/// moderation program that settles these escrows.
pub struct ModeratorPrice {
    pub authority: Pubkey,
    pub base_bps: u16,
    pub fee_per_kb: u64,
    pub max_bundle_kb: u32,
}

/// sha256("account:Moderator")[..8] — matches the `desc_moderation` IDL.
const MODERATOR_DISCRIMINATOR: [u8; 8] = [130, 201, 20, 55, 202, 167, 143, 128];

/// `desc_moderation::ModerationConfig::AUTHORITY_SEED_PREFIX`.
const VERDICT_AUTHORITY_SEED: &[u8] = b"authority";

/// Mirror of `desc_moderation::Moderator`, up to the pricing fields. The ORDER
/// must match that struct exactly; trailing `reserved` bytes are not read.
#[derive(AnchorDeserialize)]
struct ModeratorLayout {
    _version: u8,
    config: Pubkey,
    authority: Pubkey,
    _recipient: String,
    _label: String,
    active: bool,
    _registered_at: i64,
    _bump: u8,
    base_bps: u16,
    fee_per_kb: u64,
    max_bundle_kb: u32,
}

impl ModeratorPrice {
    pub fn load(account: &AccountInfo, settlement_authority: &Pubkey) -> Result<Self> {
        let data = account.try_borrow_data()?;
        require!(
            data.len() > 8 && data[..8] == MODERATOR_DISCRIMINATOR,
            EscrowError::ModeratorNotRecognized
        );

        let m = ModeratorLayout::deserialize(&mut &data[8..])
            .map_err(|_| error!(EscrowError::ModeratorNotRecognized))?;

        let (verdict_authority, _) = Pubkey::find_program_address(
            &[VERDICT_AUTHORITY_SEED, m.config.as_ref()],
            account.owner,
        );
        require_keys_eq!(
            verdict_authority,
            *settlement_authority,
            EscrowError::ModeratorNotRecognized
        );

        // A paused moderator takes no new work.
        require!(m.active, EscrowError::ModeratorInactive);

        Ok(Self {
            authority: m.authority,
            base_bps: m.base_bps,
            fee_per_kb: m.fee_per_kb,
            max_bundle_kb: m.max_bundle_kb,
        })
    }
}
