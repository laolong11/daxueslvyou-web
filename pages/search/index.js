const { fetchGroups, fetchGuides } = require('../../utils/api');
const { getGapText, getCountdownMs } = require('../../utils/groupTime');

const MIN_LOADING_MS = 160;

function parseSearchValue(detail) {
  if (detail && typeof detail === 'object' && detail !== null && 'value' in detail) {
    return String(detail.value || '');
  }
  return String(detail || '');
}

Page({
  data: {
    keyword: '',
    groups: [],
    guides: [],
    resultCards: [],
    page: 1,
    hasMore: true,
    loading: false,
    skeletonItems: [1, 2, 3]
  },
  onLoad() {
    this.loadResults(true);
  },
  async loadResults(reset = false) {
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
      const keyword = (this.data.keyword || '').trim();
      const [groupData, guideData] = await Promise.all([
        fetchGroups({ page, keyword }),
        fetchGuides({ page, keyword })
      ]);
      const nextGroups = reset ? (groupData.list || []) : this.data.groups.concat(groupData.list || []);
      const nextGuides = reset ? (guideData.list || []) : this.data.guides.concat(guideData.list || []);
      const nextHasMore = Boolean(groupData.hasMore || guideData.hasMore);
      const nextPage = nextHasMore ? page + 1 : page;
      const resultCards = this.buildResultCards(nextGroups, nextGuides, keyword);
      this.setData({
        groups: nextGroups,
        guides: nextGuides,
        resultCards,
        hasMore: nextHasMore,
        page: nextPage
      });
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
  buildResultCards(groups, guides, keyword = '') {
    const groupCards = (groups || []).map((item) => ({
      key: `g_${item.id}`,
      type: 'group',
      id: item.id,
      title: item.destination,
      desc: item.plan,
      meta: `团长 ${item.leader} · ${item.joined}/${item.maxPeople}`,
      isOfficial: Boolean(item.isOfficial),
      viewCount: Number(item.viewCount || 0),
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
      viewCount: Number(item.viewCount || 0),
      image: (item.images && item.images[0]) || ''
    }));
    const merged = [...groupCards, ...guideCards].sort((a, b) => b.viewCount - a.viewCount);
    if (!keyword) {
      return merged.slice(0, 5);
    }
    return merged;
  },
  onSearch(event) {
    const nextKeyword = parseSearchValue(event && event.detail).trim();
    if (typeof nextKeyword === 'string') {
      this.setData({ keyword: nextKeyword });
    }
    this.loadResults(true);
  },
  onInputChange(event) {
    this.setData({ keyword: parseSearchValue(event.detail) });
  },
  goDetail(event) {
    const { id, type } = event.currentTarget.dataset;
    if (!id || !type) return;
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
  cancelSearch() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.reLaunch({ url: '/pages/index/index' });
  },
  onPullDownRefresh() {
    this.loadResults(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },
  onReachBottom() {
    this.loadResults(false);
  }
});
