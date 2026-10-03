//! Reading accounts owned by ANOTHER program.
//!
//! These are not this program's account layouts (those live in `states`), and
//! they cannot be imported as types: `desc_moderation` already depends on this
//! crate, so the reverse import would be circular. Each is read raw and proved
//! genuine before anything here trusts it.

use anchor_lang::prelude::*;

use crate::error::EscrowError;

/// A moderator's quoted price, read from its `desc_moderation::Moderator`
/// account.
///
/// Escrow cannot import that type — `desc_moderation` already depends on this
/// crate — so the account is read raw, then checked: discriminator, layout, and
/// crucially that the verdict-authority PDA derived from the program OWNING the
/// account equals this escrow's `settlement_authority`.
///
/// That last check is what makes it safe: a look-alike owned by another program
/// would need a colliding authority PDA, which is infeasible.
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

        require!(m.active, EscrowError::ModeratorInactive);

        Ok(Self {
            authority: m.authority,
            base_bps: m.base_bps,
            fee_per_kb: m.fee_per_kb,
            max_bundle_kb: m.max_bundle_kb,
        })
    }
}
