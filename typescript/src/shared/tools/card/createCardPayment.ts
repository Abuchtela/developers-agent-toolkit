import { z } from 'zod';
import { CardTransaction, Tool, ToolContext } from '@/shared/types';

const generateId = (): string =>
  `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

const getDescription = (): string =>
  `Authorises a corporate credit card payment on behalf of the AI agent.
All configured spending boundaries are enforced BEFORE the payment is approved:
- Per-transaction limit
- Total session budget ceiling
- Daily spending limit (if configured)
- Allowed merchant categories (if configured)
- Human-approval threshold (if configured)

The tool returns a JSON object with the transaction result including status
("approved" or "declined") and a reason if declined.

IMPORTANT: Always call check-spending-limits first to confirm sufficient budget
is available before calling this tool.`;

export const getParameters = (): z.ZodObject<any> =>
  z.object({
    amount: z
      .number()
      .positive()
      .describe('Transaction amount (must be positive)'),
    merchantName: z.string().min(1).describe('Name of the merchant or vendor'),
    category: z
      .string()
      .min(1)
      .describe(
        "Merchant category (e.g., 'software', 'cloud-services', 'travel', 'office-supplies')"
      ),
    description: z
      .string()
      .min(1)
      .describe('Short description of what is being purchased'),
  });

export const execute = async (
  context: ToolContext,
  params: z.infer<ReturnType<typeof getParameters>>
): Promise<string> => {
  if (!context.cardContext) {
    return JSON.stringify({
      status: 'declined',
      declineReason:
        'Corporate credit card is not configured. Provide a CorporateCreditCardConfig when initializing the toolkit.',
    });
  }

  const { spendingLimits, budgetTracker } = context.cardContext;
  const currency = spendingLimits.currency ?? 'USD';

  const check = budgetTracker.canSpend(
    params.amount,
    params.category,
    spendingLimits
  );

  const transaction: CardTransaction = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    amount: params.amount,
    currency,
    merchantName: params.merchantName,
    category: params.category,
    description: params.description,
    status: check.allowed ? 'approved' : 'declined',
    ...(check.reason ? { declineReason: check.reason } : {}),
  };

  budgetTracker.record(transaction);

  return JSON.stringify(transaction, null, 2);
};

export const createCardPayment = (context: ToolContext): Tool => ({
  name: 'create-card-payment',
  title: 'Create Card Payment',
  description: getDescription(),
  parameters: getParameters(),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  execute: (params) => execute(context, params),
});
