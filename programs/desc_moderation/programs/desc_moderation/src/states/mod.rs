//! Account layouts.
//!
//! Backward-compat discipline, same as `desc_escrow`: `version` first,
//! `reserved` last, new fields carved from `reserved` so the account size never
//! changes. Freed bytes are zeroed, so old accounts decode with new fields
//! reading as zero.

pub mod moderation_config;
pub mod moderator;

pub use moderation_config::*;
pub use moderator::*;
