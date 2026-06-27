import { Layout, Space, Typography, Button } from 'antd';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';

const { Header: AntHeader } = Layout;

export function Header() {
  const { clearToken } = useAuthStore();
  const { t } = useTranslation();

  return (
    <AntHeader className="bg-white flex items-center justify-end px-6">
      <Space>
        <Typography.Text type="secondary">Capability Hub</Typography.Text>
        <Button size="small" onClick={clearToken}>
          {t('login')}
        </Button>
      </Space>
    </AntHeader>
  );
}
