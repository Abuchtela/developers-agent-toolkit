import {
  execute,
  getParameters,
} from '@/shared/tools/card/checkSpendingLimits';
import { BudgetTracker } from '@/shared/card/budgetTracker';
import { createMockApi } from '@/tests/mockDevelopersApi';
import { SpendingLimits, ToolContext } from '@/shared/types';

const mockApi = createMockApi();

const baseLimits: SpendingLimits = {
  perTransactionLimit: 500,
  totalBudgetLimit: 2000,
  currency: 'USD',
};

const buildContext = (withCard = true): ToolContext => {
  const ctx: ToolContext = { client: mockApi };
  if (withCard) {
    ctx.cardContext = {
      spendingLimits: baseLimits,
      budgetTracker: new BudgetTracker(),
    };
  }
  return ctx;
};

describe('checkSpendingLimits execute', () => {
  it('returns budget status as JSON when card is configured', async () => {
    const ctx = buildContext(true);
    const result = await execute(ctx, {});
    const parsed = JSON.parse(result);
    expect(parsed.totalBudgetLimit).toBe(2000);
    expect(parsed.totalSpent).toBe(0);
    expect(parsed.remainingBudget).toBe(2000);
    expect(parsed.currency).toBe('USD');
  });

  it('returns an error JSON when card is not configured', async () => {
    const ctx = buildContext(false);
    const result = await execute(ctx, {});
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
  });
});

describe('checkSpendingLimits getParameters', () => {
  it('has no parameters', () => {
    const params = getParameters();
    expect(Object.keys(params.shape)).toHaveLength(0);
  });
});
