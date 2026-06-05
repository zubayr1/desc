use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Protocol fee exceeds the maximum allowed")]
    InvalidFeeBps,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Escrow is not in the required state for this action")]
    InvalidStatus,
    #[msg("Initiator and committer must be different")]
    SelfDeal,
    #[msg("Signer is not authorized for this action")]
    Unauthorized,
    #[msg("The deadline has passed")]
    DeadlinePassed,
}
