const {
  fetchGroups,
  applyGroup,
  connectRealtime,
  goLoginPage,
  hasAuthToken
} = require('../../../utils/api');
const { areaList } = require('../../../utils/data');
const { getGapText, getCountdownMs } = require('../../../utils/groupTime');

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
    rawGroups: [],
    groups: [],
    keyword: '',
    loading: true,
    page: 1,
    hasMore: true,
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
    this.loadGroups(true);
    this.offRealtime = connectRealtime(() => {
      this.loadGroups(true);
    });
  },
  onUnload() {
    if (this.offRealtime) {
      this.offRealtime();
      this.offRealtime = null;
    }
  },
  async loadGroups(reset = false) {
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
      const response = await fetchGroups({ page, keyword: this.data.keyword });
      const decorated = (response.list || []).map((item) => ({
        ...item,
        gapText: getGapText(item.expireAt, item.date, item.departureTime, false),
        countdownTime: getCountdownMs(item.expireAt)
      }));
      const nextRawGroups = reset ? decorated : this.data.rawGroups.concat(decorated);
      const nextGroups = this.applyDestinationFilter(nextRawGroups);
      const nextHasMore = Boolean(response.hasMore);
      const nextPage = nextHasMore ? page + 1 : page;
      this.setData({
        rawGroups: nextRawGroups,
        groups: nextGroups,
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
    this.loadGroups(true);
  },
  clearTreeSelect() {
    this.setData({
      activeIds: [],
      selectedDestinations: [],
      filterLabel: '全部',
      groups: this.data.rawGroups,
      showTreeSelect: false
    });
    this.loadGroups(true);
  },
  onSearch() {
    this.loadGroups(true);
  },
  onKeywordChange(event) {
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
    wx.setStorageSync('publishActiveTab', 'group');
    wx.switchTab({ url: '/pages/add/add' });
  },
  toDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/group/detail/index?id=${id}`,
      fail: () => {
        wx.reLaunch({ url: `/pages/group/detail/index?id=${id}` });
      }
    });
  },
  async join(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    if (!this.canUseFeature()) return;
    try {
      await applyGroup(id);
      wx.showToast({ title: '申请成功', icon: 'success' });
      await this.loadGroups(true);
    } catch (error) {
      wx.showToast({ title: error.message || '申请失败', icon: 'none' });
    }
  },
  handleCountdownFinish(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const updated = this.data.groups.map((item) =>
      item.id === id ? { ...item, countdownTime: 0 } : item
    );
    this.setData({ groups: updated });
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
    this.loadGroups(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },
  onReachBottom() {
    this.loadGroups(false);
  }
});
