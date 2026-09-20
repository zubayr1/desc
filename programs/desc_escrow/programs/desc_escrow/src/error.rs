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
    #[msg("Moderator count and surcharge do not match the escrow's moderation mode")]
    ModeratorConfigMismatch,
    #[msg("Account was written by a newer program version than this one understands")]
    UnsupportedVersion,
    #[msg("Account is not a moderator registered with this escrow's settlement authority")]
    ModeratorNotRecognized,
    #[msg("Moderator is paused and takes no new work")]
    ModeratorInactive,
    #[msg("Size-based moderator pricing is not enabled yet")]
    SizePricingNotEnabled,
    #[msg("Verdict is not from the moderator assigned to this escrow")]
    NotAssignedModerator,
    #[msg("Moderator's price is above the maximum the initiator agreed to")]
    ModeratorFeeAboveMax,
    #[msg("A panel must have 0, 1 or 3 moderators — an even panel cannot reach a majority")]
    InvalidPanelSize,
    #[msg("The same moderator was listed twice on one panel")]
    DuplicateModerator,
}
