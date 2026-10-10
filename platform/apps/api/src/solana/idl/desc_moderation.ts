/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/desc_moderation.json`.
 */
export type DescModeration = {
  "address": "AHGBmnYQCXJwnKKPixjmt6KAbDjVpMQtETRASzycJ47T",
  "metadata": {
    "name": "descModeration",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "commitVerdict",
      "discriminator": [
        59,
        124,
        35,
        166,
        55,
        64,
        206,
        209
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "relations": [
            "moderator"
          ]
        },
        {
          "name": "verdictAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "config"
              }
            ]
          }
        },
        {
          "name": "moderator",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "escrowConfig"
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "panel",
          "writable": true
        },
        {
          "name": "descEscrowProgram",
          "address": "4Q1jTgR9UVpbbVo57Dx1cpjo77Hx8oBn78ieex4gY2CU"
        }
      ],
      "args": [
        {
          "name": "commit",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "Bootstrap the program config + verdict-authority PDA."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              }
            ]
          }
        },
        {
          "name": "authority",
          "docs": [
            "Not initialized — only its bump is needed, stored in the config."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "config"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "escrowProgram",
          "type": "pubkey"
        },
        {
          "name": "minVerdicts",
          "type": "u8"
        }
      ]
    },
    {
      "name": "registerModerator",
      "docs": [
        "Admin registers a moderator (wallet + on-chain recipient + label + price)."
      ],
      "discriminator": [
        159,
        28,
        33,
        150,
        199,
        174,
        232,
        242
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              }
            ]
          }
        },
        {
          "name": "moderator",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "authority",
          "type": "pubkey"
        },
        {
          "name": "recipient",
          "type": "string"
        },
        {
          "name": "label",
          "type": "string"
        },
        {
          "name": "baseBps",
          "type": "u16"
        },
        {
          "name": "feePerKb",
          "type": "u64"
        },
        {
          "name": "maxBundleKb",
          "type": "u32"
        }
      ]
    },
    {
      "name": "setModeratorActive",
      "docs": [
        "A moderator pauses/resumes itself."
      ],
      "discriminator": [
        244,
        121,
        121,
        96,
        6,
        232,
        143,
        11
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "moderator"
          ]
        },
        {
          "name": "moderator",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "active",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setTiebreaker",
      "discriminator": [
        144,
        40,
        129,
        35,
        215,
        16,
        81,
        139
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              }
            ]
          },
          "relations": [
            "moderator"
          ]
        },
        {
          "name": "moderator",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "isTiebreaker",
          "type": "bool"
        }
      ]
    },
    {
      "name": "submitTiebreak",
      "discriminator": [
        42,
        92,
        209,
        11,
        13,
        199,
        101,
        62
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "config",
          "relations": [
            "moderator"
          ]
        },
        {
          "name": "verdictAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "config"
              }
            ]
          }
        },
        {
          "name": "moderator",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "escrowConfig"
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "panel",
          "writable": true
        },
        {
          "name": "replacedReputation",
          "writable": true
        },
        {
          "name": "descEscrowProgram",
          "address": "4Q1jTgR9UVpbbVo57Dx1cpjo77Hx8oBn78ieex4gY2CU"
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "outcome"
            }
          }
        },
        {
          "name": "verdictHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "submitVerdict",
      "docs": [
        "A registered, active moderator records a verdict → CPI into the escrow."
      ],
      "discriminator": [
        138,
        102,
        56,
        22,
        229,
        130,
        105,
        118
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "The moderator's own wallet."
          ],
          "signer": true
        },
        {
          "name": "config",
          "docs": [
            "Authenticated via the moderator's `has_one = config`."
          ],
          "relations": [
            "moderator"
          ]
        },
        {
          "name": "verdictAuthority",
          "docs": [
            "The escrow's settlement authority. Signs the CPI; holds no data."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "config"
              }
            ]
          }
        },
        {
          "name": "moderator",
          "docs": [
            "Must be active and bound to `config` + signer."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "escrowConfig",
          "docs": [
            "Its `settlement_authority` must equal `verdict_authority` — enforced",
            "inside `record_verdict`."
          ]
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "panel",
          "docs": [
            "The escrow program checks the seat and tallies; this only forwards it."
          ],
          "writable": true
        },
        {
          "name": "descEscrowProgram",
          "address": "4Q1jTgR9UVpbbVo57Dx1cpjo77Hx8oBn78ieex4gY2CU"
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": {
            "defined": {
              "name": "outcome"
            }
          }
        },
        {
          "name": "verdictHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "updateModeratorPricing",
      "docs": [
        "A moderator sets its own price. Live escrows keep the price they snapshotted."
      ],
      "discriminator": [
        232,
        234,
        39,
        19,
        159,
        232,
        226,
        124
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "moderator"
          ]
        },
        {
          "name": "moderator",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  100,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "baseBps",
          "type": "u16"
        },
        {
          "name": "feePerKb",
          "type": "u64"
        },
        {
          "name": "maxBundleKb",
          "type": "u32"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "escrow",
      "discriminator": [
        31,
        213,
        123,
        187,
        186,
        22,
        218,
        155
      ]
    },
    {
      "name": "moderationConfig",
      "discriminator": [
        20,
        180,
        54,
        96,
        191,
        141,
        52,
        148
      ]
    },
    {
      "name": "moderator",
      "discriminator": [
        130,
        201,
        20,
        55,
        202,
        167,
        143,
        128
      ]
    },
    {
      "name": "moderatorReputation",
      "discriminator": [
        175,
        32,
        46,
        220,
        208,
        191,
        165,
        208
      ]
    },
    {
      "name": "panel",
      "discriminator": [
        223,
        223,
        14,
        220,
        233,
        57,
        156,
        38
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not a registered, active moderator"
    },
    {
      "code": 6001,
      "name": "stringTooLong",
      "msg": "Recipient or label exceeds the maximum length"
    },
    {
      "code": 6002,
      "name": "invalidMinVerdicts",
      "msg": "V1 supports only min_verdicts == 1"
    },
    {
      "code": 6003,
      "name": "baseBpsTooHigh",
      "msg": "Moderator base fee exceeds the maximum allowed"
    },
    {
      "code": 6004,
      "name": "sizePricingWithoutLimit",
      "msg": "A per-KB price needs a maximum bundle size"
    },
    {
      "code": 6005,
      "name": "notATiebreaker",
      "msg": "Signer is not a registered tiebreaker"
    }
  ],
  "types": [
    {
      "name": "config",
      "docs": [
        "Global protocol config (PDA, seeds = [b\"config\", authority]).",
        "",
        "Seeded with `authority`, so it is deterministic per-admin rather than a",
        "squattable singleton — and so the admin cannot be rotated in place.",
        "`settlement_authority` is a field, not a seed, so that one rotates freely."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "authority",
            "docs": [
              "Admin. Also part of the PDA seed."
            ],
            "type": "pubkey"
          },
          {
            "name": "settlementAuthority",
            "docs": [
              "Who may record a verdict. `bootstrap` points this at the",
              "`desc_moderation` verdict-authority PDA, so moderators settle by CPI and",
              "no platform keypair can."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Destination for the protocol fee."
            ],
            "type": "pubkey"
          },
          {
            "name": "protocolFeeBps",
            "docs": [
              "Base protocol fee in basis points (200 = 2%)."
            ],
            "type": "u16"
          },
          {
            "name": "paused",
            "docs": [
              "Global kill-switch — blocks new escrows / settlements when true."
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "protocolFeeMin",
            "docs": [
              "Fee floor: the fee charged is `max(bps of amount, this)`, so tiny",
              "contracts still cover a roughly-fixed cost. Zero disables it."
            ],
            "type": "u64"
          },
          {
            "name": "minAmount",
            "docs": [
              "Smallest contract the protocol will escrow. Pairs with",
              "`protocol_fee_min`: below the crossover the floor is a rising share of a",
              "shrinking contract. Zero disables it."
            ],
            "type": "u64"
          },
          {
            "name": "verdictWindow",
            "docs": [
              "Seconds per moderation phase. Zero = `Escrow::DEFAULT_VERDICT_WINDOW`."
            ],
            "type": "i64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                40
              ]
            }
          }
        ]
      }
    },
    {
      "name": "escrow",
      "docs": [
        "Per-deal escrow (PDA, seeds = [b\"escrow\", initiator, contract_id]).",
        "",
        "Records the money, the lifecycle and audit hashes. Everything subjective —",
        "verdict reasoning, deliverable contents, criteria — stays off-chain."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "config",
            "docs": [
              "The governing `Config`. Bound at creation, but read live, so",
              "`settlement_authority` and `treasury` stay rotatable."
            ],
            "type": "pubkey"
          },
          {
            "name": "initiator",
            "type": "pubkey"
          },
          {
            "name": "committer",
            "docs": [
              "None until a committer accepts the shareable link."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "PDA token account holding the deposit."
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Payout to the committer on success."
            ],
            "type": "u64"
          },
          {
            "name": "protocolFee",
            "docs": [
              "Snapshotted at creation, so a later `Config` change cannot alter the",
              "terms of a live deal."
            ],
            "type": "u64"
          },
          {
            "name": "moderatorSurcharge",
            "docs": [
              "What the panel earns in total — the sum of each seat's own fee, never one",
              "fee divided up. Every moderator runs the whole check, so each is paid in",
              "full and `n` moderators cost `n ×` the rate."
            ],
            "type": "u64"
          },
          {
            "name": "moderatorCount",
            "docs": [
              "Seats on the panel: 0 (no-mod), 1 or 3."
            ],
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "escrowStatus"
              }
            }
          },
          {
            "name": "outcome",
            "docs": [
              "None until a verdict is attested."
            ],
            "type": {
              "option": {
                "defined": {
                  "name": "outcome"
                }
              }
            }
          },
          {
            "name": "verdictHash",
            "docs": [
              "sha256 of the verdict acted on. Zeroed until recorded."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "deliverableHash",
            "docs": [
              "sha256 of the submitted deliverable. Zeroed until submitted."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "deadline",
            "docs": [
              "Submission deadline. Governs the ghosting refund only."
            ],
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "submittedAt",
            "docs": [
              "Off-chain SLA clock; never used as an on-chain timer."
            ],
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "contractId",
            "docs": [
              "Links to the off-chain contract; also part of the PDA seed."
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "moderator",
            "docs": [
              "Set only on a ONE-seat escrow. `Pubkey::default()` on a panel of three",
              "and on no-mod — read `panel` instead."
            ],
            "type": "pubkey"
          },
          {
            "name": "verificationFee",
            "docs": [
              "The non-refundable slice of `protocol_fee`. Charged whenever a moderator",
              "actually rendered a verdict, so the protocol recovers the cost of a Fail",
              "without profiting from one. Zero means the old fee-on-Pass-only",
              "behaviour.",
              "",
              "Invariant: `verification_fee <= protocol_fee`."
            ],
            "type": "u64"
          },
          {
            "name": "noMod",
            "docs": [
              "Initiator opted out of moderation. `submit` then records a Pass straight",
              "away: no moderator, no surcharge, no verification fee."
            ],
            "type": "bool"
          },
          {
            "name": "baseBps",
            "type": "u16"
          },
          {
            "name": "feePerKb",
            "docs": [
              "Always 0 until size pricing ships."
            ],
            "type": "u64"
          },
          {
            "name": "maxBundleKb",
            "docs": [
              "0 = no limit."
            ],
            "type": "u32"
          },
          {
            "name": "panel",
            "docs": [
              "This escrow's `Panel`. One exists for every escrow, including no-mod",
              "(`count == 0`), so settlement has a single shape to handle."
            ],
            "type": "pubkey"
          },
          {
            "name": "verdictWindow",
            "docs": [
              "Snapshotted from `Config` so a config change can't move a live deadline."
            ],
            "type": "i64"
          },
          {
            "name": "commitDeadline",
            "docs": [
              "Panel of 1: the vote deadline."
            ],
            "type": "i64"
          },
          {
            "name": "revealDeadline",
            "docs": [
              "Panel of 1: equals `commit_deadline`."
            ],
            "type": "i64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                17
              ]
            }
          }
        ]
      }
    },
    {
      "name": "escrowStatus",
      "docs": [
        "On-chain lifecycle — only the transitions that move money. The richer",
        "off-chain states (draft, under_verification, disputed) have no on-chain form.",
        "",
        "Invariant: once `Submitted`, funds are frozen until a verdict is recorded.",
        "The deadline stops applying from that point."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "funded"
          },
          {
            "name": "active"
          },
          {
            "name": "submitted"
          },
          {
            "name": "settled"
          },
          {
            "name": "refunded"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "moderationConfig",
      "docs": [
        "Program config (PDA, seeds = [b\"config\", admin]).",
        "",
        "Seeded with `admin`, so it is per-platform rather than a squattable",
        "singleton. It is the root of the verdict-authority chain: the escrow's",
        "`settlement_authority` is this program's `[b\"authority\", config]` signer PDA,",
        "so the only way to record a verdict is through here — and the only way to",
        "make it act is a registered moderator's signature."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "admin",
            "docs": [
              "May `register_moderator`. Also part of the PDA seed."
            ],
            "type": "pubkey"
          },
          {
            "name": "escrowProgram",
            "docs": [
              "The `desc_escrow` program this config authorizes verdicts for."
            ],
            "type": "pubkey"
          },
          {
            "name": "minVerdicts",
            "docs": [
              "Verdicts required to settle. Panel consensus lives on the escrow's",
              "`Panel`; this stays 1."
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "authorityBump",
            "docs": [
              "Bump of the `[b\"authority\", config]` signer PDA, stored so",
              "`submit_verdict` can sign the CPI."
            ],
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "moderator",
      "docs": [
        "A registered moderator (PDA, seeds = [b\"moderator\", authority]).",
        "",
        "One per moderator wallet: its signing identity, its public encryption key",
        "(so the CHAIN decides what committers seal deliverables to), and an active",
        "flag the moderator controls itself.",
        "",
        "Registered by the platform admin today; permissionless stake-gated",
        "registration is V2, carved from `reserved`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "config",
            "docs": [
              "Bound at registration, so a verdict cannot be signed under a different",
              "config."
            ],
            "type": "pubkey"
          },
          {
            "name": "authority",
            "docs": [
              "The moderator's own wallet. Signs `set_moderator_active` and",
              "`submit_verdict`. Also part of the PDA seed."
            ],
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "docs": [
              "Public `age` recipient. On-chain so nobody can swap a moderator's key."
            ],
            "type": "string"
          },
          {
            "name": "label",
            "type": "string"
          },
          {
            "name": "active",
            "docs": [
              "Toggled by the moderator itself."
            ],
            "type": "bool"
          },
          {
            "name": "registeredAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "baseBps",
            "type": "u16"
          },
          {
            "name": "feePerKb",
            "docs": [
              "Must be 0 until size pricing ships."
            ],
            "type": "u64"
          },
          {
            "name": "maxBundleKb",
            "docs": [
              "0 = no limit. Must be 0 until size pricing ships."
            ],
            "type": "u32"
          },
          {
            "name": "isTiebreaker",
            "docs": [
              "Read raw by `desc_escrow` — keep it directly after the pricing fields."
            ],
            "type": "bool"
          },
          {
            "name": "reserved",
            "docs": [
              "V2: stake, slashing history. Reputation lives in `desc_escrow`, which is",
              "where the outcome and the panel's votes are."
            ],
            "type": {
              "array": [
                "u8",
                49
              ]
            }
          }
        ]
      }
    },
    {
      "name": "moderatorReputation",
      "docs": [
        "A moderator's lifetime record (PDA, seeds = [b\"mod_rep\", moderator]).",
        "",
        "Counters only — no authority, no funds. Written exclusively by `release` /",
        "`refund`, as each panel seat is paid.",
        "",
        "It lives here and not beside `Moderator` in `desc_moderation` because that",
        "program already depends on this crate to CPI into `record_verdict`; the",
        "reverse would be circular.",
        "",
        "It has to exist because settlement CLOSES the escrow and the panel, and",
        "neither program emits events — so without it the chain keeps no record that",
        "a deal happened, and a moderator's track record would be our database's word."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "moderator",
            "docs": [
              "The wallet this scores. Also the PDA seed."
            ],
            "type": "pubkey"
          },
          {
            "name": "verdictsCast",
            "docs": [
              "Verdicts paid on any panel size. Volume, and cheap to inflate — a",
              "moderator can seat itself on contracts it creates. Never show alone."
            ],
            "type": "u32"
          },
          {
            "name": "panelVerdicts",
            "docs": [
              "Verdicts on a panel of three or more: the accuracy denominator."
            ],
            "type": "u32"
          },
          {
            "name": "majorityAgreements",
            "docs": [
              "Of those, how many matched the outcome the panel settled on."
            ],
            "type": "u32"
          },
          {
            "name": "failVotes",
            "docs": [
              "How many of ALL votes were Fail — failing everything earns the same fee",
              "for near-zero work, so the bias is worth seeing before there is any",
              "stake to slash for it."
            ],
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "missed",
            "docs": [
              "Never voted in time. Counted so withholding a reveal can't protect a record."
            ],
            "type": "u32"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                44
              ]
            }
          }
        ]
      }
    },
    {
      "name": "outcome",
      "docs": [
        "The verdict, attested by the settlement authority. The authority only",
        "*records* it; the parties execute the transfer, so payout never depends on",
        "the authority being online."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pass"
          },
          {
            "name": "fail"
          },
          {
            "name": "inconclusive"
          }
        ]
      }
    },
    {
      "name": "panel",
      "docs": [
        "The moderators judging one escrow (PDA, seeds = [b\"panel\", escrow]).",
        "",
        "Separate from the escrow because three pubkeys plus votes outgrow its",
        "remaining `reserved` space. One exists per escrow, including no-mod",
        "(`count == 0`), so settlement has a single shape to handle. Rent is paid by",
        "the initiator and returned to it when the panel closes on settle."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "escrow",
            "type": "pubkey"
          },
          {
            "name": "count",
            "docs": [
              "Seats filled: 0 (no-mod), 1 or 3. Never even above zero — a tie has no",
              "majority."
            ],
            "type": "u8"
          },
          {
            "name": "quorum",
            "docs": [
              "Votes needed to decide: `count / 2 + 1`. Snapshotted so a later rule",
              "change cannot move the goalposts on a live deal."
            ],
            "type": "u8"
          },
          {
            "name": "entries",
            "docs": [
              "Only the first `count` are used."
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "panelEntry"
                  }
                },
                3
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "tiebreakFills",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                63
              ]
            }
          }
        ]
      }
    },
    {
      "name": "panelEntry",
      "docs": [
        "One moderator's seat: who, what they are owed, and how they voted."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "moderator",
            "type": "pubkey"
          },
          {
            "name": "fee",
            "docs": [
              "Snapshotted at creation; paid only if it votes. A tiebreaker inherits it."
            ],
            "type": "u64"
          },
          {
            "name": "vote",
            "type": "u8"
          },
          {
            "name": "verdictHash",
            "docs": [
              "The commit hash while `VOTE_COMMITTED`, the verdict hash once revealed."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    }
  ]
};
