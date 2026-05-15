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
  Card,
  Checkbox,
  Divider,
  Empty,
  Form,
  Modal,
  Space,
  Switch,
  Tag,
  Timeline,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { Bell, Eye, FilePenLine, Plus, Save, Trash2 } from 'lucide-react';
import { marked } from 'marked';
import {
  API,
  formatDateTimeString,
  getRelativeTime,
  showError,
  showSuccess,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const defaultFormState = {
  content: '',
  publishDate: new Date(),
  type: 'default',
  displayMode: 'silent',
  audienceScope: 'all',
  extra: '',
};

const SettingsAnnouncements = ({ options, refresh }) => {
  const { t } = useTranslation();
  const [announcementsList, setAnnouncementsList] = useState([]);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [announcementForm, setAnnouncementForm] = useState(defaultFormState);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAnnouncement, setDeletingAnnouncement] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [panelEnabled, setPanelEnabled] = useState(true);

  const typeOptions = useMemo(
    () => [
      { value: 'default', label: t('默认'), color: 'grey' },
      { value: 'ongoing', label: t('进行中'), color: 'blue' },
      { value: 'success', label: t('成功'), color: 'green' },
      { value: 'warning', label: t('警告'), color: 'orange' },
      { value: 'error', label: t('错误'), color: 'red' },
    ],
    [t],
  );

  const displayModeOptions = useMemo(
    () => [
      { value: 'silent', label: t('静默展示') },
      { value: 'global', label: t('全局展示') },
    ],
    [t],
  );

  const audienceScopeOptions = useMemo(
    () => [
      { value: 'all', label: t('所有已登录用户') },
      { value: 'admins', label: t('仅管理员') },
      { value: 'users', label: t('仅普通用户') },
    ],
    [t],
  );

  const sortedAnnouncements = useMemo(() => {
    return [...announcementsList].sort((a, b) => {
      return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
    });
  }, [announcementsList]);

  const updateOption = async (key, value, successMessage) => {
    const res = await API.put('/api/option/', { key, value });
    const { success, message } = res.data;
    if (!success) {
      showError(message);
      return false;
    }
    if (successMessage) {
      showSuccess(successMessage);
    }
    refresh?.();
    return true;
  };

  const syncEditor = (announcement) => {
    if (!announcement) {
      setEditingAnnouncement(null);
      setAnnouncementForm(defaultFormState);
      return;
    }
    setEditingAnnouncement(announcement);
    setAnnouncementForm({
      content: announcement.content || '',
      publishDate: announcement.publishDate
        ? new Date(announcement.publishDate)
        : new Date(),
      type: announcement.type || 'default',
      displayMode: announcement.displayMode || 'silent',
      audienceScope: announcement.audienceScope || 'all',
      extra: announcement.extra || '',
    });
  };

  const parseAnnouncements = (announcementsStr) => {
    if (!announcementsStr) {
      setAnnouncementsList([]);
      syncEditor(null);
      return;
    }
    try {
      const parsed = JSON.parse(announcementsStr);
      const list = Array.isArray(parsed) ? parsed : [];
      const listWithIds = list.map((item, index) => ({
        ...item,
        id: item.id || index + 1,
        type: item.type || 'default',
        displayMode: item.displayMode || 'silent',
        audienceScope: item.audienceScope || 'all',
      }));
      setAnnouncementsList(listWithIds);
      syncEditor(listWithIds[0] || null);
    } catch (error) {
      console.error('解析系统公告失败:', error);
      setAnnouncementsList([]);
      syncEditor(null);
    }
  };

  useEffect(() => {
    const annStr =
      options['console_setting.announcements'] ?? options.Announcements;
    if (annStr !== undefined) {
      parseAnnouncements(annStr);
    }
  }, [options['console_setting.announcements'], options.Announcements]);

  useEffect(() => {
    const enabledStr = options['console_setting.announcements_enabled'];
    setPanelEnabled(
      enabledStr === undefined
        ? true
        : enabledStr === 'true' || enabledStr === true,
    );
  }, [options['console_setting.announcements_enabled']]);

  const handleToggleEnabled = async (checked) => {
    const ok = await updateOption(
      'console_setting.announcements_enabled',
      checked ? 'true' : 'false',
      t('设置已保存'),
    );
    if (ok) {
      setPanelEnabled(checked);
    }
  };

  const handleAddAnnouncement = () => {
    syncEditor(null);
  };

  const handleSelectAnnouncement = (announcement) => {
    syncEditor(announcement);
  };

  const handleDeleteAnnouncement = (announcement) => {
    setDeletingAnnouncement(announcement);
    setShowDeleteModal(true);
  };

  const confirmDeleteAnnouncement = () => {
    if (!deletingAnnouncement) {
      setShowDeleteModal(false);
      return;
    }
    const newList = announcementsList.filter(
      (item) => item.id !== deletingAnnouncement.id,
    );
    setAnnouncementsList(newList);
    setSelectedRowKeys((prev) =>
      prev.filter((id) => id !== deletingAnnouncement.id),
    );
    setHasChanges(true);
    syncEditor(newList[0] || null);
    showSuccess(t('公告已删除，请及时点击“保存设置”进行保存'));
    setDeletingAnnouncement(null);
    setShowDeleteModal(false);
  };

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      showError(t('请先选择要删除的系统公告'));
      return;
    }
    const newList = announcementsList.filter(
      (item) => !selectedRowKeys.includes(item.id),
    );
    setAnnouncementsList(newList);
    setSelectedRowKeys([]);
    setHasChanges(true);
    syncEditor(newList[0] || null);
    showSuccess(
      t('已删除 {{count}} 个系统公告，请及时点击“保存设置”进行保存', {
        count: selectedRowKeys.length,
      }),
    );
  };

  const handleSaveAnnouncement = () => {
    if (!announcementForm.content || !announcementForm.publishDate) {
      showError(t('请填写完整的公告信息'));
      return;
    }
    const normalized = {
      ...announcementForm,
      publishDate: announcementForm.publishDate.toISOString(),
      audienceScope:
        announcementForm.displayMode === 'global'
          ? announcementForm.audienceScope
          : 'all',
    };

    if (editingAnnouncement) {
      const next = announcementsList.map((item) =>
        item.id === editingAnnouncement.id ? { ...item, ...normalized } : item,
      );
      setAnnouncementsList(next);
      syncEditor(next.find((item) => item.id === editingAnnouncement.id));
      showSuccess(t('公告已更新，请及时点击“保存设置”进行保存'));
    } else {
      const newId = Math.max(...announcementsList.map((item) => item.id), 0) + 1;
      const newAnnouncement = { id: newId, ...normalized };
      const next = [...announcementsList, newAnnouncement];
      setAnnouncementsList(next);
      syncEditor(newAnnouncement);
      showSuccess(t('公告已添加，请及时点击“保存设置”进行保存'));
    }
    setHasChanges(true);
  };

  const submitAnnouncements = async () => {
    try {
      setLoading(true);
      const ok = await updateOption(
        'console_setting.announcements',
        JSON.stringify(announcementsList),
        t('系统公告已更新'),
      );
      if (ok) {
        setHasChanges(false);
      }
    } catch (error) {
      console.error('系统公告更新失败', error);
      showError(t('系统公告更新失败'));
    } finally {
      setLoading(false);
    }
  };

  const renderPreviewHtml = (content) => {
    return { __html: marked.parse(content || '') };
  };

  return (
    <>
      <Form.Section
        text={
          <div className='flex flex-col w-full'>
            <div className='mb-2'>
              <div className='flex items-center text-blue-500'>
                <Bell size={16} className='mr-2' />
                <Text>
                  {t(
                    '系统公告管理，可以发布系统通知和重要消息（最多100个，前端显示最新20条）',
                  )}
                </Text>
              </div>
            </div>

            <Divider margin='12px' />

            <div className='flex flex-col md:flex-row justify-between items-center gap-4 w-full'>
              <div className='flex gap-2 w-full md:w-auto order-2 md:order-1 flex-wrap'>
                <Button
                  theme='light'
                  type='primary'
                  icon={<Plus size={14} />}
                  onClick={handleAddAnnouncement}
                >
                  {t('添加公告')}
                </Button>
                <Button
                  icon={<Trash2 size={14} />}
                  type='danger'
                  theme='light'
                  onClick={handleBatchDelete}
                  disabled={selectedRowKeys.length === 0}
                >
                  {t('批量删除')}
                  {selectedRowKeys.length > 0 && ` (${selectedRowKeys.length})`}
                </Button>
                <Button
                  icon={<Save size={14} />}
                  onClick={submitAnnouncements}
                  loading={loading}
                  disabled={!hasChanges}
                  type='secondary'
                >
                  {t('保存设置')}
                </Button>
              </div>

              <div className='order-1 md:order-2 flex items-center gap-2'>
                <Switch checked={panelEnabled} onChange={handleToggleEnabled} />
                <Text>{panelEnabled ? t('已启用') : t('已禁用')}</Text>
              </div>
            </div>
          </div>
        }
      >
        <div className='grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4'>
          <Card
            title={t('公告时间线')}
            headerExtraContent={
              <Checkbox
                checked={
                  announcementsList.length > 0 &&
                  selectedRowKeys.length === announcementsList.length
                }
                onChange={(e) =>
                  setSelectedRowKeys(
                    e.target.checked ? announcementsList.map((item) => item.id) : [],
                  )
                }
              >
                {t('全选')}
              </Checkbox>
            }
            bodyStyle={{ maxHeight: 860, overflowY: 'auto' }}
          >
            <Text type='secondary'>
              {t('查看历史发布记录，并选择一条公告进行编辑。')}
            </Text>
            <Divider margin='12px' />
            {sortedAnnouncements.length === 0 ? (
              <Empty
                image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
                darkModeImage={
                  <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
                }
                description={t('暂无系统公告')}
                style={{ padding: 20 }}
              />
            ) : (
              <Timeline mode='left'>
                {sortedAnnouncements.map((item) => {
                  const active = editingAnnouncement?.id === item.id;
                  const typeMeta =
                    typeOptions.find((option) => option.value === item.type) ||
                    typeOptions[0];
                  return (
                    <Timeline.Item
                      key={item.id}
                      type={item.type || 'default'}
                      time={formatDateTimeString(new Date(item.publishDate))}
                    >
                      <div
                        onClick={() => handleSelectAnnouncement(item)}
                        style={{
                          cursor: 'pointer',
                          border: active
                            ? '1px solid var(--semi-color-primary)'
                            : '1px solid var(--semi-color-border)',
                          background: active
                            ? 'var(--semi-color-fill-0)'
                            : 'var(--semi-color-bg-2)',
                          borderRadius: 12,
                          padding: 12,
                          marginBottom: 8,
                        }}
                      >
                        <div className='flex justify-between items-start gap-3'>
                          <Space wrap>
                            <Tag color={typeMeta.color} shape='circle'>
                              {typeMeta.label}
                            </Tag>
                            <Tag color='white' shape='circle'>
                              {displayModeOptions.find(
                                (option) => option.value === item.displayMode,
                              )?.label || t('静默展示')}
                            </Tag>
                          </Space>
                          <Checkbox
                            checked={selectedRowKeys.includes(item.id)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSelectedRowKeys((prev) =>
                                checked
                                  ? [...prev, item.id]
                                  : prev.filter((id) => id !== item.id),
                              );
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className='mt-2 font-semibold text-sm'>
                          {getRelativeTime(item.publishDate)}
                        </div>
                        <div className='mt-2 text-sm line-clamp-3'>{item.content}</div>
                        <div className='mt-3 text-xs text-gray-500 flex flex-col gap-1'>
                          <span>
                            {t('展示范围')}：
                            {item.displayMode === 'global'
                              ? audienceScopeOptions.find(
                                  (option) => option.value === item.audienceScope,
                                )?.label || t('所有已登录用户')
                              : '-'}
                          </span>
                          {item.extra ? <span>{t('说明')}：{item.extra}</span> : null}
                        </div>
                      </div>
                    </Timeline.Item>
                  );
                })}
              </Timeline>
            )}
          </Card>

          <div className='flex flex-col gap-4'>
            <Card
              title={
                editingAnnouncement ? t('编辑公告') : t('创建公告')
              }
              headerExtraContent={
                editingAnnouncement ? (
                  <Button
                    icon={<Trash2 size={14} />}
                    theme='light'
                    type='danger'
                    onClick={() => handleDeleteAnnouncement(editingAnnouncement)}
                  >
                    {t('删除')}
                  </Button>
                ) : null
              }
            >
              <Text type='secondary'>
                {t('创建或更新系统公告，并保留完整历史记录。')}
              </Text>
              <Divider margin='12px' />
              <Form layout='vertical'>
                <Form.TextArea
                  field='content'
                  label={t('公告内容')}
                  placeholder={t('请输入公告内容（支持 Markdown/HTML）')}
                  maxCount={500}
                  rows={6}
                  value={announcementForm.content}
                  onChange={(value) =>
                    setAnnouncementForm((prev) => ({ ...prev, content: value }))
                  }
                />
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <Form.DatePicker
                    field='publishDate'
                    label={t('发布日期')}
                    type='dateTime'
                    value={announcementForm.publishDate}
                    onChange={(value) =>
                      setAnnouncementForm((prev) => ({
                        ...prev,
                        publishDate: value || new Date(),
                      }))
                    }
                  />
                  <Form.Select
                    field='type'
                    label={t('公告类型')}
                    optionList={typeOptions}
                    value={announcementForm.type}
                    onChange={(value) =>
                      setAnnouncementForm((prev) => ({ ...prev, type: value }))
                    }
                  />
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <Form.Select
                    field='displayMode'
                    label={t('展示方式')}
                    optionList={displayModeOptions}
                    value={announcementForm.displayMode}
                    onChange={(value) =>
                      setAnnouncementForm((prev) => ({
                        ...prev,
                        displayMode: value,
                      }))
                    }
                  />
                  <Form.Select
                    field='audienceScope'
                    label={t('展示范围')}
                    optionList={audienceScopeOptions}
                    value={announcementForm.audienceScope}
                    disabled={announcementForm.displayMode !== 'global'}
                    onChange={(value) =>
                      setAnnouncementForm((prev) => ({
                        ...prev,
                        audienceScope: value,
                      }))
                    }
                  />
                </div>
                <Form.Input
                  field='extra'
                  label={t('说明信息')}
                  placeholder={t('可选，公告的补充说明')}
                  value={announcementForm.extra}
                  onChange={(value) =>
                    setAnnouncementForm((prev) => ({ ...prev, extra: value }))
                  }
                />
                <div className='flex justify-end gap-2 mt-4 flex-wrap'>
                  <Button theme='light' onClick={handleAddAnnouncement}>
                    {t('重置')}
                  </Button>
                  <Button
                    type='primary'
                    icon={<FilePenLine size={14} />}
                    onClick={handleSaveAnnouncement}
                  >
                    {editingAnnouncement ? t('更新') : t('添加')}
                  </Button>
                </div>
              </Form>
            </Card>

            <Card
              title={
                <Space>
                  <Eye size={16} />
                  <span>{t('实时预览')}</span>
                </Space>
              }
            >
              <Space wrap>
                <Tag color='white' shape='circle'>
                  {typeOptions.find((option) => option.value === announcementForm.type)
                    ?.label || t('默认')}
                </Tag>
                <Tag color='white' shape='circle'>
                  {displayModeOptions.find(
                    (option) => option.value === announcementForm.displayMode,
                  )?.label || t('静默展示')}
                </Tag>
                {announcementForm.displayMode === 'global' ? (
                  <Tag color='white' shape='circle'>
                    {audienceScopeOptions.find(
                      (option) => option.value === announcementForm.audienceScope,
                    )?.label || t('所有已登录用户')}
                  </Tag>
                ) : null}
              </Space>
              <div className='mt-3 text-sm text-gray-500'>
                {announcementForm.publishDate
                  ? formatDateTimeString(announcementForm.publishDate)
                  : '-'}
              </div>
              <Divider margin='12px' />
              <div
                style={{ minHeight: 120 }}
                dangerouslySetInnerHTML={renderPreviewHtml(announcementForm.content)}
              />
              {announcementForm.extra ? (
                <>
                  <Divider margin='12px' />
                  <div
                    className='text-sm text-gray-500'
                    dangerouslySetInnerHTML={renderPreviewHtml(
                      announcementForm.extra,
                    )}
                  />
                </>
              ) : null}
            </Card>
          </div>
        </div>
      </Form.Section>

      <Modal
        title={t('确认删除')}
        visible={showDeleteModal}
        onOk={confirmDeleteAnnouncement}
        onCancel={() => {
          setShowDeleteModal(false);
          setDeletingAnnouncement(null);
        }}
        okText={t('确认删除')}
        cancelText={t('取消')}
        type='warning'
        okButtonProps={{ type: 'danger', theme: 'solid' }}
      >
        <Text>{t('确定要删除此公告吗？')}</Text>
      </Modal>
    </>
  );
};

export default SettingsAnnouncements;
