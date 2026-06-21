use anchor_lang::prelude::*;

#[error_code]
pub enum ModerationError {
    #[msg("Signer is not a registered, active moderator")]
    Unauthorized,
    #[msg("Recipient or label exceeds the maximum length")]
    StringTooLong,
    #[msg("V1 supports only min_verdicts == 1")]
    InvalidMinVerdicts,
}
