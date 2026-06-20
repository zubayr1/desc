// State accounts — one file per account, re-exported here (desc_escrow pattern).
// Added in the logic phase:
//
//   pub mod moderation_config;  // [b"config", admin] — admin, escrow_program, min_verdicts, authority bump
//   pub mod moderator;          // [b"moderator", authority] — wallet, on-chain recipient, label, active
//
//   pub use moderation_config::*;
//   pub use moderator::*;
