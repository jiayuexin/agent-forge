import { Layout, Space, Button } from 'antd';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';

const { Header: AntHeader } = Layout;

export function Header() {
  const { clearToken } = useAuthStore();
  const { t } = useTranslation();

  return (
    <AntHeader className="flex items-center justify-end px-6">
      <Space>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[var(--tech-success)] animate-pulse shadow-[0_0_10px_var(--tech-success)]" />
          <span className="text-[var(--tech-text-muted)] text-sm font-mono">SYSTEM_ONLINE</span>
        </div>
        <Button size="small" onClick={clearToken}>
          {t('login')}
        </Button>
      </Space>
    </AntHeader>
  );
}
