import { useEffect, useMemo, useRef } from 'react';
import { Card, Row, Col, Typography, List, Button } from 'antd';
import * as echarts from 'echarts';
import { useTranslation } from 'react-i18next';
import { useMonitorStore } from '../store/monitorStore.js';

export function Monitor() {
  const { t } = useTranslation();
  const { metricsText, events, loading, fetchMetrics, clearEvents } = useMonitorStore();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  const parsedMetrics = useMemo(() => parsePrometheusMetrics(metricsText), [metricsText]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const option: echarts.EChartsOption = {
      title: { text: '请求趋势', left: 'center' },
      tooltip: {},
      xAxis: { type: 'category', data: parsedMetrics.labels },
      yAxis: { type: 'value' },
      series: [
        {
          name: '请求数',
          type: 'line',
          data: parsedMetrics.values,
        },
      ],
    };

    chartInstanceRef.current.setOption(option);

    const handleResize = () => chartInstanceRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [parsedMetrics]);

  return (
    <div>
      <Typography.Title level={2}>{t('monitor')}</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="指标概览" loading={loading}>
            <div ref={chartRef} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={24}>
          <Card
            title="实时事件"
            extra={<Button onClick={clearEvents}>清空</Button>}
          >
            <List
              dataSource={events.slice(0, 50)}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text code>{item.type}</Typography.Text>{' '}
                  <Typography.Text type="secondary">{item.nodeId}</Typography.Text>{' '}
                  {item.summary}
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function parsePrometheusMetrics(text: string): { labels: string[]; values: number[] } {
  const labels: string[] = [];
  const values: number[] = [];

  if (!text) return { labels, values };

  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([a-zA-Z_:][a-zA-Z0-9_:]*)\s+([\d.eE+-]+)\s*$/);
    if (match) {
      labels.push(match[1]);
      values.push(Number(match[2]));
    }
  }

  if (labels.length === 0) {
    labels.push('placeholder');
    values.push(0);
  }

  return { labels, values };
}
