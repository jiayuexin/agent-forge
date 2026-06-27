import { Badge } from 'antd';
import type { AgentNodeStatus } from '@agentforge/types';

interface StatusBadgeProps {
  status: AgentNodeStatus;
}

const STATUS_MAP: Record<AgentNodeStatus, { color: string; text: string }> = {
  online: { color: 'green', text: '在线' },
  offline: { color: 'default', text: '离线' },
  busy: { color: 'orange', text: '忙碌' },
  error: { color: 'red', text: '错误' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? { color: 'default', text: status };
  return <Badge color={config.color} text={config.text} />;
}
