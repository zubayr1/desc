use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod states;

use instructions::*;

declare_id!("AHGBmnYQCXJwnKKPixjmt6KAbDjVpMQtETRASzycJ47T");

#[program]
pub mod desc_moderation {
    use super::*;

    // Instructions wired in the logic phase:
    //   initialize, register_moderator, set_moderator_active, submit_verdict
}
