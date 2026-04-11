const STATUS_LEVELS = {
  'active': 1,
  'product_view': 2,
  'abandoned_cart': 3,
  'abandoned_checkout': 4,
  'followup_complete': 5,
  'purchased': 6,
};

/**
 * Ensures strict forward-only progression of user status.
 * Returns true if status was successfully upgraded, false otherwise.
 */
export function upgradeStatus(visitor, newStatus) {
  if (!visitor) return false;
  
  const currentLevel = STATUS_LEVELS[visitor.status] || 0;
  const targetLevel = STATUS_LEVELS[newStatus] || 0;
  
  // ── FUNNEL RE-ENTRY (Looping back) ──
  // If a user has finished everything (is in the Infinite Loop or is a Past Purchaser)
  // and they come BACK to the website and trigger a new abandonment event, 
  // pull them out of the infinite loop and restart the aggressive followups!
  if (currentLevel >= 5 && targetLevel >= 2 && targetLevel <= 4) {
    visitor.status = newStatus;
    visitor.updated_at = new Date().toISOString();
    return true;
  }

  // ── STRICT FORWARD-ONLY FUNNEL ──
  if (targetLevel > currentLevel) {
    visitor.status = newStatus;
    visitor.updated_at = new Date().toISOString();
    return true;
  }
  
  return false;
}
