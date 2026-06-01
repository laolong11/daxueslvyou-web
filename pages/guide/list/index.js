const {
  fetchGuides,
  connectRealtime,
  goLoginPage,
  hasAuthToken,
  toggleGuideFavorite,
  toggleGuideLike
} = require('../../../utils/api');
const { areaList } = require('../../../utils/data');

const MIN_LOADING_MS = 160;

function buildCityTree(list = {}) {
  const provinceList = list.province_list || {};
  const cityList = list.city_list || {};
  const provinceCodes = Object.keys(provinceList).sort();
  const cityEntries = Object.keys(cityList).map((code) => [code, cityList[code]]);

  const items = provinceCodes.map((provinceCode) => {
    const provinceName = provinceList[provinceCode];
    const prefix = String(provinceCode).slice(0, 2);
    const children = cityEntries
      .filter(([cityCode]) => String(cityCode).slice(0, 2) === prefix)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([cityCode, cityName]) => ({
        id: String(cityCode),
        text: cityName,
        destination: `${provinceName} ${cityName}`
      }));

    return {
      text: provinceName,
      code: String(provinceCode),
      children
    };
  });

  return items.filter((item) => item.children.length > 0);
}

function buildDestinationMap(items = []) {
  const map = {};
  items.forEach((province) => {
    (province.children || []).forEach((city) => {
      map[city.id] = city.destination;
    });
  });
  return map;
}

Page({
  data: {
    keyword: '',
    rawGuides: [],
    guides: [],
    page: 1,
    hasMore: true,
    loading: true,
    showAuthPopup: false,
    skeletonItems: [1, 2, 3],
    showTreeSelect: false,
    treeItems: [],
    mainActiveIndex: 0,
    activeIds: [],
    selectedDestinations: [],
    destinationMap: {},
    filterLabel: '全部'
  },
  offRealtime: null,
  onLoad() {
    const treeItems = buildCityTree(areaList);
    this.setData({
      treeItems,
      destinationMap: buildDestinationMap(treeItems)
    });
    this.loadGuides(true);
    this.offRealtime = connectRealtime(() => {
      this.loadGuides(true);
    });
  },
  onUnload() {
    if (this.offRealtime) {
      this.offRealtime();
      this.offRealtime = null;
    }
  },
  async loadGuides(reset = false) {
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
      const response = await fetchGuides({
        page,
        keyword: this.data.keyword,
        destination: ''
      });
      const list = response.list || [];
      const nextRawGuides = reset ? list : this.data.rawGuides.concat(list);
      const nextGuides = this.applyDestinationFilter(nextRawGuides);
      const nextHasMore = Boolean(response.hasMore);
      const nextPage = nextHasMore ? page + 1 : page;
      this.setData({
        rawGuides: nextRawGuides,
        guides: nextGuides,
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
  applyDestinationFilter(list = []) {
    const selectedDestinations = this.data.selectedDestinations || [];
    if (!selectedDestinations.length) {
      return list;
    }
    return list.filter((item) => selectedDestinations.includes(item.destination));
  },
  openTreeSelect() {
    this.setData({ showTreeSelect: true });
  },
  closeTreeSelect() {
    this.setData({ showTreeSelect: false });
  },
  handleTreeNavClick(event) {
    this.setData({ mainActiveIndex: Number(event.detail.index || 0) });
  },
  handleTreeItemClick(event) {
    const item = event.detail || {};
    const id = String(item.id || '');
    if (!id) return;
    const destination = item.destination || (this.data.destinationMap || {})[id] || '';
    const activeIds = [id];
    const selectedDestinations = destination ? [destination] : [];
    const filterLabel = destination || '全部';
    this.setData({
      activeIds,
      selectedDestinations,
      filterLabel,
      showTreeSelect: false
    });
    this.loadGuides(true);
  },
  clearTreeSelect() {
    this.setData({
      activeIds: [],
      selectedDestinations: [],
      filterLabel: '全部',
      guides: this.data.rawGuides,
      showTreeSelect: false
    });
    this.loadGuides(true);
  },
  confirmTreeSelect() {
    const destinationMap = this.data.destinationMap || {};
    const selectedDestinations = (this.data.activeIds || [])
      .map((id) => destinationMap[id])
      .filter(Boolean);
    const filterLabel = selectedDestinations.length
      ? `已选 ${selectedDestinations.length} 项`
      : '全部';
    this.setData({
      selectedDestinations,
      filterLabel,
      guides: this.applyDestinationFilter(this.data.rawGuides),
      showTreeSelect: false
    });
  },
  onSearch(event) {
    this.setData({ keyword: (event.detail || '').trim() });
    this.loadGuides(true);
  },
  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value || '' });
  },
  openPublishPage(url) {
    if (!this.canUseFeature()) return;
    wx.navigateTo({
      url,
      fail: () => {
        wx.reLaunch({ url });
      }
    });
  },
  goPublish() {
    if (!this.canUseFeature()) return;
    wx.setStorageSync('publishActiveTab', 'guide');
    wx.switchTab({ url: '/pages/add/add' });
  },
  toDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/guide/detail/index?id=${id}`,
      fail: () => {
        wx.reLaunch({ url: `/pages/guide/detail/index?id=${id}` });
      }
    });
  },
  async like(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    if (!this.canUseFeature()) return;
    try {
      await toggleGuideLike(id);
      wx.showToast({ title: '已操作', icon: 'success' });
      this.loadGuides(true);
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    }
  },
  async favorite(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    if (!this.canUseFeature()) return;
    try {
      await toggleGuideFavorite(id);
      wx.showToast({ title: '已操作', icon: 'success' });
      this.loadGuides(true);
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    }
  },
  canUseFeature() {
    if (hasAuthToken()) return true;
    this.setData({ showAuthPopup: true });
    return false;
  },
  handleLogin() {
    this.setData({ showAuthPopup: false });
    goLoginPage();
  },
  handlePopupClose() {
    this.setData({ showAuthPopup: false });
  },
  onPullDownRefresh() {
    this.loadGuides(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },
  onReachBottom() {
    this.loadGuides(false);
  }
});
