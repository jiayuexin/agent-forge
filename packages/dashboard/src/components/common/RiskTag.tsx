import { Tag } from 'antd';

interface RiskTagProps {
  level?: 'low' | 'medium' | 'high';
}

const LEVEL_MAP: Record<NonNullable<RiskTagProps['level']>, { color: string; text: string }> = {
  low: { color: 'green', text: '低风险' },
  medium: { color: 'orange', text: '中风险' },
  high: { color: 'red', text: '高风险' },
};

export function RiskTag({ level }: RiskTagProps) {
  if (!level) return null;
  const config = LEVEL_MAP[level];
  return <Tag color={config.color}>{config.text}</Tag>;
}
