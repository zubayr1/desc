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
    #[msg("This moderator has already voted on this escrow")]
    AlreadyVoted,
    #[msg("The verdict is already final — a majority was reached without this vote")]
    VerdictAlreadyFinal,
    #[msg("This panel votes by commit and reveal, not directly — or the reverse")]
    WrongVotingMode,
    #[msg("The voting window for this escrow has closed")]
    VotingClosed,
    #[msg("Reveals are not open yet — wait until every seat has committed or the commit window ends")]
    RevealNotOpen,
    #[msg("This seat has not committed a vote")]
    NotCommitted,
    #[msg("The revealed vote does not match the commit")]
    CommitMismatch,
    #[msg("A verdict must be Pass or Fail")]
    InvalidVote,
    #[msg("Tiebreaking is only possible after voting closes with no majority")]
    TiebreakNotOpen,
    #[msg("This escrow has used all its tiebreaks")]
    TiebreakCapReached,
    #[msg("Every seat has already voted")]
    NoSilentSeat,
    #[msg("Not finalizable yet — a vote or a tiebreak is still possible")]
    NotFinalizable,
    #[msg("A moderator that committed is still inside its reveal window")]
    AwaitingReveals,
    #[msg("A tiebreaker cannot be chosen as a panel moderator")]
    TiebreakerNotSelectable,
    #[msg("Verdict window must be between 1 second and 7 days")]
    InvalidVerdictWindow,
}
