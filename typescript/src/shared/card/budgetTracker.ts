import { CardTransaction, SpendingLimits } from '@/shared/types';

export interface SpendingCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface BudgetStatus {
  currency: string;
  totalBudgetLimit: number;
  totalSpent: number;
  remainingBudget: number;
  dailyLimit?: number;
  dailySpent: number;
  remainingToday?: number;
  perTransactionLimit: number;
  requireApprovalAbove?: number;
  allowedCategories?: string[];
  transactionCount: number;
}

/**
 * Tracks corporate card spending and enforces the configured SpendingLimits.
 * A single BudgetTracker instance is shared across all card tools within a
 * session so that limits are evaluated against the cumulative spend.
 */
export class BudgetTracker {
  private totalSpent = 0;
  private readonly dailySpent = new Map<string, number>();
  private readonly transactions: CardTransaction[] = [];

  /** Returns today's date key in YYYY-MM-DD (UTC). */
  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Returns the total amount spent across all approved transactions. */
  getTotalSpent(): number {
    return this.totalSpent;
  }

  /** Returns the total approved spend for the current calendar day (UTC). */
  getDailySpent(): number {
    return this.dailySpent.get(this.todayKey()) ?? 0;
  }

  /**
   * Checks whether a new transaction is permitted under the given limits.
   * Does NOT record the transaction; call `record()` after a successful
   * authorisation.
   */
  canSpend(
    amount: number,
    category: string,
    limits: SpendingLimits
  ): SpendingCheckResult {
    const currency = limits.currency ?? 'USD';

    if (amount <= 0) {
      return { allowed: false, reason: 'Amount must be greater than zero.' };
    }

    // Per-transaction ceiling
    if (amount > limits.perTransactionLimit) {
      return {
        allowed: false,
        reason: `Amount ${amount} ${currency} exceeds the per-transaction limit of ${limits.perTransactionLimit} ${currency}.`,
      };
    }

    // Human-approval threshold
    if (
      limits.requireApprovalAbove !== undefined &&
      amount >= limits.requireApprovalAbove
    ) {
      return {
        allowed: false,
        reason: `Amount ${amount} ${currency} meets or exceeds the approval threshold of ${limits.requireApprovalAbove} ${currency}. Human approval is required before this purchase can proceed.`,
      };
    }

    // Category allowlist
    if (
      limits.allowedCategories !== undefined &&
      limits.allowedCategories.length > 0
    ) {
      const normalised = category.trim().toLowerCase();
      const allowed = limits.allowedCategories.map((c) =>
        c.trim().toLowerCase()
      );
      if (!allowed.includes(normalised)) {
        return {
          allowed: false,
          reason: `Category "${category}" is not in the allowed categories list: ${limits.allowedCategories.join(', ')}.`,
        };
      }
    }

    // Total budget ceiling
    if (this.totalSpent + amount > limits.totalBudgetLimit) {
      const remaining = limits.totalBudgetLimit - this.totalSpent;
      return {
        allowed: false,
        reason: `Transaction would exceed the total budget limit of ${limits.totalBudgetLimit} ${currency}. Remaining budget: ${remaining.toFixed(2)} ${currency}.`,
      };
    }

    // Daily limit
    if (limits.dailyLimit !== undefined) {
      const spentToday = this.getDailySpent();
      if (spentToday + amount > limits.dailyLimit) {
        const remainingToday = limits.dailyLimit - spentToday;
        return {
          allowed: false,
          reason: `Transaction would exceed the daily limit of ${limits.dailyLimit} ${currency}. Remaining today: ${remainingToday.toFixed(2)} ${currency}.`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Records an approved transaction and updates all running totals.
   * Only call this after a successful authorisation.
   */
  record(transaction: CardTransaction): void {
    this.transactions.push(transaction);
    if (transaction.status === 'approved') {
      this.totalSpent += transaction.amount;
      const key = this.todayKey();
      this.dailySpent.set(
        key,
        (this.dailySpent.get(key) ?? 0) + transaction.amount
      );
    }
  }

  /** Returns a snapshot of all recorded transactions (newest first). */
  getTransactions(): CardTransaction[] {
    return [...this.transactions].reverse();
  }

  /** Returns a human-readable budget status summary. */
  getStatus(limits: SpendingLimits): BudgetStatus {
    const currency = limits.currency ?? 'USD';
    const dailySpent = this.getDailySpent();
    const status: BudgetStatus = {
      currency,
      totalBudgetLimit: limits.totalBudgetLimit,
      totalSpent: this.totalSpent,
      remainingBudget: limits.totalBudgetLimit - this.totalSpent,
      perTransactionLimit: limits.perTransactionLimit,
      dailySpent,
      transactionCount: this.transactions.filter((t) => t.status === 'approved')
        .length,
    };

    if (limits.dailyLimit !== undefined) {
      status.dailyLimit = limits.dailyLimit;
      status.remainingToday = limits.dailyLimit - dailySpent;
    }

    if (limits.requireApprovalAbove !== undefined) {
      status.requireApprovalAbove = limits.requireApprovalAbove;
    }

    if (limits.allowedCategories !== undefined) {
      status.allowedCategories = limits.allowedCategories;
    }

    return status;
  }
}
