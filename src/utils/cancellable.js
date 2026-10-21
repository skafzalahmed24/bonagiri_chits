/**
 * Money entries are cancelled, never erased (docs/MONEY_FLOW_BATCH2_3.md §2.2).
 * Models spread `cancelFields` into their attributes and `cancelScopes` into their
 * options: the default scope hides cancelled rows, so every total, report and balance
 * check skips them without per-query changes. Use `Model.unscoped()` to see them.
 */
const cancelFields = (DataTypes) => ({
  is_cancelled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  cancelled_at: { type: DataTypes.DATE, allowNull: true },
  cancelled_by_id: { type: DataTypes.STRING, allowNull: true },
  cancelled_by_name: { type: DataTypes.STRING, allowNull: true },
  cancel_reason: { type: DataTypes.TEXT, allowNull: true },
});

const cancelScopes = {
  defaultScope: { where: { is_cancelled: false } },
};

/** Fields to stamp on a row when it is cancelled. */
const cancelStamp = (user, reason) => ({
  is_cancelled: true,
  cancelled_at: new Date(),
  cancelled_by_id: user ? String(user.id) : null,
  cancelled_by_name: user ? user.display_name || null : null,
  cancel_reason: reason,
});

/** 'all' | 'cancelled' | 'active' (default) → which rows a list shows. */
const statusFilter = (status) => (status === 'cancelled' ? { is_cancelled: true } : status === 'all' ? {} : { is_cancelled: false });

module.exports = { cancelFields, cancelScopes, cancelStamp, statusFilter };
