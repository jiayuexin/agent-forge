import type { ToolDefinition, JSONSchema } from '@agentforge/types';

/**
 * SkillMatcher — matches tools to a role description based on pre-defined
 * tool catalogs for common roles.
 *
 * Tool names follow kebab-case convention (e.g. query-order, create-refund).
 */
export class SkillMatcher {
  private readonly toolCatalog: Map<string, ToolDefinition[]>;

  constructor() {
    this.toolCatalog = new Map<string, ToolDefinition[]>([
      [
        'customer-service',
        [
          makeTool('query-order', 'Look up order details by order ID', {
            type: 'object',
            properties: { orderId: { type: 'string', description: 'The order ID to look up' } },
            required: ['orderId'],
          }),
          makeTool('create-refund', 'Initiate a refund for an order', {
            type: 'object',
            properties: {
              orderId: { type: 'string', description: 'The order ID to refund' },
              reason: { type: 'string', description: 'Reason for the refund' },
              amount: { type: 'number', description: 'Refund amount (defaults to full)' },
            },
            required: ['orderId', 'reason'],
          }),
          makeTool('send-notification', 'Send a notification to a customer', {
            type: 'object',
            properties: {
              customerId: { type: 'string', description: 'Customer ID' },
              message: { type: 'string', description: 'Notification message' },
              channel: { type: 'string', enum: ['email', 'sms', 'push'], description: 'Notification channel' },
            },
            required: ['customerId', 'message'],
          }),
        ],
      ],
      [
        'sales-assistant',
        [
          makeTool('recommend-product', 'Recommend products based on customer preferences', {
            type: 'object',
            properties: {
              preferences: { type: 'string', description: 'Customer preferences or requirements' },
              category: { type: 'string', description: 'Product category filter' },
            },
            required: ['preferences'],
          }),
          makeTool('calculate-price', 'Calculate final price including discounts and tax', {
            type: 'object',
            properties: {
              productIds: { type: 'array', items: { type: 'string' }, description: 'Product IDs' },
              discountCode: { type: 'string', description: 'Optional discount code' },
            },
            required: ['productIds'],
          }),
          makeTool('create-order', 'Create a new order for a customer', {
            type: 'object',
            properties: {
              customerId: { type: 'string', description: 'Customer ID' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    productId: { type: 'string' },
                    quantity: { type: 'number' },
                  },
                  required: ['productId', 'quantity'],
                },
                description: 'Order line items',
              },
            },
            required: ['customerId', 'items'],
          }),
        ],
      ],
      [
        'code-reviewer',
        [
          makeTool('read-file', 'Read a file from the repository', {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path relative to repository root' },
            },
            required: ['path'],
          }),
          makeTool('run-tests', 'Run the test suite and return results', {
            type: 'object',
            properties: {
              testPattern: { type: 'string', description: 'Glob pattern for test files' },
              coverage: { type: 'boolean', description: 'Whether to collect coverage' },
            },
            required: [],
          }),
          makeTool('check-style', 'Run linter/style checker on files', {
            type: 'object',
            properties: {
              paths: { type: 'array', items: { type: 'string' }, description: 'File paths to check' },
              fix: { type: 'boolean', description: 'Whether to auto-fix issues' },
            },
            required: ['paths'],
          }),
        ],
      ],
      [
        'content-writer',
        [
          makeTool('search-web', 'Search the web for information', {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              maxResults: { type: 'number', description: 'Maximum number of results' },
            },
            required: ['query'],
          }),
          makeTool('check-grammar', 'Check text for grammar and style issues', {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Text to check' },
              language: { type: 'string', description: 'Language code (e.g. en, zh)' },
            },
            required: ['text'],
          }),
          makeTool('generate-outline', 'Generate a content outline from a topic', {
            type: 'object',
            properties: {
              topic: { type: 'string', description: 'Topic for the outline' },
              format: { type: 'string', enum: ['blog', 'article', 'report'], description: 'Content format' },
            },
            required: ['topic'],
          }),
        ],
      ],
      [
        'data-analyst',
        [
          makeTool('db-query', 'Execute a database query', {
            type: 'object',
            properties: {
              sql: { type: 'string', description: 'SQL query to execute' },
              database: { type: 'string', description: 'Database name' },
            },
            required: ['sql'],
          }),
          makeTool('chart-generate', 'Generate a chart from data', {
            type: 'object',
            properties: {
              data: { type: 'array', items: { type: 'object' }, description: 'Data points' },
              chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'scatter'], description: 'Chart type' },
              title: { type: 'string', description: 'Chart title' },
            },
            required: ['data', 'chartType'],
          }),
          makeTool('export-report', 'Export analysis results as a report', {
            type: 'object',
            properties: {
              format: { type: 'string', enum: ['pdf', 'csv', 'xlsx', 'html'], description: 'Export format' },
              data: { type: 'object', description: 'Report data' },
              title: { type: 'string', description: 'Report title' },
            },
            required: ['format', 'data'],
          }),
        ],
      ],
    ]);
  }

  /**
   * Match tools for the given role and capabilities.
   * Falls back to role-based matching, then returns an empty array for unknown roles.
   */
  match(role: string, _capabilities: string[]): ToolDefinition[] {
    const normalizedRole = role.toLowerCase().replace(/\s+/g, '-');
    return this.toolCatalog.get(normalizedRole) ?? [];
  }

  /** Get all known role IDs. */
  availableRoles(): string[] {
    return [...this.toolCatalog.keys()];
  }
}

/** Helper to construct a ToolDefinition with less boilerplate. */
function makeTool(name: string, description: string, parameters: JSONSchema): ToolDefinition {
  return { name, description, parameters };
}
