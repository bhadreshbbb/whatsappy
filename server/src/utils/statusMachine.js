export const STATUS_PRIORITY = {
  'active':               1,
  'product_view':         2,
  'product_view_lock':    3,   // user claimed by APV campaign — locked until exit or completion
  'abandoned_cart':       4,
  'abandoned_checkout':   5,
  'followup_complete':    6,
  'product_recommendation': 6, // APV 2-follow-ups done — in recommendation pool
  'purchased':            7,
};

/**
 * Downgrade status — only when cart is fully cleared (no purchase).
 * abandoned_cart/checkout → product_view or active
 * Never touches purchased, followup_complete, or product_recommendation.
 */
export function downgradeStatus(visitor, newStatus) {
  if (!visitor) return false;
  const currentLevel = STATUS_PRIORITY[visitor.status] || 0;
  const targetLevel  = STATUS_PRIORITY[newStatus]      || 0;
  if (currentLevel >= 4 && currentLevel <= 5 && targetLevel < currentLevel) {
    visitor.status     = newStatus;
    visitor.updated_at = new Date().toISOString();
    console.log(`[StatusMachine] Downgrade: ${visitor.phone || visitor.session_id} ${visitor.status} → ${newStatus} (cart cleared)`);
    return true;
  }
  return false;
}

/**
 * Status rules:
 *
 *  FORWARD-ONLY within a cycle:
 *    active → product_view → product_view_lock → abandoned_cart → abandoned_checkout → purchased
 *    Once abandoned_cart is set, product_view/product_view_lock can NEVER override it.
 *
 *  APV RE-ENTRY (product_view_lock → product_view):
 *    If user views a new product while locked in APV campaign, status reverts to
 *    product_view so the campaign picks them up fresh on the next tick.
 *
 *  POST-CYCLE RE-ENTRY:
 *    If user is at followup_complete / product_recommendation / purchased and triggers
 *    product_view or abandoned_cart again → reset status and start a new funnel cycle.
 *    funnel_cycle increments so we know this is their Nth trip through.
 */
export function upgradeStatus(visitor, newStatus) {
  if (!visitor) return false;

  const currentLevel = STATUS_PRIORITY[visitor.status] || 0;
  const targetLevel  = STATUS_PRIORITY[newStatus]      || 0;

  // ── APV RE-ENTRY: product_view overrides product_view_lock ───────────────
  // Fallback path: tracking.controller normally sets product_view_lock directly,
  // but if no APV campaign is active at view time this downgrade still applies.
  if (visitor.status === 'product_view_lock' && newStatus === 'product_view') {
    visitor.status     = 'product_view';
    visitor.updated_at = new Date().toISOString();
    console.log(`[StatusMachine] APV re-entry: ${visitor.phone || visitor.session_id} product_view_lock → product_view`);
    return true;
  }

  // ── POST-CYCLE RE-ENTRY ───────────────────────────────────────────────────
  // User completed a full cycle (followup_complete / product_recommendation / purchased)
  // and is back on the site. Allow status reset so automation can re-target them.
  // Covers: followup_complete (6), product_recommendation (6), purchased (7).
  if (currentLevel >= 6 && targetLevel >= 2 && targetLevel <= 5) {
    visitor.status       = newStatus;
    visitor.funnel_cycle = (visitor.funnel_cycle || 1) + 1;
    visitor.updated_at   = new Date().toISOString();
    console.log(`[StatusMachine] Re-entry cycle ${visitor.funnel_cycle}: ${visitor.phone || visitor.session_id} → ${newStatus}`);
    return true;
  }

  // ── STRICT FORWARD-ONLY ──────────────────────────────────────────────────
  if (targetLevel > currentLevel) {
    visitor.status     = newStatus;
    visitor.updated_at = new Date().toISOString();
    return true;
  }

  return false;
}
