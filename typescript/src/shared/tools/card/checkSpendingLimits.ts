import { z } from 'zod';
import { Tool, ToolContext } from '@/shared/types';

const getDescription = (): string =>
  `Returns the current corporate credit card budget status including total spend,
remaining budget, daily spend, and all configured spending limits.
Use this tool to check how much budget is available before attempting a purchase.`;

export const getParameters = (): z.ZodObject<any> => z.object({});

export const execute = async (
  context: ToolContext,
  _params: z.infer<ReturnType<typeof getParameters>>
): Promise<string> => {
  if (!context.cardContext) {
    return JSON.stringify({
      error:
        'Corporate credit card is not configured. Provide a CorporateCreditCardConfig when initializing the toolkit.',
    });
  }

  const { spendingLimits, budgetTracker } = context.cardContext;
  const status = budgetTracker.getStatus(spendingLimits);
  return JSON.stringify(status, null, 2);
};

export const checkSpendingLimits = (context: ToolContext): Tool => ({
  name: 'check-spending-limits',
  title: 'Check Spending Limits',
  description: getDescription(),
  parameters: getParameters(),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  execute: (params) => execute(context, params),
});
