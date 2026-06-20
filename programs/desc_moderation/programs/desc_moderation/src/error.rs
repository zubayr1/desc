use anchor_lang::prelude::*;

#[error_code]
pub enum ModerationError {
    #[msg("Signer is not a registered, active moderator")]
    Unauthorized,
}
