import { execute, getParameters } from '@/shared/tools/card/createCardPayment';
import { BudgetTracker } from '@/shared/card/budgetTracker';
import { createMockApi } from '@/tests/mockDevelopersApi';
import { SpendingLimits, ToolContext } from '@/shared/types';

const mockApi = createMockApi();

const baseLimits: SpendingLimits = {
  perTransactionLimit: 500,
  totalBudgetLimit: 2000,
  allowedCategories: ['software', 'cloud-services'],
  currency: 'USD',
};

const buildContext = (
  withCard = true,
  limits: SpendingLimits = baseLimits
): ToolContext => {
  const ctx: ToolContext = { client: mockApi };
  if (withCard) {
    ctx.cardContext = {
      spendingLimits: limits,
      budgetTracker: new BudgetTracker(),
    };
  }
  return ctx;
};

const validPayload = {
  amount: 150,
  merchantName: 'Acme Cloud',
  category: 'cloud-services',
  description: 'Monthly subscription',
};

describe('createCardPayment execute', () => {
  it('approves a valid payment and records it', async () => {
    const ctx = buildContext();
    const result = await execute(ctx, validPayload);
    const parsed = JSON.parse(result);

    expect(parsed.status).toBe('approved');
    expect(parsed.amount).toBe(150);
    expect(parsed.merchantName).toBe('Acme Cloud');
    expect(parsed.id).toBeDefined();
    expect(parsed.timestamp).toBeDefined();
  });

  it('declines when amount exceeds perTransactionLimit', async () => {
    const ctx = buildContext();
    const result = await execute(ctx, { ...validPayload, amount: 600 });
    const parsed = JSON.parse(result);

    expect(parsed.status).toBe('declined');
    expect(parsed.declineReason).toMatch(/per-transaction limit/);
  });

  it('declines when category is not allowed', async () => {
    const ctx = buildContext();
    const result = await execute(ctx, {
      ...validPayload,
      category: 'luxury-goods',
    });
    const parsed = JSON.parse(result);

    expect(parsed.status).toBe('declined');
    expect(parsed.declineReason).toMatch(/not in the allowed categories/);
  });

  it('declines when requireApprovalAbove threshold is met', async () => {
    const limits: SpendingLimits = {
      ...baseLimits,
      requireApprovalAbove: 200,
    };
    const ctx = buildContext(true, limits);
    const result = await execute(ctx, { ...validPayload, amount: 200 });
    const parsed = JSON.parse(result);

    expect(parsed.status).toBe('declined');
    expect(parsed.declineReason).toMatch(/approval threshold/);
  });

  it('declines when total budget would be exceeded', async () => {
    const limits: SpendingLimits = {
      ...baseLimits,
      totalBudgetLimit: 200,
    };
    const ctx = buildContext(true, limits);

    // First transaction consumes 150
    await execute(ctx, { ...validPayload, amount: 150 });
    // Second transaction would put total at 300, exceeding the 200 limit
    const result = await execute(ctx, { ...validPayload, amount: 100 });
    const parsed = JSON.parse(result);

    expect(parsed.status).toBe('declined');
    expect(parsed.declineReason).toMatch(/total budget limit/);
  });

  it('cumulatively tracks approved spend across multiple transactions', async () => {
    const ctx = buildContext();
    await execute(ctx, { ...validPayload, amount: 100 });
    await execute(ctx, { ...validPayload, amount: 200 });
    expect(ctx.cardContext!.budgetTracker.getTotalSpent()).toBe(300);
  });

  it('does not increment spend for declined transactions', async () => {
    const ctx = buildContext();
    // This will be declined (over per-txn limit)
    await execute(ctx, { ...validPayload, amount: 600 });
    expect(ctx.cardContext!.budgetTracker.getTotalSpent()).toBe(0);
  });

  it('returns error JSON when card is not configured', async () => {
    const ctx = buildContext(false);
    const result = await execute(ctx, validPayload);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('declined');
    expect(parsed.declineReason).toBeDefined();
  });
});

describe('createCardPayment getParameters', () => {
  it('has required amount, merchantName, category, description fields', () => {
    const params = getParameters();
    const fields = Object.keys(params.shape);
    expect(fields).toContain('amount');
    expect(fields).toContain('merchantName');
    expect(fields).toContain('category');
    expect(fields).toContain('description');
  });
});
