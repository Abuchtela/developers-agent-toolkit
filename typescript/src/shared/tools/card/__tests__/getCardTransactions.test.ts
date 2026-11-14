import {
  execute,
  getParameters,
} from '@/shared/tools/card/getCardTransactions';
import { BudgetTracker } from '@/shared/card/budgetTracker';
import { createMockApi } from '@/tests/mockDevelopersApi';
import { SpendingLimits, ToolContext } from '@/shared/types';

const mockApi = createMockApi();

const baseLimits: SpendingLimits = {
  perTransactionLimit: 500,
  totalBudgetLimit: 2000,
  currency: 'USD',
};

const buildContextWithTransactions = (): ToolContext => {
  const tracker = new BudgetTracker();
  tracker.record({
    id: 'txn-1',
    timestamp: '2025-01-01T10:00:00.000Z',
    amount: 100,
    currency: 'USD',
    merchantName: 'Vendor A',
    category: 'software',
    description: 'first purchase',
    status: 'approved',
  });
  tracker.record({
    id: 'txn-2',
    timestamp: '2025-01-02T10:00:00.000Z',
    amount: 200,
    currency: 'USD',
    merchantName: 'Vendor B',
    category: 'cloud-services',
    description: 'second purchase',
    status: 'approved',
  });
  tracker.record({
    id: 'txn-3',
    timestamp: '2025-01-03T10:00:00.000Z',
    amount: 600,
    currency: 'USD',
    merchantName: 'Vendor C',
    category: 'software',
    description: 'declined purchase',
    status: 'declined',
    declineReason: 'Exceeds per-transaction limit.',
  });

  return {
    client: mockApi,
    cardContext: { spendingLimits: baseLimits, budgetTracker: tracker },
  };
};

describe('getCardTransactions execute', () => {
  it('returns all transactions newest-first', async () => {
    const ctx = buildContextWithTransactions();
    const result = await execute(ctx, {});
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(3);
    expect(parsed.transactions[0].id).toBe('txn-3');
    expect(parsed.transactions[2].id).toBe('txn-1');
  });

  it('respects the limit parameter', async () => {
    const ctx = buildContextWithTransactions();
    const result = await execute(ctx, { limit: 2 });
    const parsed = JSON.parse(result);

    expect(parsed.count).toBe(2);
    expect(parsed.transactions).toHaveLength(2);
  });

  it('returns error JSON when card is not configured', async () => {
    const ctx: ToolContext = { client: mockApi };
    const result = await execute(ctx, {});
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
  });

  it('returns empty list when no transactions recorded', async () => {
    const ctx: ToolContext = {
      client: mockApi,
      cardContext: {
        spendingLimits: baseLimits,
        budgetTracker: new BudgetTracker(),
      },
    };
    const result = await execute(ctx, {});
    const parsed = JSON.parse(result);
    expect(parsed.count).toBe(0);
    expect(parsed.transactions).toHaveLength(0);
  });
});

describe('getCardTransactions getParameters', () => {
  it('has an optional limit field', () => {
    const params = getParameters();
    const fields = Object.keys(params.shape);
    expect(fields).toContain('limit');
  });
});
