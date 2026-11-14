import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { defaultDevelopersApi } from '@/shared/api';
import { tools } from '@/shared/tools';
import { ToolContext, SpendingLimits } from '@/shared/types';
import { BudgetTracker } from '@/shared/card/budgetTracker';
import { version } from '../../package.json';

export type {
  DevelopersApi,
  Tool,
  ToolContext,
  SpendingLimits,
  CardTransaction,
  CardContext,
} from '@/shared/types';
export { BudgetTracker } from '@/shared/card/budgetTracker';
export { tools } from '@/shared/tools';

export interface MastercardDevelopersAgentToolkitConfig {
  service?: string;
  apiSpecification?: string;
  /**
   * When provided, enables the corporate credit card tools
   * (check-spending-limits, create-card-payment, get-card-transactions)
   * with the given spending limits enforced on every purchase attempt.
   */
  corporateCreditCard?: CorporateCreditCardConfig;
}

/**
 * Configuration for the corporate credit card integration.
 * All monetary values must be in the same currency as `currency` (default: USD).
 */
export interface CorporateCreditCardConfig {
  spendingLimits: SpendingLimits;
}

export class MastercardDevelopersAgentToolkit extends McpServer {
  constructor(config: MastercardDevelopersAgentToolkitConfig = {}) {
    super({
      name: 'mastercard-developers-mcp',
      version: version,
    });

    this.registerAllTools(config);
  }

  private registerAllTools(config: MastercardDevelopersAgentToolkitConfig) {
    const context = buildContext(config);

    const availableTools = tools(context);
    const enabledTools = availableTools.filter((tool) => {
      // If serviceId is provided, disable the services list tool
      if (context.serviceId && tool.name === 'get-services-list') {
        return false;
      }

      return true;
    });

    enabledTools.forEach((tool) => {
      this.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.parameters,
          annotations: tool.annotations,
        },
        async (params: any) => {
          try {
            const result = await tool.execute(params);
            return { content: [{ type: 'text' as const, text: result }] };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            return {
              content: [{ type: 'text' as const, text: message }],
              isError: true,
            };
          }
        }
      );
    });
  }
}

export function buildContext(
  config: MastercardDevelopersAgentToolkitConfig
): ToolContext {
  const context: ToolContext = { client: defaultDevelopersApi };
  if (config.service != null) {
    const serviceId = parseServiceIdFromUrl(config.service);
    if (serviceId == null) {
      throw new Error(
        'Invalid service URL provided. It should be in the format: https://developer.mastercard.com/<service-id>/documentation/**'
      );
    }

    context.serviceId = serviceId;
  } else if (config.apiSpecification != null) {
    const parsed = parseAPISpecificationPathAndServiceId(
      config.apiSpecification
    );
    if (parsed?.serviceId == null || parsed?.apiSpecificationPath == null) {
      throw new Error(
        'Invalid API specification path provided. It should be in the format: https://static.developer.mastercard.com/content/<service-id>/swagger/<nested-file-path>.yaml'
      );
    }

    context.serviceId = parsed.serviceId;
    context.apiSpecificationPath = parsed.apiSpecificationPath;
  }

  if (config.corporateCreditCard != null) {
    const { spendingLimits } = config.corporateCreditCard;
    validateSpendingLimits(spendingLimits);
    context.cardContext = {
      spendingLimits,
      budgetTracker: new BudgetTracker(),
    };
  }

  return context;
}

function validateServiceId(serviceId: string): boolean {
  return /^[a-z]+(?:-[a-z0-9]+)*$/i.test(serviceId);
}

function parseServiceIdFromUrl(input: string): string | null {
  try {
    // Extract from https://developer.mastercard.com/<service-id>/documentation/**
    const url = new URL(input);

    if (url.hostname !== 'developer.mastercard.com') {
      return null;
    }

    const pathParts = url.pathname.split('/').filter((part) => part.length > 0);
    // Path should be: /<service-id>/documentation/...
    if (pathParts.length >= 2 && pathParts[1] === 'documentation') {
      const serviceId = pathParts[0];
      if (serviceId && validateServiceId(serviceId)) {
        return serviceId.toLowerCase();
      }
    }

    return null;
  } catch {
    // Not a valid URL, return null
    return null;
  }
}

function parseAPISpecificationPathAndServiceId(
  input: string
): { serviceId: string; apiSpecificationPath: string } | null {
  try {
    // Try to parse as URL first
    const url = new URL(input);

    // Handle full URL: https://static.developer.mastercard.com/content/open-finance-us/swagger/openbanking-us.yaml
    if (url.hostname !== 'static.developer.mastercard.com') {
      return null;
    }
    const pathParts = url.pathname.split('/').filter((part) => part.length > 0);
    // Path should be: content/<service-id>/swagger/<nested-file-path>.yaml
    if (
      pathParts.length >= 4 &&
      pathParts[0] === 'content' &&
      pathParts[2] === 'swagger'
    ) {
      const serviceId = pathParts[1];
      const file = pathParts.slice(3).join('/');

      if (
        serviceId &&
        file &&
        validateServiceId(serviceId) &&
        file.endsWith('.yaml')
      ) {
        return {
          serviceId: serviceId.toLowerCase(),
          apiSpecificationPath: `/${serviceId.toLowerCase()}/swagger/${file}`,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function validateSpendingLimits(limits: SpendingLimits): void {
  if (!Number.isFinite(limits.perTransactionLimit)) {
    throw new Error(
      'Invalid corporateCreditCard config: perTransactionLimit must be a finite number.'
    );
  }
  if (!Number.isFinite(limits.totalBudgetLimit)) {
    throw new Error(
      'Invalid corporateCreditCard config: totalBudgetLimit must be a finite number.'
    );
  }
  if (
    limits.requireApprovalAbove !== undefined &&
    !Number.isFinite(limits.requireApprovalAbove)
  ) {
    throw new Error(
      'Invalid corporateCreditCard config: requireApprovalAbove must be a finite number.'
    );
  }
  if (limits.dailyLimit !== undefined && !Number.isFinite(limits.dailyLimit)) {
    throw new Error(
      'Invalid corporateCreditCard config: dailyLimit must be a finite number.'
    );
  }
  if (limits.perTransactionLimit <= 0) {
    throw new Error(
      'Invalid corporateCreditCard config: perTransactionLimit must be greater than zero.'
    );
  }
  if (limits.totalBudgetLimit <= 0) {
    throw new Error(
      'Invalid corporateCreditCard config: totalBudgetLimit must be greater than zero.'
    );
  }
  if (
    limits.requireApprovalAbove !== undefined &&
    limits.requireApprovalAbove <= 0
  ) {
    throw new Error(
      'Invalid corporateCreditCard config: requireApprovalAbove must be greater than zero.'
    );
  }
  if (limits.dailyLimit !== undefined && limits.dailyLimit <= 0) {
    throw new Error(
      'Invalid corporateCreditCard config: dailyLimit must be greater than zero.'
    );
  }
  if (
    limits.requireApprovalAbove !== undefined &&
    limits.requireApprovalAbove > limits.perTransactionLimit
  ) {
    throw new Error(
      'Invalid corporateCreditCard config: requireApprovalAbove cannot exceed perTransactionLimit.'
    );
  }
}
