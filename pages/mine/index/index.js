const {
  fetchUser,
  fetchMineGroups,
  fetchMineGuides,
  fetchMineFavoriteGuides,
  fetchMineJoinedGroups,
  connectRealtime,
  goLoginPage,
  hasAuthToken,
  deleteMineGroup,
  deleteMineGuide,
  leaveGroup,
  MINE_PROFILE_REFRESH_KEY,
  MINE_LIST_REFRESH_KEY,
  MINE_TARGET_RECORD_TAB_KEY,
  MINE_FORCE_ALL_STATUS_KEY,
  getSchoolDisplayText
} = require('../../../utils/api');
const DialogModule = require('@vant/weapp/dialog/dialog');
const Dialog = DialogModule.default || DialogModule;

const MIN_LOADING_MS = 3000;
const MINE_PAGE_SIZE = 10;
const DEFAULT_NICKNAME = '微信用户';
const STATUS_KEYS = ['all', 'approved', 'pending', 'rejected'];
const JOINED_STATUS_KEYS = ['all', '招募中', '已截止', '成团'];

function filterJoinedGroups(list, statusKey) {
  const source = Array.isArray(list) ? list : [];
  if (!statusKey || statusKey === 'all') return source;
  return source.filter((item) => String(item.status || '') === statusKey);
}

function resolveStatusTabIndex(event) {
  const detail = (event && event.detail) || {};
  const rawIndex = typeof detail.index !== 'undefined'
    ? detail.index
    : (typeof detail.name !== 'undefined' ? detail.name : detail);
  const index = Number(rawIndex);
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

function consumeRefreshFlag(key) {
  const raw = wx.getStorageSync(key);
  const hit = raw === 1 || raw === '1' || raw === true || raw === 'true';
  if (hit) {
    wx.removeStorageSync(key);
  }
  return hit;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showConfirm(page, options) {
  if (Dialog && typeof Dialog.confirm === 'function') {
    return Dialog.confirm(Object.assign({ context: page, selector: '#van-dialog' }, options));
  }
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: options.title || '确认',
      content: options.message || '',
      confirmText: options.confirmButtonText || '确定',
      cancelText: options.cancelButtonText || '取消',
      success: (res) => {
        if (res.confirm) {
          resolve(true);
          return;
        }
        reject(new Error('cancel'));
      },
      fail: () => reject(new Error('cancel'))
    });
  });
}

Page({
  data: {
    loading: true,
    recordLoading: false,
    groupStatusLoading: false,
    guideStatusLoading: false,
    joinedStatusLoading: false,
    isAuthed: false,
    needsProfileCompletion: false,
    user: {},
    activeRecordTab: 0,
    groupStatusTab: 0,
    guideStatusTab: 0,
    groupStatusKey: 'all',
    guideStatusKey: 'all',
    groupList: [],
    groupPage: 1,
    groupPageSize: MINE_PAGE_SIZE,
    groupTotal: 0,
    guideList: [],
    guidePage: 1,
    guidePageSize: MINE_PAGE_SIZE,
    guideTotal: 0,
    favoriteGuideList: [],
    favoritePage: 1,
    favoritePageSize: MINE_PAGE_SIZE,
    favoriteTotal: 0,
    joinedGroupList: [],
    joinedGroupDisplayList: [],
    joinedPage: 1,
    joinedPageSize: MINE_PAGE_SIZE,
    joinedTotal: 0,
    joinedStatusTab: 0,
    joinedStatusKey: 'all',
    showAuthPopup: false
  },
  _isLoadingData: false,
  _isLoadingGroupList: false,
  _isLoadingGuideList: false,
  _isLoadingJoinedList: false,
  _profileLoaded: false,
  _listLoaded: false,
  _skipNextOnShow: false,
  _recordLoadToken: 0,
  offRealtime: null,
  onShow() {
    if (this._skipNextOnShow) {
      this._skipNextOnShow = false;
      return;
    }
    this.handleShow();
  },
  onLoad(){
    this._skipNextOnShow = true;
    this.handleShow({ initial: true });
  },
  onUnload() {
    if (this.offRealtime) {
      this.offRealtime();
      this.offRealtime = null;
    }
  },
  async handleShow(options = {}) {
    const initial = Boolean(options.initial);
    if (!hasAuthToken()) {
      this._profileLoaded = false;
      this._listLoaded = false;
      if (this.offRealtime) {
        this.offRealtime();
        this.offRealtime = null;
      }
      this.setData({
        loading: false,
        isAuthed: false,
        needsProfileCompletion: false,
        user: {},
        groupList: [],
        groupPage: 1,
        groupTotal: 0,
        guideList: [],
        guidePage: 1,
        guideTotal: 0,
        favoriteGuideList: [],
        favoritePage: 1,
        favoriteTotal: 0,
        joinedGroupList: [],
        joinedGroupDisplayList: [],
        joinedPage: 1,
        joinedTotal: 0,
        groupStatusTab: 0,
        guideStatusTab: 0,
        joinedStatusTab: 0,
        groupStatusKey: 'all',
        guideStatusKey: 'all',
        joinedStatusKey: 'all'
      });
      return;
    }

    if (!this.offRealtime) {
      this.offRealtime = connectRealtime((payload) => {
        if (!payload || !payload.event) return;
        if (payload.event === 'group_created' || payload.event === 'guide_created') {
          this.refreshListArea();
        }
      });
    }

    const nextData = {};
    const targetTab = String(wx.getStorageSync(MINE_TARGET_RECORD_TAB_KEY) || '').trim();
    if (targetTab) {
      nextData.activeRecordTab = targetTab === 'guide' ? 1 : 0;
      wx.removeStorageSync(MINE_TARGET_RECORD_TAB_KEY);
    }
    const forceAll = consumeRefreshFlag(MINE_FORCE_ALL_STATUS_KEY);
    if (forceAll) {
      nextData.groupStatusTab = 0;
      nextData.guideStatusTab = 0;
      nextData.groupStatusKey = 'all';
      nextData.guideStatusKey = 'all';
      nextData.groupPage = 1;
      nextData.guidePage = 1;
    }
    if (Object.keys(nextData).length) {
      this.setData(nextData);
    }

    const needsProfileRefresh = consumeRefreshFlag(MINE_PROFILE_REFRESH_KEY) || !this._profileLoaded;
    const needsListRefresh = consumeRefreshFlag(MINE_LIST_REFRESH_KEY) || !this._listLoaded;

    if (initial && (needsProfileRefresh || needsListRefresh)) {
      await this.loadData({ profile: needsProfileRefresh, list: needsListRefresh });
      return;
    }
    if (needsProfileRefresh) {
      await this.refreshProfileArea();
    }
    if (needsListRefresh) {
      await this.refreshListArea();
    }
  },
  async onPullDownRefresh() {
    try {
      await this.refreshListArea();
    } finally {
      wx.stopPullDownRefresh();
    }
  },
  async loadGroupListByStatus(statusKey, page = this.data.groupPage || 1) {
    const key = statusKey || this.data.groupStatusKey || 'all';
    const pageNo = Math.max(Number(page || 1), 1);
    const data = await fetchMineGroups({
      auditStatus: key === 'all' ? '' : key,
      page: pageNo,
      pageSize: this.data.groupPageSize || MINE_PAGE_SIZE
    });
    this.setData({
      groupList: (data && data.list) || [],
      groupPage: Number((data && data.page) || pageNo),
      groupTotal: Number((data && data.total) || 0)
    });
  },
  async loadGuideListByStatus(statusKey, page = this.data.guidePage || 1) {
    const key = statusKey || this.data.guideStatusKey || 'all';
    const pageNo = Math.max(Number(page || 1), 1);
    const data = await fetchMineGuides({
      auditStatus: key === 'all' ? '' : key,
      page: pageNo,
      pageSize: this.data.guidePageSize || MINE_PAGE_SIZE
    });
    this.setData({
      guideList: (data && data.list) || [],
      guidePage: Number((data && data.page) || pageNo),
      guideTotal: Number((data && data.total) || 0)
    });
  },
  async loadFavoriteGuideList(page = this.data.favoritePage || 1) {
    const pageNo = Math.max(Number(page || 1), 1);
    const favoriteData = await fetchMineFavoriteGuides({
      page: pageNo,
      pageSize: this.data.favoritePageSize || MINE_PAGE_SIZE
    });
    this.setData({
      favoriteGuideList: (favoriteData && favoriteData.list) || [],
      favoritePage: Number((favoriteData && favoriteData.page) || pageNo),
      favoriteTotal: Number((favoriteData && favoriteData.total) || 0)
    });
  },
  async loadJoinedGroupList(statusKey, page = this.data.joinedPage || 1) {
    const nextStatusKey = statusKey || this.data.joinedStatusKey || 'all';
    const pageNo = Math.max(Number(page || 1), 1);
    const joinedData = await fetchMineJoinedGroups({
      status: nextStatusKey === 'all' ? '' : nextStatusKey,
      page: pageNo,
      pageSize: this.data.joinedPageSize || MINE_PAGE_SIZE
    });
    const joinedGroupList = (joinedData && joinedData.list) || [];
    this.setData({
      joinedGroupList,
      joinedGroupDisplayList: filterJoinedGroups(joinedGroupList, nextStatusKey),
      joinedPage: Number((joinedData && joinedData.page) || pageNo),
      joinedTotal: Number((joinedData && joinedData.total) || 0)
    });
  },
  async refreshListArea() {
    if (!hasAuthToken()) {
      return;
    }
    try {
      const [groupData, guideData, favoriteData, joinedData] = await Promise.all([
        fetchMineGroups({
          auditStatus: this.data.groupStatusKey === 'all' ? '' : this.data.groupStatusKey,
          page: this.data.groupPage || 1,
          pageSize: this.data.groupPageSize || MINE_PAGE_SIZE
        }),
        fetchMineGuides({
          auditStatus: this.data.guideStatusKey === 'all' ? '' : this.data.guideStatusKey,
          page: this.data.guidePage || 1,
          pageSize: this.data.guidePageSize || MINE_PAGE_SIZE
        }),
        fetchMineFavoriteGuides({
          page: this.data.favoritePage || 1,
          pageSize: this.data.favoritePageSize || MINE_PAGE_SIZE
        }),
        fetchMineJoinedGroups({
          status: this.data.joinedStatusKey === 'all' ? '' : this.data.joinedStatusKey,
          page: this.data.joinedPage || 1,
          pageSize: this.data.joinedPageSize || MINE_PAGE_SIZE
        })
      ]);
      const joinedGroupList = (joinedData && joinedData.list) || [];
      const joinedStatusKey = this.data.joinedStatusKey || 'all';
      this.setData({
        groupList: (groupData && groupData.list) || [],
        groupPage: Number((groupData && groupData.page) || this.data.groupPage || 1),
        groupTotal: Number((groupData && groupData.total) || 0),
        guideList: (guideData && guideData.list) || [],
        guidePage: Number((guideData && guideData.page) || this.data.guidePage || 1),
        guideTotal: Number((guideData && guideData.total) || 0),
        favoriteGuideList: (favoriteData && favoriteData.list) || [],
        favoritePage: Number((favoriteData && favoriteData.page) || this.data.favoritePage || 1),
        favoriteTotal: Number((favoriteData && favoriteData.total) || 0),
        joinedGroupList,
        joinedGroupDisplayList: filterJoinedGroups(joinedGroupList, joinedStatusKey),
        joinedPage: Number((joinedData && joinedData.page) || this.data.joinedPage || 1),
        joinedTotal: Number((joinedData && joinedData.total) || 0)
      });
      this._listLoaded = true;
    } catch (error) {
      wx.showToast({ title: error.message || '列表刷新失败', icon: 'none' });
    }
  },
  async refreshProfileArea() {
    if (!hasAuthToken()) return;
    try {
      const userData = await fetchUser();
      const nickname = String(userData.nickname || '').trim();
      const avatar = String(userData.avatar || '').trim();
      const needsProfileCompletion = !nickname || nickname === DEFAULT_NICKNAME || !avatar;
      const user = Object.assign({}, userData, {
        schoolText: getSchoolDisplayText(userData.school)
      });
      this.setData({
        isAuthed: true,
        needsProfileCompletion,
        user
      });
      this._profileLoaded = true;
    } catch (error) {
      wx.showToast({ title: error.message || '资料加载失败', icon: 'none' });
    }
  },
  async loadData(options = {}) {
    if (this._isLoadingData) return;
    const shouldLoadProfile = options.profile !== false;
    const shouldLoadList = options.list !== false;
    this._isLoadingData = true;
    const startedAt = Date.now();
    if (!hasAuthToken()) {
      this.setData({
        loading: false,
        isAuthed: false,
        user: {},
        groupList: [],
        groupPage: 1,
        groupTotal: 0,
        guideList: [],
        guidePage: 1,
        guideTotal: 0,
        favoriteGuideList: [],
        favoritePage: 1,
        favoriteTotal: 0,
        joinedGroupList: [],
        joinedGroupDisplayList: [],
        joinedPage: 1,
        joinedTotal: 0,
        groupStatusTab: 0,
        guideStatusTab: 0,
        joinedStatusTab: 0,
        groupStatusKey: 'all',
        guideStatusKey: 'all',
        joinedStatusKey: 'all'
      });
      this._profileLoaded = false;
      this._listLoaded = false;
      this._isLoadingData = false;
      return;
    }
    this.setData({ loading: true });
    try {
      const tasks = [];
      if (shouldLoadProfile) {
        tasks.push(this.refreshProfileArea());
      }
      if (shouldLoadList) {
        tasks.push(this.refreshListArea());
      }
      await Promise.all(tasks);
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      const remain = MIN_LOADING_MS - (Date.now() - startedAt);
      if (remain > 0) {
        await new Promise((resolve) => setTimeout(resolve, remain));
      }
      this.setData({ loading: false });
      this._isLoadingData = false;
    }
  },
  async onRecordTabChange(event) {
    if (!hasAuthToken()) return;
    const detail = event.detail || {};
    const nextIndex = typeof detail.index !== 'undefined' ? detail.index : detail.name;
    const index = Number(nextIndex || 0);
    if (index === this.data.activeRecordTab) return;
    const token = this._recordLoadToken + 1;
    this._recordLoadToken = token;
    this.setData({ activeRecordTab: index, recordLoading: true });
    try {
      if (index === 0) {
        await this.loadGroupListByStatus();
      } else if (index === 1) {
        await this.loadGuideListByStatus();
      } else if (index === 2) {
        await this.loadFavoriteGuideList();
      } else if (index === 3) {
        await this.loadJoinedGroupList(this.data.joinedStatusKey || 'all');
      }
      await sleep(180);
    } catch (error) {
      wx.showToast({ title: error.message || '列表加载失败', icon: 'none' });
    } finally {
      if (token === this._recordLoadToken) {
        this.setData({ recordLoading: false });
      }
    }
  },
  async onGroupStatusTabChange(event) {
    if (this._isLoadingGroupList) return;
    const idx = resolveStatusTabIndex(event);
    const key = STATUS_KEYS[idx] || 'all';
    if (idx === this.data.groupStatusTab && key === this.data.groupStatusKey) return;
    this._isLoadingGroupList = true;
    this.setData({ groupStatusTab: idx, groupStatusKey: key, groupPage: 1, groupStatusLoading: true });
    try {
      await this.loadGroupListByStatus(key, 1);
      await sleep(120);
    } catch (error) {
      wx.showToast({ title: error.message || '拼团列表加载失败', icon: 'none' });
    } finally {
      this._isLoadingGroupList = false;
      this.setData({ groupStatusLoading: false });
    }
  },
  async onGuideStatusTabChange(event) {
    if (this._isLoadingGuideList) return;
    const idx = resolveStatusTabIndex(event);
    const key = STATUS_KEYS[idx] || 'all';
    if (idx === this.data.guideStatusTab && key === this.data.guideStatusKey) return;
    this._isLoadingGuideList = true;
    this.setData({ guideStatusTab: idx, guideStatusKey: key, guidePage: 1, guideStatusLoading: true });
    try {
      await this.loadGuideListByStatus(key, 1);
      await sleep(120);
    } catch (error) {
      wx.showToast({ title: error.message || '攻略列表加载失败', icon: 'none' });
    } finally {
      this._isLoadingGuideList = false;
      this.setData({ guideStatusLoading: false });
    }
  },
  async onJoinedStatusTabChange(event) {
    if (this._isLoadingJoinedList) return;
    const idx = resolveStatusTabIndex(event);
    const key = JOINED_STATUS_KEYS[idx] || 'all';
    if (idx === this.data.joinedStatusTab && key === this.data.joinedStatusKey) return;
    this._isLoadingJoinedList = true;
    this.setData({ joinedStatusTab: idx, joinedStatusKey: key, joinedPage: 1, joinedStatusLoading: true });
    try {
      await this.loadJoinedGroupList(key, 1);
      await sleep(120);
    } catch (error) {
      wx.showToast({ title: error.message || '参与记录加载失败', icon: 'none' });
    } finally {
      this._isLoadingJoinedList = false;
      this.setData({ joinedStatusLoading: false });
    }
  },
  async changePage(type, direction) {
    if (!hasAuthToken()) return;
    if (type === 'group') {
      const maxPage = Math.max(1, Math.ceil((this.data.groupTotal || 0) / (this.data.groupPageSize || MINE_PAGE_SIZE)));
      const nextPage = direction === 'prev' ? this.data.groupPage - 1 : this.data.groupPage + 1;
      if (nextPage < 1 || nextPage > maxPage || this._isLoadingGroupList) return;
      this._isLoadingGroupList = true;
      this.setData({ groupStatusLoading: true });
      try {
        await this.loadGroupListByStatus(this.data.groupStatusKey, nextPage);
      } finally {
        this._isLoadingGroupList = false;
        this.setData({ groupStatusLoading: false });
      }
      return;
    }
    if (type === 'guide') {
      const maxPage = Math.max(1, Math.ceil((this.data.guideTotal || 0) / (this.data.guidePageSize || MINE_PAGE_SIZE)));
      const nextPage = direction === 'prev' ? this.data.guidePage - 1 : this.data.guidePage + 1;
      if (nextPage < 1 || nextPage > maxPage || this._isLoadingGuideList) return;
      this._isLoadingGuideList = true;
      this.setData({ guideStatusLoading: true });
      try {
        await this.loadGuideListByStatus(this.data.guideStatusKey, nextPage);
      } finally {
        this._isLoadingGuideList = false;
        this.setData({ guideStatusLoading: false });
      }
      return;
    }
    if (type === 'favorite') {
      const maxPage = Math.max(1, Math.ceil((this.data.favoriteTotal || 0) / (this.data.favoritePageSize || MINE_PAGE_SIZE)));
      const nextPage = direction === 'prev' ? this.data.favoritePage - 1 : this.data.favoritePage + 1;
      if (nextPage < 1 || nextPage > maxPage || this.data.recordLoading) return;
      this.setData({ recordLoading: true });
      try {
        await this.loadFavoriteGuideList(nextPage);
      } finally {
        this.setData({ recordLoading: false });
      }
      return;
    }
    if (type === 'joined') {
      const maxPage = Math.max(1, Math.ceil((this.data.joinedTotal || 0) / (this.data.joinedPageSize || MINE_PAGE_SIZE)));
      const nextPage = direction === 'prev' ? this.data.joinedPage - 1 : this.data.joinedPage + 1;
      if (nextPage < 1 || nextPage > maxPage || this._isLoadingJoinedList) return;
      this._isLoadingJoinedList = true;
      this.setData({ joinedStatusLoading: true });
      try {
        await this.loadJoinedGroupList(this.data.joinedStatusKey, nextPage);
      } finally {
        this._isLoadingJoinedList = false;
        this.setData({ joinedStatusLoading: false });
      }
    }
  },
  onGroupPrevPage() {
    this.changePage('group', 'prev');
  },
  onGroupNextPage() {
    this.changePage('group', 'next');
  },
  onGuidePrevPage() {
    this.changePage('guide', 'prev');
  },
  onGuideNextPage() {
    this.changePage('guide', 'next');
  },
  onFavoritePrevPage() {
    this.changePage('favorite', 'prev');
  },
  onFavoriteNextPage() {
    this.changePage('favorite', 'next');
  },
  onJoinedPrevPage() {
    this.changePage('joined', 'prev');
  },
  onJoinedNextPage() {
    this.changePage('joined', 'next');
  },
  goGroupDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/group/detail/index?id=${id}`,
      fail: () => {
        wx.reLaunch({ url: `/pages/group/detail/index?id=${id}` });
      }
    });
  },
  goGuideDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/guide/detail/index?id=${id}`,
      fail: () => {
        wx.reLaunch({ url: `/pages/guide/detail/index?id=${id}` });
      }
    });
  },
  goFavoriteGuideDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/guide/detail/index?id=${id}`,
      fail: () => {
        wx.reLaunch({ url: `/pages/guide/detail/index?id=${id}` });
      }
    });
  },
  goJoinedGroupDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/group/detail/index?id=${id}`,
      fail: () => {
        wx.reLaunch({ url: `/pages/group/detail/index?id=${id}` });
      }
    });
  },
  editGroup(event) {
    const id = event.currentTarget.dataset.id;
    const auditStatus = String(event.currentTarget.dataset.auditStatus || '').trim();
    if (!id) return;
    if (auditStatus === 'pending') {
      wx.showToast({ title: '审核中内容暂不支持编辑', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/group/edit/index?id=${id}`,
      fail: () => {
        wx.reLaunch({ url: `/pages/group/edit/index?id=${id}` });
      }
    });
  },
  editGuide(event) {
    const id = event.currentTarget.dataset.id;
    const auditStatus = String(event.currentTarget.dataset.auditStatus || '').trim();
    if (!id) return;
    if (auditStatus === 'pending') {
      wx.showToast({ title: '审核中内容暂不支持编辑', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/guide/edit/index?id=${id}`,
      fail: () => {
        wx.reLaunch({ url: `/pages/guide/edit/index?id=${id}` });
      }
    });
  },
  async deleteGroup(event) {
    const id = event.currentTarget.dataset.id;
    const auditStatus = String(event.currentTarget.dataset.auditStatus || '').trim();
    const status = String(event.currentTarget.dataset.status || '').trim();
    if (!id) return;
    if (auditStatus === 'pending') {
      wx.showToast({ title: '审核中内容暂不支持删除', icon: 'none' });
      return;
    }
    const confirmMessage = status === '已截止'
      ? '确认删除该拼团吗？'
      : '确认删除该拼团吗？将解散所有成员';
    try {
      await showConfirm(this, {
        title: '删除确认',
        message: confirmMessage,
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      });
      await deleteMineGroup(id);
      wx.showToast({ title: '删除成功', icon: 'success' });
      await this.loadGroupListByStatus();
    } catch (error) {
      if (error && error.message === 'cancel') return;
      wx.showToast({ title: (error && error.message) || '删除失败', icon: 'none' });
    }
  },
  async deleteGuide(event) {
    const id = event.currentTarget.dataset.id;
    const auditStatus = String(event.currentTarget.dataset.auditStatus || '').trim();
    if (!id) return;
    if (auditStatus === 'pending') {
      wx.showToast({ title: '审核中内容暂不支持删除', icon: 'none' });
      return;
    }
    try {
      await showConfirm(this, {
        title: '删除确认',
        message: '确认删除该攻略吗？删除后将从列表隐藏。',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      });
      await deleteMineGuide(id);
      wx.showToast({ title: '删除成功', icon: 'success' });
      await this.loadGuideListByStatus();
    } catch (error) {
      if (error && error.message === 'cancel') return;
      wx.showToast({ title: (error && error.message) || '删除失败', icon: 'none' });
    }
  },
  async leaveJoinedGroup(event) {
    const id = event.currentTarget.dataset.id;
    const canQuit = Boolean(event.currentTarget.dataset.canQuit);
    if (!id) return;
    if (!canQuit) {
      wx.showToast({ title: '已截止拼团不可退团', icon: 'none' });
      return;
    }
    try {
      await showConfirm(this, {
        title: '退团确认',
        message: '确认退出该拼团吗？系统将通知团长。',
        confirmButtonText: '确认退团',
        cancelButtonText: '取消'
      });
      await leaveGroup(id);
      wx.showToast({ title: '已退出拼团', icon: 'success' });
      await this.loadJoinedGroupList(this.data.joinedStatusKey || 'all', this.data.joinedPage || 1);
    } catch (error) {
      if (error && error.message === 'cancel') return;
      wx.showToast({ title: (error && error.message) || '退团失败', icon: 'none' });
    }
  },
  goLogin() {
    goLoginPage();
  },
  goProfile() {
    if (!hasAuthToken()) {
      this.setData({ showAuthPopup: true });
      return;
    }
    wx.navigateTo({
      url: '/pages/mine/profile/index',
      fail: () => {
        wx.reLaunch({ url: '/pages/mine/profile/index' });
      }
    });
  },
  handleLogin() {
    this.setData({ showAuthPopup: false });
    goLoginPage();
  },
  handlePopupClose() {
    this.setData({ showAuthPopup: false });
  }
});
