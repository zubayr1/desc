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
    // APPEND-ONLY: anchor assigns codes (6000 + index) by declaration order, so
    // new variants go at the END — never insert or reorder.
    #[msg("Minimum protocol fee exceeds the maximum allowed")]
    InvalidFeeMin,
    #[msg("Amount is below the protocol minimum for a contract")]
    AmountBelowMinimum,
    #[msg("Fee floor exceeds the minimum contract amount")]
    FeeFloorAboveMinimum,
}
