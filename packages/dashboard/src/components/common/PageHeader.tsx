import { Typography } from 'antd';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  extra?: ReactNode;
}

export function PageHeader({ title, extra }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <Typography.Title level={3} className="!mb-0">{title}</Typography.Title>
      {extra}
    </div>
  );
}
