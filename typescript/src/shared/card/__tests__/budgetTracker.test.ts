import { BudgetTracker } from '@/shared/card/budgetTracker';
import { SpendingLimits } from '@/shared/types';

const baseLimits: SpendingLimits = {
  perTransactionLimit: 500,
  totalBudgetLimit: 2000,
  currency: 'USD',
};

const buildTracker = () => new BudgetTracker();

describe('BudgetTracker.canSpend', () => {
  it('allows a valid transaction within all limits', () => {
    const tracker = buildTracker();
    const result = tracker.canSpend(100, 'software', baseLimits);
    expect(result.allowed).toBe(true);
  });

  it('rejects a zero or negative amount', () => {
    const tracker = buildTracker();
    expect(tracker.canSpend(0, 'software', baseLimits).allowed).toBe(false);
    expect(tracker.canSpend(-10, 'software', baseLimits).allowed).toBe(false);
  });

  it('rejects when amount exceeds perTransactionLimit', () => {
    const tracker = buildTracker();
    const result = tracker.canSpend(600, 'software', baseLimits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/per-transaction limit/);
  });

  it('rejects when amount meets requireApprovalAbove threshold', () => {
    const tracker = buildTracker();
    const limits: SpendingLimits = {
      ...baseLimits,
      requireApprovalAbove: 300,
    };
    const result = tracker.canSpend(300, 'software', limits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/approval threshold/);
  });

  it('allows amounts strictly below requireApprovalAbove', () => {
    const tracker = buildTracker();
    const limits: SpendingLimits = {
      ...baseLimits,
      requireApprovalAbove: 300,
    };
    expect(tracker.canSpend(299.99, 'software', limits).allowed).toBe(true);
  });

  it('rejects a disallowed category', () => {
    const tracker = buildTracker();
    const limits: SpendingLimits = {
      ...baseLimits,
      allowedCategories: ['software', 'cloud-services'],
    };
    const result = tracker.canSpend(100, 'luxury-goods', limits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not in the allowed categories/);
  });

  it('accepts an allowed category (case-insensitive)', () => {
    const tracker = buildTracker();
    const limits: SpendingLimits = {
      ...baseLimits,
      allowedCategories: ['software'],
    };
    expect(tracker.canSpend(50, 'Software', limits).allowed).toBe(true);
  });

  it('rejects when transaction would exceed totalBudgetLimit', () => {
    const tracker = buildTracker();
    // Spend 1900 first
    tracker.record({
      id: 'txn-1',
      timestamp: new Date().toISOString(),
      amount: 1900,
      currency: 'USD',
      merchantName: 'Acme',
      category: 'software',
      description: 'test',
      status: 'approved',
    });
    const result = tracker.canSpend(200, 'software', baseLimits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/total budget limit/);
  });

  it('rejects when transaction would exceed dailyLimit', () => {
    const tracker = buildTracker();
    const limits: SpendingLimits = {
      ...baseLimits,
      dailyLimit: 300,
    };
    tracker.record({
      id: 'txn-1',
      timestamp: new Date().toISOString(),
      amount: 250,
      currency: 'USD',
      merchantName: 'Acme',
      category: 'software',
      description: 'test',
      status: 'approved',
    });
    const result = tracker.canSpend(100, 'software', limits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/daily limit/);
  });
});

describe('BudgetTracker.record', () => {
  it('increments totalSpent only for approved transactions', () => {
    const tracker = buildTracker();
    tracker.record({
      id: 'txn-1',
      timestamp: new Date().toISOString(),
      amount: 100,
      currency: 'USD',
      merchantName: 'Acme',
      category: 'software',
      description: 'test',
      status: 'approved',
    });
    tracker.record({
      id: 'txn-2',
      timestamp: new Date().toISOString(),
      amount: 200,
      currency: 'USD',
      merchantName: 'Acme',
      category: 'luxury',
      description: 'declined purchase',
      status: 'declined',
      declineReason: 'Category not allowed.',
    });
    expect(tracker.getTotalSpent()).toBe(100);
  });

  it('returns transactions newest-first', () => {
    const tracker = buildTracker();
    tracker.record({
      id: 'txn-1',
      timestamp: '2025-01-01T00:00:00.000Z',
      amount: 50,
      currency: 'USD',
      merchantName: 'A',
      category: 'software',
      description: 'first',
      status: 'approved',
    });
    tracker.record({
      id: 'txn-2',
      timestamp: '2025-01-02T00:00:00.000Z',
      amount: 75,
      currency: 'USD',
      merchantName: 'B',
      category: 'software',
      description: 'second',
      status: 'approved',
    });
    const history = tracker.getTransactions();
    expect(history[0].id).toBe('txn-2');
    expect(history[1].id).toBe('txn-1');
  });
});

describe('BudgetTracker.getStatus', () => {
  it('returns correct remaining budget', () => {
    const tracker = buildTracker();
    tracker.record({
      id: 'txn-1',
      timestamp: new Date().toISOString(),
      amount: 400,
      currency: 'USD',
      merchantName: 'Acme',
      category: 'software',
      description: 'test',
      status: 'approved',
    });
    const status = tracker.getStatus(baseLimits);
    expect(status.totalSpent).toBe(400);
    expect(status.remainingBudget).toBe(1600);
    expect(status.currency).toBe('USD');
  });

  it('includes dailyLimit fields when configured', () => {
    const tracker = buildTracker();
    const limits: SpendingLimits = { ...baseLimits, dailyLimit: 500 };
    const status = tracker.getStatus(limits);
    expect(status.dailyLimit).toBe(500);
    expect(status.remainingToday).toBe(500);
  });
});
