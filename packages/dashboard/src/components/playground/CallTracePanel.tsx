import { Typography } from 'antd';
import type { CallTrace } from '@agentforge/types';
import { getTraceLabel } from '../../lib/callTrace.js';

interface CallTracePanelProps {
  traces: CallTrace[];
  duration?: number;
  model?: string;
}

export function CallTracePanel({ traces, duration, model }: CallTracePanelProps) {
  return (
    <div>
      {(duration !== undefined || model) && (
        <div className="space-y-2 mb-4">
          <Typography.Text strong>本次调用</Typography.Text>
          {duration !== undefined && <div>耗时: {duration}ms</div>}
          {model && <div>模型: {model}</div>}
        </div>
      )}
      <Typography.Text strong>调用链</Typography.Text>
      <div className="text-sm text-gray-600 mt-2 space-y-1">
        {traces.length === 0 ? (
          <div className="text-gray-400">暂无调用记录</div>
        ) : (
          traces.map((trace) => (
            <div key={trace.id}>
              {getTraceLabel(trace.type)}
              {trace.type === 'tool_call' && typeof trace.output === 'string' && trace.output
                ? `: ${trace.output}`
                : ''}{' '}
              {trace.status === 'success' ? '✅' : '❌'}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
