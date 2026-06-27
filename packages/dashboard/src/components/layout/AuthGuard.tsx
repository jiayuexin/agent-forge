import type { ReactNode } from 'react';
import { Modal, Form, Input } from 'antd';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { token, setToken } = useAuthStore();
  const { t } = useTranslation();
  const [form] = Form.useForm();

  const handleOk = async () => {
    const values = await form.validateFields();
    setToken(values.token);
  };

  if (token) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <Modal
        title={t('login')}
        open
        closable={false}
        maskClosable={false}
        okText={t('submit')}
        onOk={handleOk}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="token"
            label={t('tokenRequired')}
            rules={[{ required: true, message: t('tokenRequired') }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
