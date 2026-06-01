const {
  connectRealtime,
  fetchMessages,
  goLoginPage,
  hasAuthToken,
  readMessage
} = require('../../../utils/api');
const DialogModule = require('@vant/weapp/dialog/dialog');
const Dialog = DialogModule.default || DialogModule;

function formatDateTimeMinute(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function formatMessageItem(item) {
  const createdAtText = formatDateTimeMinute(item.createdAt);
  return Object.assign({}, item, { createdAtText });
}

function showAlert(page, options) {
  if (Dialog && typeof Dialog.alert === 'function') {
    return Dialog.alert(Object.assign({ context: page, selector: '#van-dialog' }, options));
  }
  return Promise.resolve(
    wx.showModal({
      title: options.title || '提示',
      content: options.message || '',
      showCancel: false,
      confirmText: options.confirmButtonText || '确定'
    })
  );
}

function calcUnread(list = []) {
  return list.filter((item) => !item.read).length;
}

function setUnreadMeta(page, unread) {
  wx.setStorageSync('unread_count', unread);
  wx.setNavigationBarTitle({ title: `消息中心(${unread})` });
}

Page({
  data: {
    loading: true,
    list: [],
    displayList: [],
    unread: 0,
    filter: 'all',
    showAuthPopup: false
  },
  offRealtime: null,
  onShow() {
    if (!hasAuthToken()) {
      this.setData({ loading: false, showAuthPopup: true });
      return;
    }
    this.setData({ showAuthPopup: false });
    if (!this.offRealtime) {
      this.offRealtime = connectRealtime((payload) => {
        if (!payload || !payload.event) return;
        this.applyRealtimePayload(payload);
      });
    }
    const unread = Number(wx.getStorageSync('unread_count') || this.data.unread || 0);
    if (unread !== this.data.unread) {
      this.setData({ unread });
    }
    this.applyFilter();
    setUnreadMeta(this, Number(unread || 0));
  },
  onUnload() {
    if (this.offRealtime) {
      this.offRealtime();
      this.offRealtime = null;
    }
  },
  async onPullDownRefresh() {
    try {
      await this.refreshMessages();
    } finally {
      wx.stopPullDownRefresh();
    }
  },
  async refreshMessages() {
    this.setData({ loading: true });
    try {
      const data = await fetchMessages();
      const list = (data.list || []).map(formatMessageItem);
      const unread = Number(data.unread || calcUnread(list));
      this.setData({
        list,
        unread
      });
      this.applyFilter();
      setUnreadMeta(this, unread);
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
  applyRealtimePayload(payload) {
    if (!payload || !payload.event) return;
    const event = String(payload.event);
    const incoming = payload.data ? formatMessageItem(payload.data) : null;
    if (!incoming || !incoming.id) return;
    const list = Array.isArray(this.data.list) ? [...this.data.list] : [];
    const index = list.findIndex((item) => String(item.id) === String(incoming.id));
    if (index >= 0) {
      list[index] = Object.assign({}, list[index], incoming);
    } else if (event === 'message_created') {
      list.unshift(incoming);
    } else {
      return;
    }
    const unread = calcUnread(list);
    this.setData({ list, unread });
    this.applyFilter();
    setUnreadMeta(this, unread);
  },
  setMessageReadLocal(id) {
    const list = Array.isArray(this.data.list) ? [...this.data.list] : [];
    const index = list.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return;
    if (list[index].read) return;
    list[index] = Object.assign({}, list[index], { read: true });
    const unread = calcUnread(list);
    this.setData({ list, unread });
    this.applyFilter();
    setUnreadMeta(this, unread);
  },
  setFilter(value) {
    this.setData({ filter: value });
    this.applyFilter();
  },
  setFilterAll() {
    this.setFilter('all');
  },
  setFilterAudit() {
    this.setFilter('audit');
  },
  setFilterOther() {
    this.setFilter('other');
  },
  setFilterSystem() {
    this.setFilter('system');
  },
  filteredList() {
    if (this.data.filter === 'audit') {
      return this.data.list.filter((item) => item.category === 'audit');
    }
    if (this.data.filter === 'other') {
      return this.data.list.filter((item) => item.category === 'other');
    }
    if (this.data.filter === 'system') {
      return this.data.list.filter((item) => item.category === 'system');
    }
    return this.data.list;
  },
  applyFilter() {
    this.setData({
      displayList: this.filteredList()
    });
  },
  async markRead(event) {
    const item = event.currentTarget.dataset.item || {};
    const id = item.id;
    if (!id) return;
    try {
      if (!item.read) {
        await readMessage(id);
        this.setMessageReadLocal(id);
      }
      const createdAt = formatDateTimeMinute(item.createdAtText || item.createdAt);
      const dialogMessage = `${item.content || ''}${createdAt ? `\n\n发布时间：${createdAt}` : ''}`;
      if (item.category === 'system') {
        showAlert(this, {
          title: item.title || '系统通知',
          message: dialogMessage,
          confirmButtonText: '我知道了'
        });
        return;
      }
      if (item.targetPath) {
        wx.navigateTo({
          url: item.targetPath,
          fail: () => {
            wx.switchTab({ url: '/pages/index/index' });
          }
        });
        return;
      }
      showAlert(this, {
        title: item.title || '消息通知',
        message: dialogMessage,
        confirmButtonText: '我知道了'
      });
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    }
  },
  goLogin() {
    this.setData({ showAuthPopup: false });
    goLoginPage();
  },
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: '/pages/index/index' });
  }
});
