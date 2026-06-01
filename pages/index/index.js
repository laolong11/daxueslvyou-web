const DialogModule = require('@vant/weapp/dialog/dialog');
const Dialog = DialogModule.default || DialogModule;

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
const { fetchGroups, fetchGuides, fetchLatestNotice, fetchLatestAd } = require('../../utils/api');
const { getGapText, getCountdownMs } = require('../../utils/groupTime');

const MIN_LOADING_MS = 160;

Page({
  data: {
    loading: true,
    groups: [],
    guides: [],
    topBanners: [],
    resultCards: [],
    latestNotice: null,
    latestAd: null,
    adDialogVisible: false,
    page: 1,
    hasMore: true,
    skeletonItems: [1, 2, 3]
  },
  initialized: false,
  onLoad() {
    this.loadData(true);
  },
  onShow() {
    if (!this.initialized) {
      this.initialized = true;
      this.loadData(true);
    }
  },
  async loadData(reset = false) {
    if (!reset && !this.data.hasMore) {
      return;
    }
    const startedAt = Date.now();
    if (reset) {
      this.setData({ page: 1, hasMore: true });
    }
    this.setData({ loading: true });
    try {
      const page = this.data.page;
      const [groupData, guideData] = await Promise.all([
        fetchGroups({ page }),
        fetchGuides({ page })
      ]);
      const [noticeData, adData] = await Promise.all([
        fetchLatestNotice().catch(() => ({ notice: null })),
        fetchLatestAd().catch(() => ({ ad: null }))
      ]);
      const nextGroups = reset ? (groupData.list || []) : this.data.groups.concat(groupData.list || []);
      const nextGuides = reset ? (guideData.list || []) : this.data.guides.concat(guideData.list || []);
      const nextHasMore = Boolean(groupData.hasMore || guideData.hasMore);
      const nextPage = nextHasMore ? page + 1 : page;
      const resultCards = this.buildResultCards(nextGroups, nextGuides);
      const topBanners = this.buildMixedTopBanners(nextGroups, nextGuides);
      this.setData({
        groups: nextGroups,
        guides: nextGuides,
        latestNotice: noticeData.notice || null,
        latestAd: adData.ad || null,
        topBanners,
        resultCards,
        hasMore: nextHasMore,
        page: nextPage
      });
      this.tryShowLatestAd();
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      const remain = MIN_LOADING_MS - (Date.now() - startedAt);
      if (remain > 0) {
        await new Promise((resolve) => setTimeout(resolve, remain));
      }
      this.setData({ loading: false });
    }
  },
  onTapNotice() {
    const notice = this.data.latestNotice;
    if (!notice) return;
    showAlert(this, {
      title: notice.title || '系统通知',
      message: `${notice.content || ''}${notice.createdAt ? `\n\n发布时间：${notice.createdAt}` : ''}`
    });
  },
  tryShowLatestAd() {
    const ad = this.data.latestAd;
    if (!ad || !ad.id) return;
    const key = `ad_popup_seen_${ad.id}`;
    if (wx.getStorageSync(key)) return;
    wx.setStorageSync(key, 1);
    this.setData({ adDialogVisible: true });
  },
  closeAdDialog() {
    this.setData({ adDialogVisible: false });
  },
  previewAdImage() {
    const ad = this.data.latestAd;
    if (!ad || !ad.image) return;
    wx.previewImage({
      current: ad.image,
      urls: [ad.image]
    });
  },
  buildResultCards(groups, guides) {
    const groupCards = (groups || []).map((item) => ({
      key: `g_${item.id}`,
      type: 'group',
      id: item.id,
      title: item.destination,
      desc: item.plan,
      meta: `团长 ${item.leader} · ${item.joined}/${item.maxPeople}`,
      isOfficial: Boolean(item.isOfficial),
      countdownTime: getCountdownMs(item.expireAt),
      image: (item.images && item.images[0]) || ''
    }));
    const guideCards = (guides || []).map((item) => ({
      key: `gd_${item.id}`,
      type: 'guide',
      id: item.id,
      title: item.title,
      desc: item.summary,
      meta: `${item.destination} · 👍${item.likes}`,
      isOfficial: Boolean(item.isOfficial),
      image: (item.images && item.images[0]) || ''
    }));
    return [...groupCards, ...guideCards];
  },
  buildMixedTopBanners(groups = [], guides = []) {
    const groupBanners = (groups || []).map((item) => ({
      key: `group_${item.id}`,
      id: item.id,
      type: 'group',
      image: (item.images && item.images[0]) || '/static/app_icon.png',
      destination: item.destination || '',
      title: (item.plan || '拼团招募').slice(0, 30),
      viewCount: Number(item.viewCount || 0)
    }));
    const guideBanners = (guides || []).map((item) => ({
      key: `guide_${item.id}`,
      id: item.id,
      type: 'guide',
      image: (item.images && item.images[0]) || '/static/app_icon.png',
      destination: item.destination || '',
      title: item.title || '攻略推荐',
      viewCount: Number(item.viewCount || 0)
    }));
    return [...groupBanners, ...guideBanners]
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10);
  },
  goBannerDetail(event) {
    const { type, id } = event.currentTarget.dataset;
    if (!type || !id) return;
    const target = type === 'group' ? `/pages/group/detail/index?id=${id}` : `/pages/guide/detail/index?id=${id}`;
    wx.navigateTo({
      url: target,
      fail: () => {
        wx.reLaunch({ url: target });
      }
    });
  },
  goDetail(event) {
    const { type, id } = event.currentTarget.dataset;
    if (!type || !id) return;
    const target = type === 'group' ? `/pages/group/detail/index?id=${id}` : `/pages/guide/detail/index?id=${id}`;
    wx.navigateTo({
      url: target,
      fail: () => {
        wx.reLaunch({ url: target });
      }
    });
  },
  handleCardCountdownFinish(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const updated = this.data.resultCards.map((item) =>
      item.type === 'group' && String(item.id) === String(id)
        ? { ...item, countdownTime: 0 }
        : item
    );
    this.setData({ resultCards: updated });
  },
  
  onPullDownRefresh() {
    this.loadData(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },
  onReachBottom() {
    this.loadData(false);
  }
});
