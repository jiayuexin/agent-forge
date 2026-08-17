export class CostTracker {
  private spent = 0;

  constructor(private readonly limit?: number) {
    if (limit === undefined) {
      const envLimit = process.env.MONTHLY_COST_LIMIT;
      this.limit = envLimit ? Number(envLimit) : undefined;
    }
  }

  record(cost: number): void {
    this.spent += cost;
    if (this.limit !== undefined && this.spent > this.limit) {
      throw new Error(`Monthly cost limit exceeded: ${this.spent.toFixed(4)} > ${this.limit}`);
    }
  }

  getTotal(): number {
    return this.spent;
  }
}
