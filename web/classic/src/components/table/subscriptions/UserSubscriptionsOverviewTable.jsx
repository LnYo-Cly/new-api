/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popover,
  Select,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import CardTable from '../../common/ui/CardTable';
import { API, renderQuota, showError, showSuccess } from '../../../helpers';
import { IconSearch, IconBarChartVStroked } from '@douyinfe/semi-icons';
import { createCardProPagination } from '../../../helpers/utils';

const { Text } = Typography;
const pageSizeOptions = [10, 20, 50, 100];

function formatTs(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}

function formatInternalQuota(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    Number(value || 0),
  );
}

function renderStatusTag(sub, t) {
  const now = Date.now() / 1000;
  const isExpired = (sub?.end_time || 0) > 0 && (sub?.end_time || 0) < now;
  if (sub?.status === 'active' && !isExpired) {
    return (
      <Tag color='green' shape='circle'>
        {t('正常')}
      </Tag>
    );
  }
  if (sub?.status === 'cancelled') {
    return (
      <Tag color='grey' shape='circle'>
        {t('已作废')}
      </Tag>
    );
  }
  return (
    <Tag color='orange' shape='circle'>
      {t('已过期')}
    </Tag>
  );
}

function renderDailyUsage(dailyUsage, t) {
  const entries = Object.entries(dailyUsage || {})
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7);
  if (!entries.length) return null;

  return (
    <Popover
      content={
        <div style={{ minWidth: 220, lineHeight: 1.7 }}>
          <div className='font-medium mb-1'>{t('近7天用量')}</div>
          {entries.map(([date, value]) => (
            <div
              key={date}
              className='flex justify-between gap-4 text-xs'
              style={{ color: 'var(--semi-color-text-0)' }}
            >
              <span className='font-mono'>{date}</span>
              <span className='font-mono'>{renderQuota(Number(value || 0), 4)}</span>
            </div>
          ))}
        </div>
      }
    >
      <Tag
        color='light-blue'
        type='light'
        shape='circle'
        prefixIcon={<IconBarChartVStroked />}
        style={{ marginTop: 4 }}
      >
        {t('每日明细')}
      </Tag>
    </Popover>
  );
}

function StatsStrip({ stats, t }) {
  const items = [
    { label: t('共'), value: stats?.total || 0 },
    { label: t('正常'), value: stats?.active || 0 },
    { label: t('已过期'), value: stats?.expired || 0 },
    { label: t('已作废'), value: stats?.cancelled || 0 },
    { label: t('7天内到期'), value: stats?.expiring_7d || 0 },
    { label: t('今日用量'), value: renderQuota(Number(stats?.today_used || 0), 4) },
    {
      label: t('近7天用量'),
      value: renderQuota(Number(stats?.last_7d_used || 0), 4),
    },
  ];

  return (
    <div className='grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mb-3'>
      {items.map((item) => (
        <div
          key={item.label}
          className='rounded-md border px-3 py-2'
          style={{
            borderColor: 'var(--semi-color-border)',
            background: 'var(--semi-color-fill-0)',
          }}
        >
          <div className='text-xs text-gray-500 truncate'>{item.label}</div>
          <div className='text-sm font-semibold truncate'>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

const UserSubscriptionsOverviewTable = ({
  t,
  isMobile,
  onRefreshPlans,
  plans = [],
}) => {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const [planId, setPlanId] = useState('all');
  const [adjustVisible, setAdjustVisible] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustDays, setAdjustDays] = useState('');
  const [adjustEndTime, setAdjustEndTime] = useState(null);
  const [adjusting, setAdjusting] = useState(false);

  const loadData = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        p: String(nextPage),
        page_size: String(nextPageSize),
      });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (status !== 'all') params.set('status', status);
      if (planId !== 'all') params.set('plan_id', planId);
      const res = await API.get(
        `/api/subscription/admin/user_subscriptions?${params.toString()}`,
      );
      if (res.data?.success) {
        const data = res.data.data || {};
        setRecords(data.items || []);
        setTotal(Number(data.total || 0));
        setStats(data.stats || {});
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(page, pageSize);
  }, [page, pageSize]);

  useEffect(() => {
    setPage(1);
    loadData(1, pageSize);
  }, [keyword, status, planId]);

  const invalidateSubscription = (subId) => {
    Modal.confirm({
      title: t('确认作废'),
      content: t('作废后该订阅将立即失效，历史记录不受影响。是否继续？'),
      centered: true,
      onOk: async () => {
        try {
          const res = await API.post(
            `/api/subscription/admin/user_subscriptions/${subId}/invalidate`,
          );
          if (res.data?.success) {
            showSuccess(res.data?.data?.message || t('已作废'));
            await loadData(page, pageSize);
            onRefreshPlans?.();
          } else {
            showError(res.data?.message || t('操作失败'));
          }
        } catch (e) {
          showError(t('请求失败'));
        }
      },
    });
  };

  const deleteSubscription = (subId) => {
    Modal.confirm({
      title: t('确认删除'),
      content: t('删除会彻底移除该订阅记录（含权益明细）。是否继续？'),
      centered: true,
      okType: 'danger',
      onOk: async () => {
        try {
          const res = await API.delete(
            `/api/subscription/admin/user_subscriptions/${subId}`,
          );
          if (res.data?.success) {
            showSuccess(t('已删除'));
            await loadData(page, pageSize);
            onRefreshPlans?.();
          } else {
            showError(res.data?.message || t('删除失败'));
          }
        } catch (e) {
          showError(t('请求失败'));
        }
      },
    });
  };

  const openAdjustSubscription = (sub) => {
    setAdjustTarget(sub || null);
    setAdjustDays('');
    setAdjustEndTime(sub?.end_time ? new Date(sub.end_time * 1000) : null);
    setAdjustVisible(true);
  };

  const adjustSubscriptionTime = async () => {
    if (!adjustTarget?.id) return;
    const payload = {};
    if (adjustDays !== '' && adjustDays !== null && adjustDays !== undefined) {
      const days = Number(adjustDays);
      if (!Number.isFinite(days) || !Number.isInteger(days) || days === 0) {
        showError(t('请输入非 0 整数天数'));
        return;
      }
      payload.delta_days = days;
    } else {
      if (!adjustEndTime) {
        showError(t('请输入天数或设置到期时间'));
        return;
      }
      const endTime = Math.floor(new Date(adjustEndTime).getTime() / 1000);
      if (!Number.isFinite(endTime) || endTime <= 0) {
        showError(t('到期时间无效'));
        return;
      }
      payload.end_time = endTime;
    }
    setAdjusting(true);
    try {
      const res = await API.patch(
        `/api/subscription/admin/user_subscriptions/${adjustTarget.id}/time`,
        payload,
      );
      if (res.data?.success) {
        showSuccess(res.data?.data?.message || t('调整成功'));
        setAdjustVisible(false);
        setAdjustTarget(null);
        await loadData(page, pageSize);
        onRefreshPlans?.();
      } else {
        showError(res.data?.message || t('操作失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setAdjusting(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: 'ID',
        dataIndex: ['subscription', 'id'],
        width: 70,
        render: (id) => <Text type='tertiary'>#{id}</Text>,
      },
      {
        title: t('用户'),
        width: 220,
        render: (_, record) => {
          const sub = record?.subscription;
          const user = record?.user;
          return (
            <div className='min-w-0'>
              <div className='font-medium truncate'>
                {user?.username || `#${sub?.user_id || '-'}`}
              </div>
              <div className='text-xs text-gray-500 truncate'>
                ID: {sub?.user_id || '-'} {user?.email ? `· ${user.email}` : ''}
              </div>
            </div>
          );
        },
      },
      {
        title: t('套餐'),
        width: 180,
        render: (_, record) => {
          const sub = record?.subscription;
          return (
            <div className='min-w-0'>
              <div className='font-medium truncate'>
                {record?.plan?.title || `#${sub?.plan_id || '-'}`}
              </div>
              <div className='text-xs text-gray-500'>
                {t('来源')}: {sub?.source || '-'}
              </div>
            </div>
          );
        },
      },
      {
        title: t('状态'),
        width: 90,
        render: (_, record) => renderStatusTag(record?.subscription, t),
      },
      {
        title: t('订阅用量'),
        width: 210,
        render: (_, record) => {
          const sub = record?.subscription;
          const totalAmount = Number(sub?.amount_total || 0);
          const usedAmount = Number(sub?.amount_used || 0);
          return totalAmount > 0 ? (
            <div>
              <div>
                {renderQuota(usedAmount)}/{renderQuota(totalAmount)}
              </div>
              <div className='text-xs text-gray-500'>
                {t('内部额度单位')}：{formatInternalQuota(usedAmount)}/
                {formatInternalQuota(totalAmount)}
              </div>
            </div>
          ) : (
            <Text type='tertiary'>{t('不限')}</Text>
          );
        },
      },
      {
        title: t('近期用量'),
        width: 150,
        render: (_, record) => (
          <div className='text-xs text-gray-600'>
            <div>
              {t('今日')}：{renderQuota(Number(record?.today_used || 0), 4)}
            </div>
            <div>
              {t('近7天')}：{renderQuota(Number(record?.last_7d_used || 0), 4)}
            </div>
            {renderDailyUsage(record?.daily_usage, t)}
          </div>
        ),
      },
      {
        title: t('到期时间'),
        width: 200,
        render: (_, record) => {
          const sub = record?.subscription;
          const days = Number(record?.remaining_days || 0);
          return (
            <div className='text-xs text-gray-600'>
              <div>{formatTs(sub?.end_time)}</div>
              <div>{days > 0 ? `${days.toFixed(1)} ${t('天')}` : t('已过期')}</div>
            </div>
          );
        },
      },
      {
        title: '',
        key: 'operate',
        width: 190,
        fixed: 'right',
        render: (_, record) => {
          const sub = record?.subscription;
          const now = Date.now() / 1000;
          const isActive =
            sub?.status === 'active' && (sub?.end_time || 0) > now;
          return (
            <Space>
              <Button size='small' theme='light' onClick={() => openAdjustSubscription(sub)}>
                {t('调整')}
              </Button>
              <Button
                size='small'
                type='warning'
                theme='light'
                disabled={!isActive}
                onClick={() => invalidateSubscription(sub?.id)}
              >
                {t('作废')}
              </Button>
              <Button
                size='small'
                type='danger'
                theme='light'
                onClick={() => deleteSubscription(sub?.id)}
              >
                {t('删除')}
              </Button>
            </Space>
          );
        },
      },
    ],
    [t, page, pageSize],
  );

  return (
    <div>
      <StatsStrip stats={stats} t={t} />
      <div className='flex flex-col md:flex-row gap-2 justify-between mb-3'>
        <Input
          size='small'
          prefix={<IconSearch />}
          showClear
          value={keyword}
          placeholder={t('搜索用户、邮箱、用户ID或订阅ID')}
          onChange={setKeyword}
          style={{ maxWidth: 320 }}
        />
        <Space wrap>
          <Select size='small' value={status} onChange={setStatus} style={{ width: 140 }}>
            <Select.Option value='all'>{t('全部状态')}</Select.Option>
            <Select.Option value='active'>{t('正常')}</Select.Option>
            <Select.Option value='expired'>{t('已过期')}</Select.Option>
            <Select.Option value='cancelled'>{t('已作废')}</Select.Option>
          </Select>
          <Select size='small' value={planId} onChange={setPlanId} style={{ width: 180 }}>
            <Select.Option value='all'>{t('全部套餐')}</Select.Option>
            {(plans || []).map((record) => (
              <Select.Option key={record?.plan?.id} value={String(record?.plan?.id)}>
                {record?.plan?.title || `#${record?.plan?.id}`}
              </Select.Option>
            ))}
          </Select>
          <Button size='small' onClick={() => loadData(page, pageSize)} loading={loading}>
            {t('刷新')}
          </Button>
        </Space>
      </div>
      <CardTable
        columns={columns}
        dataSource={records}
        loading={loading}
        pagination={false}
        hidePagination={true}
        scroll={{ x: 'max-content' }}
        rowKey={(row) => row?.subscription?.id}
        empty={
          <Empty
            image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
            darkModeImage={
              <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
            }
            description={t('暂无订阅用户')}
            style={{ padding: 30 }}
          />
        }
      />
      <div className='mt-3'>
        {createCardProPagination({
          currentPage: page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
          isMobile,
          pageSizeOpts: pageSizeOptions,
          t,
        })}
      </div>

      <Modal
        title={t('调整订阅时间')}
        visible={adjustVisible}
        onCancel={() => setAdjustVisible(false)}
        onOk={adjustSubscriptionTime}
        confirmLoading={adjusting}
        centered
      >
        <div className='space-y-3'>
          <div>
            <Text strong>{t('天数调整')}</Text>
            <InputNumber
              className='mt-1 w-full'
              value={adjustDays}
              onChange={(v) => setAdjustDays(v === null ? '' : String(v))}
              placeholder={t('例如：3 或 -2')}
            />
          </div>
          <div>
            <Text strong>{t('指定到期时间')}</Text>
            <DatePicker
              className='mt-1 w-full'
              type='dateTime'
              value={adjustEndTime}
              disabled={adjustDays !== ''}
              onChange={(value) => setAdjustEndTime(value)}
            />
            <div className='text-xs text-gray-500 mt-1'>
              {t('仅当天数调整为空时使用指定到期时间。')}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UserSubscriptionsOverviewTable;
