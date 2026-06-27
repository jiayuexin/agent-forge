type LabelSet = Record<string, string | number>;

interface MetricValue {
  labels: LabelSet;
  value: number;
}

interface MetricDefinition {
  type: 'counter' | 'gauge' | 'histogram';
  help?: string;
  values: Map<string, MetricValue>;
}

export class MetricsRegistry {
  private metrics = new Map<string, MetricDefinition>();

  register(name: string, type: MetricDefinition['type'], help?: string): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, { type, help, values: new Map() });
    }
  }

  counter(name: string, help?: string): Counter {
    this.register(name, 'counter', help);
    return {
      inc: (labels: LabelSet = {}, value = 1) => {
        const key = labelKey(labels);
        const metric = this.metrics.get(name)!;
        const existing = metric.values.get(key);
        if (existing) {
          existing.value += value;
        } else {
          metric.values.set(key, { labels, value });
        }
      },
    };
  }

  gauge(name: string, help?: string): Gauge {
    this.register(name, 'gauge', help);
    return {
      set: (labels: LabelSet = {}, value: number) => {
        const key = labelKey(labels);
        const metric = this.metrics.get(name)!;
        metric.values.set(key, { labels, value });
      },
    };
  }

  histogram(name: string, help?: string): Histogram {
    this.register(name, 'histogram', help);
    return {
      observe: (labels: LabelSet = {}, value: number) => {
        const key = labelKey(labels);
        const metric = this.metrics.get(name)!;
        const existing = metric.values.get(key);
        if (existing) {
          existing.value += 1;
          existing.labels._count = ((existing.labels._count as number) ?? 0) + 1;
          existing.labels._sum = ((existing.labels._sum as number) ?? 0) + value;
        } else {
          metric.values.set(key, {
            labels: { ...labels, _count: 1, _sum: value },
            value: 1,
          });
        }
      },
    };
  }

  reset(): void {
    this.metrics.clear();
  }

  output(): string {
    const lines: string[] = [];
    for (const [name, metric] of this.metrics) {
      if (metric.help) {
        lines.push(`# HELP ${name} ${metric.help}`);
      }
      lines.push(`# TYPE ${name} ${metric.type}`);
      for (const { labels, value } of metric.values.values()) {
        const labelStr = formatLabels(labels);
        lines.push(`${name}${labelStr} ${value}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }
}

export interface Counter {
  inc(labels?: LabelSet, value?: number): void;
}

export interface Gauge {
  set(labels?: LabelSet, value?: number): void;
}

export interface Histogram {
  observe(labels?: LabelSet, value?: number): void;
}

function labelKey(labels: LabelSet): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

function formatLabels(labels: LabelSet): string {
  const entries = Object.entries(labels).filter(([key]) => !key.startsWith('_'));
  if (entries.length === 0) {
    return '';
  }
  const formatted = entries.map(([key, value]) => `${key}="${escapeLabel(String(value))}"`).join(',');
  return `{${formatted}}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
