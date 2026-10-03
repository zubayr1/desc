//! Account layouts.
//!
//! Backward-compat discipline, applied to every `#[account]` here:
//! `version` is the first field, `reserved` is the last. New fields are carved
//! out of `reserved` so the account size never changes and no `realloc` is
//! needed. Freed bytes are zeroed, so old accounts decode with new fields
//! reading as zero / None / false.
//!
//! Enums are APPEND-ONLY: borsh indexes variants by declaration order, so new
//! ones go at the end and existing ones are never reordered.

pub mod config;
pub mod escrow;
pub mod moderator_price;
pub mod moderator_reputation;
pub mod panel;

pub use config::*;
pub use escrow::*;
pub use moderator_price::*;
pub use moderator_reputation::*;
pub use panel::*;
