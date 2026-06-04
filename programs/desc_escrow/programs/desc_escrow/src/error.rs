use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Protocol fee exceeds the maximum allowed")]
    InvalidFeeBps,
}
