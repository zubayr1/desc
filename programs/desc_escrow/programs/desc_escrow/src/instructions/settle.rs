use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token::spl_token::state::Account as SplTokenAccount;
use anchor_spl::token::{transfer, Transfer};

use crate::error::EscrowError;
use crate::states::{Escrow, ModeratorReputation, Panel, VOTE_NONE};

/// Pay AND score every moderator that voted. Shared by `release` and `refund`:
/// a moderator is paid for rendering a verdict, not for it going one way —
/// including when outvoted, or when its vote landed after the majority decided.
///
/// Scoring rides in the same pass, so payment and reputation can never disagree
/// about who did the work.
///
/// `panel_accounts` is two per SEAT, in panel order: token accounts in
/// `0..count`, `ModeratorReputation` PDAs in `count..2*count`.
///
/// Per SEAT and not per voter, because the voter list changes as votes land: a
/// transaction built while the last moderator was still judging would arrive
/// with the wrong number of accounts. Seats are fixed at creation.
///
/// Each token account is checked to belong to THAT seat's moderator, and each
/// reputation account to be the PDA derived from it — otherwise a caller could
/// redirect a fee, or collect credit for someone else's verdict.
pub fn settle_panel<'info>(
    panel: &Panel,
    escrow: &Escrow,
    panel_accounts: &'info [AccountInfo<'info>],
    vault: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<u64> {
    let count = panel.count as usize;
    require!(
        panel_accounts.len() == count * 2,
        EscrowError::ModeratorConfigMismatch
    );
    // Split here, not at the call sites, so the two cannot disagree on order.
    let (token_accounts, reputation_accounts) = panel_accounts.split_at(count);

    let mut paid: u64 = 0;
    for ((entry, token_account), reputation) in panel.entries[..count]
        .iter()
        .zip(token_accounts)
        .zip(reputation_accounts)
    {
        // Seated but silent: not paid, account never read, fee returns to the
        // initiator (see `release`).
        if entry.vote == VOTE_NONE {
            continue;
        }
        // Unpacked by hand, not via `Account<TokenAccount>`: read the two
        // fields and drop the borrow, so the token program can take its own.
        require!(
            token_account.owner == &anchor_spl::token::ID,
            EscrowError::Unauthorized
        );
        let (mint, wallet) = {
            let data = token_account.try_borrow_data()?;
            let parsed = SplTokenAccount::unpack(&data)?;
            (parsed.mint, parsed.owner)
        };
        require!(mint == escrow.mint, EscrowError::Unauthorized);
        require!(wallet == entry.moderator, EscrowError::Unauthorized);

        if entry.fee > 0 {
            transfer(
                CpiContext::new_with_signer(
                    token_program.clone(),
                    Transfer {
                        from: vault.clone(),
                        to: token_account.clone(),
                        authority: authority.clone(),
                    },
                    signer_seeds,
                ),
                entry.fee,
            )?;
        }
        paid = paid
            .checked_add(entry.fee)
            .ok_or(EscrowError::MathOverflow)?;

        // Score the seat just paid. `outcome` is always Some in practice —
        // a ghost-timeout refund has no votes, so the `continue` above fired for
        // every seat. Guarded anyway: a payout must never fail over a counter.
        if let Some(outcome) = escrow.outcome {
            let mut rep = Account::<ModeratorReputation>::try_from(reputation)?;
            rep.check_version()?;
            // `try_from` proves ownership and discriminator, not WHICH seat.
            // Re-derive from the seat's moderator.
            let expected = Pubkey::create_program_address(
                &[
                    ModeratorReputation::SEED_PREFIX,
                    entry.moderator.as_ref(),
                    &[rep.bump],
                ],
                &crate::ID,
            )
            .map_err(|_| error!(EscrowError::Unauthorized))?;
            require_keys_eq!(expected, reputation.key(), EscrowError::Unauthorized);

            rep.record(entry.vote, outcome, panel.count);
            rep.exit(&crate::ID)?;
        }
    }

    Ok(paid)
}
