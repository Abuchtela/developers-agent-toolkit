import { z } from 'zod';
import { Tool, ToolContext } from '@/shared/types';

const getDescription = (): string =>
  `Returns the corporate credit card transaction history for the current session.
Each entry includes the transaction id, timestamp, amount, currency, merchant name,
category, description, status ("approved" or "declined"), and the decline reason
if the transaction was rejected by the spending-limit guardrails.

Transactions are returned newest-first.`;

export const getParameters = (): z.ZodObject<any> =>
  z.object({
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of transactions to return (newest-first). Omit to return all.'
      ),
  });

export const execute = async (
  context: ToolContext,
  params: z.infer<ReturnType<typeof getParameters>>
): Promise<string> => {
  if (!context.cardContext) {
    return JSON.stringify({
      error:
        'Corporate credit card is not configured. Provide a CorporateCreditCardConfig when initializing the toolkit.',
    });
  }

  const { budgetTracker } = context.cardContext;
  let transactions = budgetTracker.getTransactions();

  if (params.limit !== undefined) {
    transactions = transactions.slice(0, params.limit);
  }

  return JSON.stringify({ transactions, count: transactions.length }, null, 2);
};

export const getCardTransactions = (context: ToolContext): Tool => ({
  name: 'get-card-transactions',
  title: 'Get Card Transactions',
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
