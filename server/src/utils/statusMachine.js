export const STATUS_PRIORITY = {
  'active':             1,
  'product_view':       2,
  'abandoned_cart':     3,
  'abandoned_checkout': 4,
  'followup_complete':  5,
  'purchased':          6,
};

/**
 * Downgrade status — only when cart is fully cleared (no purchase).
 * abandoned_cart/checkout → product_view or active
 * Never touches purchased or followup_complete.
 */
export function downgradeStatus(visitor, newStatus) {
  if (!visitor) return false;
  const currentLevel = STATUS_PRIORITY[visitor.status] || 0;
  const targetLevel  = STATUS_PRIORITY[newStatus]      || 0;
  if (currentLevel >= 3 && currentLevel <= 4 && targetLevel < currentLevel) {
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
 *    active → product_view → abandoned_cart → abandoned_checkout → purchased
 *    Once abandoned_cart is set, product_view can NEVER override it.
 *    Once abandoned_checkout is set, abandoned_cart can NEVER override it.
 *
 *  POST-PURCHASE RE-ENTRY:
 *    If user is purchased/followup_complete and triggers product_view or
 *    abandoned_cart again → reset status and start a new funnel cycle.
 *    funnel_cycle increments so we know this is their Nth trip through.
 *
 *  PURCHASE COUNT:
 *    purchase_count is managed by _markRecovered, not here.
 *    is_repeat_purchaser is set when purchase_count >= 2.
 */
export function upgradeStatus(visitor, newStatus) {
  if (!visitor) return false;

  const currentLevel = STATUS_PRIORITY[visitor.status] || 0;
  const targetLevel  = STATUS_PRIORITY[newStatus]      || 0;

  // ── POST-PURCHASE RE-ENTRY ────────────────────────────────────────────────
  // User completed a purchase cycle and is back on the site.
  // Allow status to reset so automation can re-target them.
  if (currentLevel >= 5 && targetLevel >= 2 && targetLevel <= 4) {
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
