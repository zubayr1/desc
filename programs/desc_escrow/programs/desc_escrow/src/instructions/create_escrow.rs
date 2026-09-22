use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};

use crate::error::EscrowError;
use crate::states::{Config, Escrow, EscrowStatus, ModeratorPrice, Panel, PanelEntry, VOTE_NONE};

/// Initiator opens an escrow and deposits the full amount (payout + protocol
/// fee + moderator surcharge) into a program-owned vault. Status -> Funded.
///
/// The protocol fee is snapshotted from the live `Config` so it's trustless and
/// can't drift if the config fee changes mid-deal.
/// Every sizeable account here is BOXED (heap, not stack). Unboxing any of them
/// overflows the BPF 4KB stack frame in `try_accounts` — which does not fail
/// loudly, it corrupts the accounts it parsed and surfaces as a nonsense error
/// from whatever reads them next.
#[derive(Accounts)]
#[instruction(contract_id: [u8; 16])]
pub struct CreateEscrow<'info> {
    #[account(mut)]
    pub initiator: Signer<'info>,

    #[account(
        seeds = [Config::SEED_PREFIX, config.authority.as_ref()],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    pub mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = initiator,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [Escrow::SEED_PREFIX, initiator.key().as_ref(), contract_id.as_ref()],
        bump,
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    /// Program-owned vault (PDA token account) that holds the deposit.
    #[account(
        init,
        payer = initiator,
        token::mint = mint,
        token::authority = escrow,
        seeds = [b"vault", escrow.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// Initiator's USDC account funding the deposit.
    #[account(
        mut,
        token::mint = mint,
        token::authority = initiator,
    )]
    pub initiator_token_account: Box<Account<'info, TokenAccount>>,

    /// The moderators judging this escrow and (later) their votes. Created for
    /// every escrow, including no-mod ones, so settlement has one shape.
    #[account(
        init,
        payer = initiator,
        space = 8 + Panel::INIT_SPACE,
        seeds = [Panel::SEED_PREFIX, escrow.key().as_ref()],
        bump,
    )]
    pub panel: Box<Account<'info, Panel>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateEscrow<'info> {
    pub fn create_escrow(
        &mut self,
        contract_id: [u8; 16],
        amount: u64,
        deadline: i64,
        no_mod: bool,
        max_moderator_fee: u64,
        // The `desc_moderation::Moderator` accounts the initiator picked: none
        // for no-mod, otherwise 1 or 3. Read raw and verified in
        // `ModeratorPrice::load` — escrow cannot import that account type.
        moderators: &[AccountInfo<'info>],
        bumps: &CreateEscrowBumps,
    ) -> Result<()> {
        self.config.check_version()?;
        require!(!self.config.paused, EscrowError::ProtocolPaused);
        require!(amount > 0, EscrowError::InvalidAmount);
        // Below the minimum the fee floor would be a punitive share of the
        // contract. Zero (legacy configs) disables the check.
        require!(
            amount >= self.config.min_amount,
            EscrowError::AmountBelowMinimum
        );

        // The moderators' fees come from the MODERATORS' own quoted prices, never
        // from the caller. The fee used to be an instruction argument, so a
        // caller could pass 0 and have them judge for free.
        //
        // Panel sizes are 0, 1 or 3 — never even, because a tie has no majority
        // and the escrow would be left unsettleable.
        let count = moderators.len();
        require!(
            Panel::is_valid_size(count as u8) && (count == 0) == no_mod,
            EscrowError::InvalidPanelSize
        );

        let mut entries = [PanelEntry::default(); Panel::MAX_SEATS];
        let mut surcharge: u64 = 0;
        // The escrow keeps the price snapshot only for a single-moderator deal;
        // with a panel the per-seat fees on the panel are the record.
        let mut snapshot = (0u16, 0u64, 0u32);
        for (i, account) in moderators.iter().enumerate() {
            let price = ModeratorPrice::load(account, &self.config.settlement_authority)?;
            // V1: settlement has no way to charge by delivered size or refund an
            // unused ceiling yet, so a size-priced moderator is refused rather
            // than silently paid its maximum.
            require!(
                price.fee_per_kb == 0 && price.max_bundle_kb == 0,
                EscrowError::SizePricingNotEnabled
            );
            // One seat each: the same moderator twice would be two votes from
            // one judge, and a "majority" of one.
            require!(
                !entries[..i].iter().any(|e| e.moderator == price.authority),
                EscrowError::DuplicateModerator
            );
            let fee = Escrow::moderation_ceiling(
                amount,
                price.base_bps,
                price.fee_per_kb,
                price.max_bundle_kb,
            )?;
            surcharge = surcharge
                .checked_add(fee)
                .ok_or(EscrowError::MathOverflow)?;
            if count == 1 {
                snapshot = (price.base_bps, price.fee_per_kb, price.max_bundle_kb);
            }
            entries[i] = PanelEntry {
                moderator: price.authority,
                fee,
                vote: VOTE_NONE,
                verdict_hash: [0; 32],
            };
        }

        self.panel.set_inner(Panel {
            version: Panel::VERSION,
            escrow: self.escrow.key(),
            count: count as u8,
            // 1 of 1, or 2 of 3.
            quorum: (count as u8) / 2 + 1,
            entries,
            bump: bumps.panel,
            reserved: [0; 64],
        });

        // Kept on the escrow for the single-moderator fast path; zero when the
        // panel has none or several — the panel is the source of truth.
        let moderator = if count == 1 { entries[0].moderator } else { Pubkey::default() };
        let moderator_count = count as u8;

        let moderator_surcharge = surcharge;

        // Slippage guard. The initiator agreed to a price when it was quoted; the
        // moderator can change its price before this transaction lands. Refuse
        // rather than charge more than they agreed to. This is a LIMIT, not the
        // fee — passing 0 cannot make a moderator work for free, it only makes a
        // moderated escrow impossible to create.
        require!(
            moderator_surcharge <= max_moderator_fee,
            EscrowError::ModeratorFeeAboveMax
        );

        let now = Clock::get()?.unix_timestamp;
        require!(deadline > now, EscrowError::InvalidDeadline);

        // Snapshot the protocol fee from the live config (trustless), applying the
        // floor so tiny contracts still cover the roughly-fixed cost to serve them.
        let bps_fee = (amount as u128)
            .checked_mul(self.config.protocol_fee_bps as u128)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(EscrowError::MathOverflow)? as u64;
        let protocol_fee = bps_fee.max(self.config.protocol_fee_min);

        // The floor doubles as the non-refundable verification fee: the slice of
        // the protocol fee kept once a moderator has actually rendered a verdict,
        // Pass or Fail. Snapshotted like `protocol_fee` so a later config change
        // can't alter an in-flight deal. `<= protocol_fee` by the `max` above.
        //
        // A no-mod escrow never gets a verification, so there is nothing to
        // recover: it pays the protocol fee only.
        let verification_fee = if no_mod {
            0
        } else {
            self.config.protocol_fee_min
        };

        // Total the initiator must deposit: payout + protocol fee + surcharge.
        let total = amount
            .checked_add(protocol_fee)
            .and_then(|v| v.checked_add(moderator_surcharge))
            .ok_or(EscrowError::MathOverflow)?;

        transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                Transfer {
                    from: self.initiator_token_account.to_account_info(),
                    to: self.vault.to_account_info(),
                    authority: self.initiator.to_account_info(),
                },
            ),
            total,
        )?;

        self.escrow.set_inner(Escrow {
            version: Escrow::VERSION,
            config: self.config.key(),
            initiator: self.initiator.key(),
            committer: None,
            mint: self.mint.key(),
            vault: self.vault.key(),
            amount,
            protocol_fee,
            moderator_surcharge,
            moderator_count,
            status: EscrowStatus::Funded,
            outcome: None,
            verdict_hash: [0; 32],
            deliverable_hash: [0; 32],
            deadline,
            created_at: now,
            submitted_at: None,
            contract_id,
            bump: bumps.escrow,
            vault_bump: bumps.vault,
            moderator,
            verification_fee,
            no_mod,
            base_bps: snapshot.0,
            fee_per_kb: snapshot.1,
            max_bundle_kb: snapshot.2,
            panel: self.panel.key(),
            reserved: [0; 41],
        });

        Ok(())
    }
}
