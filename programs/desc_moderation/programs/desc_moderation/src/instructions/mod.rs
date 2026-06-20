// Instruction handlers — one file per instruction, re-exported here (desc_escrow
// pattern). Added in the logic phase:
//
//   pub mod initialize;            // create ModerationConfig (admin)
//   pub mod register_moderator;    // admin registers a mod (wallet + recipient)
//   pub mod set_moderator_active;  // the mod toggles its own active flag
//   pub mod submit_verdict;        // mod signs → CPI desc_escrow::record_verdict
//
//   pub use initialize::*;
//   pub use register_moderator::*;
//   pub use set_moderator_active::*;
//   pub use submit_verdict::*;
