/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/desc_escrow.json`.
 */
export type DescEscrow = {
  "address": "4Q1jTgR9UVpbbVo57Dx1cpjo77Hx8oBn78ieex4gY2CU",
  "metadata": {
    "name": "descEscrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "accept",
      "discriminator": [
        65,
        150,
        70,
        216,
        133,
        6,
        107,
        4
      ],
      "accounts": [
        {
          "name": "committer",
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.initiator",
                "account": "escrow"
              },
              {
                "kind": "account",
                "path": "escrow.contract_id",
                "account": "escrow"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancel",
      "discriminator": [
        232,
        219,
        223,
        41,
        219,
        236,
        220,
        190
      ],
      "accounts": [
        {
          "name": "initiator",
          "writable": true,
          "signer": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "initiator"
              },
              {
                "kind": "account",
                "path": "escrow.contract_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "initiatorTokenAccount",
          "docs": [
            "Refund destination — the initiator's USDC account."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createEscrow",
      "discriminator": [
        253,
        215,
        165,
        116,
        36,
        108,
        68,
        80
      ],
      "accounts": [
        {
          "name": "initiator",
          "writable": true,
          "signer": true
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
                "path": "config.authority",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "initiator"
              },
              {
                "kind": "arg",
                "path": "contractId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "Program-owned vault (PDA token account) that holds the deposit."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "escrow"
              }
            ]
          }
        },
        {
          "name": "initiatorTokenAccount",
          "docs": [
            "Initiator's USDC account funding the deposit."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "contractId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "moderatorCount",
          "type": "u8"
        },
        {
          "name": "moderatorSurcharge",
          "type": "u64"
        },
        {
          "name": "deadline",
          "type": "i64"
        },
        {
          "name": "noMod",
          "type": "bool"
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "authority",
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
          "name": "settlementAuthority",
          "type": "pubkey"
        },
        {
          "name": "treasury",
          "type": "pubkey"
        },
        {
          "name": "protocolFeeBps",
          "type": "u16"
        },
        {
          "name": "protocolFeeMin",
          "type": "u64"
        },
        {
          "name": "minAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "mutualCancel",
      "discriminator": [
        195,
        16,
        91,
        169,
        226,
        250,
        251,
        154
      ],
      "accounts": [
        {
          "name": "initiator",
          "writable": true,
          "signer": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "committer",
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "initiator"
              },
              {
                "kind": "account",
                "path": "escrow.contract_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "initiatorTokenAccount",
          "docs": [
            "Refund destination — the initiator's USDC account."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "recordVerdict",
      "discriminator": [
        251,
        187,
        180,
        218,
        5,
        165,
        217,
        150
      ],
      "accounts": [
        {
          "name": "settlementAuthority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.initiator",
                "account": "escrow"
              },
              {
                "kind": "account",
                "path": "escrow.contract_id",
                "account": "escrow"
              }
            ]
          }
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
        },
        {
          "name": "moderator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "refund",
      "discriminator": [
        2,
        96,
        183,
        251,
        63,
        208,
        46,
        46
      ],
      "accounts": [
        {
          "name": "initiator",
          "writable": true,
          "signer": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "initiator"
              },
              {
                "kind": "account",
                "path": "escrow.contract_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "config",
          "docs": [
            "Bound via `escrow.config` — supplies the treasury the verification fee",
            "goes to (read live, like `release` does)."
          ],
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "initiatorTokenAccount",
          "docs": [
            "Refund destination — the initiator's USDC account."
          ],
          "writable": true
        },
        {
          "name": "treasury",
          "docs": [
            "Protocol treasury token account — receives the verification fee on a Fail.",
            "Always required (it's bound by the config) even on a ghost-timeout, where",
            "nothing is transferred to it."
          ],
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "moderatorTokenAccount",
          "docs": [
            "On a Fail verdict, the judging moderator's USDC account — receives the",
            "surcharge. Omit on a ghost-timeout (no verdict, no moderator paid)."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "release",
      "discriminator": [
        253,
        249,
        15,
        206,
        28,
        127,
        193,
        241
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.initiator",
                "account": "escrow"
              },
              {
                "kind": "account",
                "path": "escrow.contract_id",
                "account": "escrow"
              }
            ]
          }
        },
        {
          "name": "config",
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "committerTokenAccount",
          "docs": [
            "Committer's USDC account — receives the payout."
          ],
          "writable": true
        },
        {
          "name": "treasury",
          "docs": [
            "Protocol treasury token account — receives the protocol fee."
          ],
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "moderatorTokenAccount",
          "docs": [
            "The judging moderator's USDC account — receives the surcharge (its reward).",
            "Bound to the moderator that `record_verdict` stored. Omit on a no-mod",
            "escrow, where nobody judged and there is no surcharge to pay."
          ],
          "writable": true,
          "optional": true
        },
        {
          "name": "initiator",
          "docs": [
            "Initiator — receives the vault's rent on close."
          ],
          "writable": true,
          "relations": [
            "escrow"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "submit",
      "discriminator": [
        88,
        166,
        102,
        181,
        162,
        127,
        170,
        48
      ],
      "accounts": [
        {
          "name": "committer",
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow.initiator",
                "account": "escrow"
              },
              {
                "kind": "account",
                "path": "escrow.contract_id",
                "account": "escrow"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "deliverableHash",
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
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
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
                "path": "authority"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "settlementAuthority",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "treasury",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "protocolFeeBps",
          "type": {
            "option": "u16"
          }
        },
        {
          "name": "protocolFeeMin",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "minAmount",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "paused",
          "type": {
            "option": "bool"
          }
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
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidFeeBps",
      "msg": "Protocol fee exceeds the maximum allowed"
    },
    {
      "code": 6001,
      "name": "protocolPaused",
      "msg": "Protocol is paused"
    },
    {
      "code": 6002,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6003,
      "name": "invalidDeadline",
      "msg": "Deadline must be in the future"
    },
    {
      "code": 6004,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6005,
      "name": "invalidStatus",
      "msg": "Escrow is not in the required state for this action"
    },
    {
      "code": 6006,
      "name": "selfDeal",
      "msg": "Initiator and committer must be different"
    },
    {
      "code": 6007,
      "name": "unauthorized",
      "msg": "Signer is not authorized for this action"
    },
    {
      "code": 6008,
      "name": "deadlinePassed",
      "msg": "The deadline has passed"
    },
    {
      "code": 6009,
      "name": "invalidFeeMin",
      "msg": "Minimum protocol fee exceeds the maximum allowed"
    },
    {
      "code": 6010,
      "name": "amountBelowMinimum",
      "msg": "Amount is below the protocol minimum for a contract"
    },
    {
      "code": 6011,
      "name": "feeFloorAboveMinimum",
      "msg": "Fee floor exceeds the minimum contract amount"
    },
    {
      "code": 6012,
      "name": "moderatorConfigMismatch",
      "msg": "Moderator count and surcharge do not match the escrow's moderation mode"
    }
  ],
  "types": [
    {
      "name": "config",
      "docs": [
        "Global protocol config (PDA, seeds = [b\"config\", authority]).",
        "",
        "Seeded with `authority` so the config is deterministic per-admin and not a",
        "squattable global singleton. Holds protocol-level parameters so fees,",
        "treasury, the settlement authority, and the kill-switch can change without",
        "redeploying the program.",
        "",
        "Note: because `authority` is part of the seed, the top-level admin cannot be",
        "rotated in place (the PDA address would change). `settlement_authority` is a",
        "field, not a seed, so it rotates freely — which is what the V1->V2 seam needs.",
        "",
        "Backward-compat discipline:",
        "- `version` is the first field (byte 8) for version dispatch / migrations.",
        "- `reserved` is the LAST field. New fields are inserted immediately before",
        "it and shrink it by their exact size, so the account size stays constant",
        "(no `realloc`). Freed bytes are zeroed, so an added `Option<T>` reads None."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "docs": [
              "Schema version of this account. Set to `VERSION` at init."
            ],
            "type": "u8"
          },
          {
            "name": "authority",
            "docs": [
              "Admin — may update this config. Also part of the PDA seed."
            ],
            "type": "pubkey"
          },
          {
            "name": "settlementAuthority",
            "docs": [
              "Key authorized to call `release` / `refund` on an escrow.",
              "",
              "V1: the platform backend key, acting on the off-chain aggregated verdict.",
              "V2: swapped (via `update_config`) to a PDA of the `desc_moderation`",
              "program, so on-chain moderator consensus settles escrows via CPI. The",
              "escrow accounts never change — this indirection is the V1->V2 seam."
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
              "Minimum protocol fee in token base units. The fee charged is",
              "`max(protocol_fee_bps of amount, protocol_fee_min)` — a floor so tiny",
              "contracts still cover the roughly-fixed cost to serve them. Zero disables",
              "the floor (old configs, whose `reserved` was zeroed, read 0 → no floor)."
            ],
            "type": "u64"
          },
          {
            "name": "minAmount",
            "docs": [
              "Smallest contract `amount` the protocol will escrow, in token base units.",
              "",
              "Pairs with `protocol_fee_min`: below the crossover point the floor is a",
              "rising share of a shrinking contract, so a minimum keeps the effective",
              "fee rate sane (at 200 bps + a $1 floor, $50 is where they meet). Zero",
              "disables the minimum — including for configs created before this field",
              "existed, whose `reserved` was zeroed."
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "Forward-compat padding. Carve new fields from here."
            ],
            "type": {
              "array": [
                "u8",
                48
              ]
            }
          }
        ]
      }
    },
    {
      "name": "escrow",
      "docs": [
        "Per-deal escrow account (PDA, seeds = [b\"escrow\", initiator, contract_id]).",
        "",
        "Holds the funds-relevant state for one contract. Subjective data (the",
        "verdict reasoning, deliverable contents, criteria, moderator identities)",
        "stays off-chain in V1; this account records only the money, the lifecycle,",
        "and audit hashes of what was submitted and what verdict was acted on.",
        "",
        "Backward-compat discipline:",
        "- `version` is the first field (byte 8) for version dispatch / migrations.",
        "- `reserved` is the LAST field. New fields are inserted immediately before",
        "it and shrink it by their exact size, so the account size stays constant",
        "(no `realloc`). Freed bytes are zeroed, so an added `Option<T>` reads None."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "docs": [
              "Schema version of this account. Set to `VERSION` at init."
            ],
            "type": "u8"
          },
          {
            "name": "config",
            "docs": [
              "The protocol `Config` governing this escrow. Bound at creation so later",
              "instructions load the *current* `settlement_authority` / `treasury` live",
              "(keeping `settlement_authority` rotatable — the V1->V2 seam)."
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
              "None until the shareable link is accepted by a committer."
            ],
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "mint",
            "docs": [
              "USDC mint used for this deal."
            ],
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "PDA token account holding the deposited funds."
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Payout to the committer on success (USDC, 1e6 base units)."
            ],
            "type": "u64"
          },
          {
            "name": "protocolFee",
            "docs": [
              "Protocol fee, snapshotted at creation so a later Config change can't",
              "alter the agreed terms of an in-flight deal."
            ],
            "type": "u64"
          },
          {
            "name": "moderatorSurcharge",
            "docs": [
              "Total surcharge flowing to moderator operators."
            ],
            "type": "u64"
          },
          {
            "name": "moderatorCount",
            "docs": [
              "Number of moderators, set by the protocol from contract value."
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
              "Set by `record_verdict`; None until a verdict is attested."
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
              "Hash of the aggregated verdict JSON the settlement acted on (zeroed until",
              "recorded). On-chain audit trail for the \"neutral trust layer\"."
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
              "Hash of the deliverable the committer submitted (zeroed until submitted)."
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
              "Unix timestamp — submission deadline. Governs the ghosting refund only."
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
              "When the committer submitted (None until `Submitted`). Off-chain SLA",
              "clock starts here; not used as an on-chain timer."
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
              "The moderator that recorded the verdict (set by `record_verdict`; zeroed",
              "until then). Receives the `moderator_surcharge` (its reward) on settle —",
              "on `release` (Pass) or `refund` (Fail). Carved from `reserved`."
            ],
            "type": "pubkey"
          },
          {
            "name": "verificationFee",
            "docs": [
              "The non-refundable slice of `protocol_fee`, snapshotted at creation from",
              "`Config::protocol_fee_min`.",
              "",
              "Cost recovery for the verification itself: charged to the treasury",
              "whenever a moderator actually rendered a verdict — on `release` (Pass, as",
              "part of the full fee) and on `refund` (Fail, this slice only). The rest of",
              "`protocol_fee` goes back to the initiator on a Fail, so the protocol never",
              "*profits* from a failed deal but is never paid to *pass* one either.",
              "",
              "Zero when no floor is configured, and for escrows created before this",
              "field existed (their `reserved` was zeroed) — both mean \"charge nothing on",
              "a Fail\", i.e. the old fee-on-Pass-only behaviour. Carved from `reserved`.",
              "",
              "Invariant: `verification_fee <= protocol_fee`, since",
              "`protocol_fee = max(bps_fee, protocol_fee_min)`."
            ],
            "type": "u64"
          },
          {
            "name": "noMod",
            "docs": [
              "This escrow runs WITHOUT verification: the initiator opted out of",
              "moderation at creation, accepting the risk. `submit` then records a Pass",
              "straight away — there is no moderator, no surcharge, and no verification",
              "fee. Immutable once set; both parties can see it.",
              "",
              "Zero (false) for escrows created before this field existed, which is the",
              "moderated behaviour. Carved from `reserved`."
            ],
            "type": "bool"
          },
          {
            "name": "reserved",
            "docs": [
              "Forward-compat padding so V2 fields (e.g. `parent`, `moderation_account`,",
              "`dispute_account`) can be added without a risky `realloc`. Carve new",
              "fields from here; keep this the LAST field."
            ],
            "type": {
              "array": [
                "u8",
                87
              ]
            }
          }
        ]
      }
    },
    {
      "name": "escrowStatus",
      "docs": [
        "On-chain lifecycle of an escrow — only the transitions that move money.",
        "",
        "The richer off-chain contract states (draft, under_verification, disputed)",
        "have no on-chain representation.",
        "",
        "Invariant: once `Submitted`, funds are frozen until a verdict is recorded —",
        "the deadline is irrelevant from that point. Pass -> committer, Fail ->",
        "initiator, and nothing else can move the money.",
        "",
        "APPEND-ONLY: borsh indexes variants by declaration order. New variants (e.g.",
        "a future `Disputed`) must be added at the END — never reorder or insert."
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
      "name": "outcome",
      "docs": [
        "Aggregated verdict result, attested on-chain by the settlement authority.",
        "The authority only *records* this; the parties themselves execute the",
        "transfer (so payout never depends on the authority being online).",
        "",
        "APPEND-ONLY: add new variants at the END only (see `EscrowStatus`)."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pass"
          },
          {
            "name": "fail"
          }
        ]
      }
    }
  ]
};
