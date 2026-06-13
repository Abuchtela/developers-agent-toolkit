import { z } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export interface Tool {
  name: string;
  title: string;
  description: string;
  parameters: z.ZodObject<any>;
  annotations: ToolAnnotations;
  execute: (params: any) => Promise<string>;
}

export interface DevelopersApi {
  listServices(): Promise<string>;
  getDocumentation(serviceId: string): Promise<string>;
  getDocumentationSection(
    serviceId: string,
    sectionId: string
  ): Promise<string>;
  getDocumentationPage(pagePath: string): Promise<string>;
  getApiOperations(apiSpecificationPath: string): Promise<string>;
  getApiOperationDetails(
    apiSpecificationPath: string,
    method: string,
    path: string
  ): Promise<string>;
  fetchGithubGuide?(url: string): Promise<string>;
}

export interface ToolContext {
  client: DevelopersApi;
  serviceId?: string;
  apiSpecificationPath?: string;
  cardContext?: CardContext;
}

// ── Corporate credit-card types ───────────────────────────────────────────────

/** Spending boundaries that prevent an AI agent from over-spending. */
export interface SpendingLimits {
  /** Maximum amount allowed in a single transaction. */
  perTransactionLimit: number;
  /** Hard ceiling on total spending across all transactions in a session. */
  totalBudgetLimit: number;
  /**
   * Amounts at or above this threshold are automatically declined and must be
   * approved by a human operator before the agent can retry.
   */
  requireApprovalAbove?: number;
  /**
   * Whitelist of merchant categories the agent is allowed to purchase from.
   * When omitted, all categories are permitted.
   * Examples: 'software', 'cloud-services', 'travel', 'office-supplies'
   */
  allowedCategories?: string[];
  /** Maximum total spend allowed within a single calendar day (UTC). */
  dailyLimit?: number;
  /** ISO-4217 currency code used for all limit comparisons. Default: 'USD'. */
  currency?: string;
}

/** Record of a single card transaction. */
export interface CardTransaction {
  id: string;
  timestamp: string;
  amount: number;
  currency: string;
  merchantName: string;
  category: string;
  description: string;
  status: 'approved' | 'declined';
  declineReason?: string;
}

/** Runtime card state injected into ToolContext. */
export interface CardContext {
  spendingLimits: SpendingLimits;
  /** Mutable tracker; shared by all card tools within the same session. */
  budgetTracker: import('./card/budgetTracker').BudgetTracker;
}
