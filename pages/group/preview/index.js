const { fetchGroupDetail } = require('../../../utils/api');

function formatDeparture(group) {
  if (!group) return '';
  const date = group.date || '';
  const time = group.departureTime || '';
  return `${date} ${time}`.trim();
}

Page({
  data: {
    loading: true,
    images: [],
    current: 0,
    destination: '',
    departureDisplay: '',
    publisher: {
      avatar: '/static/app_icon.png',
      nickname: '发起人'
    }
  },
  id: '',
  onLoad(options) {
    this.id = options.id || '';
    this.initialIndex = Number(options.index || 0);
    this.load();
  },
  async load() {
    if (!this.id) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      const group = await fetchGroupDetail(this.id);
      const images = Array.isArray(group.images) ? group.images : [];
      const leader = (group.members || []).find((item) => item.role === 'leader') || {};
      const safeIndex = Math.max(0, Math.min(this.initialIndex || 0, Math.max(images.length - 1, 0)));
      this.setData({
        images,
        current: safeIndex,
        destination: group.destination || '',
        departureDisplay: formatDeparture(group),
        publisher: {
          avatar: leader.avatar || '/static/app_icon.png',
          nickname: leader.nickname || '发起人'
        }
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
  onSwiperChange(event) {
    this.setData({ current: Number(event.detail.current || 0) });
  },
  closePage() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: '/pages/group/list/index' });
  }
});
