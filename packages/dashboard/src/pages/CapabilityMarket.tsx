import { useEffect } from 'react';
import { Card, Row, Col, Button, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCapabilityStore } from '../store/capabilityStore.js';
import { CapabilityTypeTag } from '../components/common/CapabilityTypeTag.js';
import { RiskTag } from '../components/common/RiskTag.js';
import { PageHeader } from '../components/common/PageHeader.js';

export function CapabilityMarket() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { capabilities, loading, fetchList } = useCapabilityStore();

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div>
      <PageHeader title={`${t('capabilities')} / 市场`} />
      <Row gutter={[16, 16]}>
        {capabilities.map((cap) => (
          <Col key={cap.id} xs={24} sm={12} lg={8}>
            <Card
              loading={loading}
              title={cap.name}
              extra={<CapabilityTypeTag type={cap.type} />}
              actions={[
                <Button
                  key="detail"
                  type="link"
                  onClick={() => navigate(`/capabilities/${cap.id}`)}
                >
                  详情
                </Button>,
                <Button
                  key="distribute"
                  type="link"
                  onClick={() => navigate(`/capabilities/${cap.id}/distribute`)}
                >
                  下发
                </Button>,
              ]}
            >
              <Typography.Paragraph
                ellipsis={{ rows: 2 }}
                type="secondary"
              >
                {cap.description}
              </Typography.Paragraph>
              <RiskTag level={cap.riskLevel} />
              <div className="mt-2">
                {cap.tags?.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
