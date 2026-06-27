import { Tag } from 'antd';
import type { CapabilityType } from '@agentforge/types';

interface CapabilityTypeTagProps {
  type: CapabilityType;
}

const TYPE_MAP: Record<CapabilityType, { color: string; text: string }> = {
  agent: { color: 'blue', text: 'Agent' },
  tool: { color: 'cyan', text: 'Tool' },
  skill: { color: 'purple', text: 'Skill' },
  plugin: { color: 'magenta', text: 'Plugin' },
  'remote-agent': { color: 'geekblue', text: 'Remote Agent' },
};

export function CapabilityTypeTag({ type }: CapabilityTypeTagProps) {
  const config = TYPE_MAP[type] ?? { color: 'default', text: type };
  return <Tag color={config.color}>{config.text}</Tag>;
}
