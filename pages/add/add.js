const { areaList } = require('../../utils/data');
const {
  createGroup,
  createGuide,
  uploadImageToOss,
  goLoginPage,
  hasAuthToken,
  MINE_LIST_REFRESH_KEY,
  MINE_TARGET_RECORD_TAB_KEY,
  MINE_FORCE_ALL_STATUS_KEY
} = require('../../utils/api');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDateTime(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') {
    return raw;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function parsePickerDetail(detail) {
  if (detail && typeof detail === 'object' && detail !== null && 'value' in detail) {
    return detail.value;
  }
  return detail;
}

function getCurrentTimeHHmm() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseGroupDepartureTimestamp(dateStr, timeStr) {
  if (!dateStr || !timeStr) return NaN;
  return new Date(`${String(dateStr).trim()} ${String(timeStr).trim()}:00`).getTime();
}

function getGroupDateBoundary() {
  const now = new Date();
  const min = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const maxDate = new Date(now);
  maxDate.setMonth(maxDate.getMonth() + 6);
  const max = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 23, 59, 59).getTime();
  return { min, max };
}

function parseStepperValue(detail, fallback = 1) {
  if (detail && typeof detail === 'object' && detail !== null && 'value' in detail) {
    return Number(detail.value || fallback);
  }
  return Number(detail || fallback);
}

function parseFieldValue(detail) {
  if (detail && typeof detail === 'object' && detail !== null && 'value' in detail) {
    return String(detail.value || '');
  }
  return String(detail || '');
}

function createInitialGuideForm() {
  return {
    title: '',
    destination: '',
    travelDate: '',
    days: 1,
    route: '',
    summary: '',
    images: [],
    minDate: new Date(2020, 0, 1).getTime(),
    maxDate: new Date().getTime()
  };
}

function createInitialGroupForm() {
  return {
    destination: '',
    contact: '',
    date: '',
    departureTime: '',
    expireAt: '',
    maxPeople: 4,
    plan: '',
    images: []
  };
}

Page({
  data: {
    pageLoading: true,
    skeletonItems: [1, 2],
    activeTab: 0,
    areaList,
    guideForm: createInitialGuideForm(),
    groupForm: createInitialGroupForm(),
    guideFileList: [],
    groupFileList: [],
    showGuideArea: false,
    showGroupArea: false,
    showGuideCalendar: false,
    showGroupCalendar: false,
    showDeparturePicker: false,
    showExpirePicker: false,
    groupMinDate: getGroupDateBoundary().min,
    groupMaxDate: getGroupDateBoundary().max,
    departurePickerValue: getCurrentTimeHHmm(),
    expireMinTimestamp: Date.now(),
    expireMaxTimestamp: Date.now(),
    expireTimestamp: Date.now(),
    submittingGroup: false,
    submittingGuide: false
  },
  onShow() {
    if (!hasAuthToken()) {
      goLoginPage();
      return;
    }
    const pendingTab = wx.getStorageSync('publishActiveTab');
    if (pendingTab === 'guide') {
      this.setData({ activeTab: 1 });
      wx.removeStorageSync('publishActiveTab');
      return;
    }
    if (pendingTab === 'group') {
      this.setData({ activeTab: 0 });
      wx.removeStorageSync('publishActiveTab');
    }
  },
  onLoad(options) {
    if (options && options.tab === 'guide') {
      this.setData({ activeTab: 1 });
    }
    setTimeout(() => {
      this.setData({ pageLoading: false });
    }, 180);
  },
  onTabChange(event) {
    const detail = event.detail || {};
    const nextIndex = typeof detail.index !== 'undefined' ? detail.index : detail.name;
    this.setData({ activeTab: Number(nextIndex || 0) });
  },
  openArea(event) {
    const target = event.currentTarget.dataset.target;
    if (target === 'guide') {
      this.setData({ showGuideArea: true });
      return;
    }
    this.setData({ showGroupArea: true });
  },
  closeArea(event) {
    const target = event.currentTarget.dataset.target;
    if (target === 'guide') {
      this.setData({ showGuideArea: false });
      return;
    }
    this.setData({ showGroupArea: false });
  },
  onAreaConfirm(event) {
    const target = event.currentTarget.dataset.target;
    const values = event.detail.values || [];
    const destination = values.map((item) => item.name).join(' ');
    if (target === 'guide') {
      this.setData({
        'guideForm.destination': destination,
        showGuideArea: false
      });
      return;
    }
    this.setData({
      'groupForm.destination': destination,
      showGroupArea: false
    });
  },
  openGuideCalendar() {
    this.setData({ showGuideCalendar: true });
  },
  closeGuideCalendar() {
    this.setData({ showGuideCalendar: false });
  },
  onGuideCalendarConfirm(event) {
    const value = event.detail;
    const dateValue = Array.isArray(value) ? value[0] : value;
    this.setData({
      'guideForm.travelDate': formatDate(new Date(dateValue)),
      showGuideCalendar: false
    });
  },
  openGroupCalendar() {
    this.setData({ showGroupCalendar: true });
  },
  closeGroupCalendar() {
    this.setData({ showGroupCalendar: false });
  },
  onGroupCalendarConfirm(event) {
    const value = event.detail;
    const dateValue = Array.isArray(value) ? value[0] : value;
    this.setData({
      'groupForm.date': formatDate(new Date(dateValue)),
      showGroupCalendar: false
    });
    this.ensureExpireAtValid();
  },
  openDeparturePopup() {
    this.setData({
      showDeparturePicker: true,
      departurePickerValue: this.data.groupForm.departureTime || getCurrentTimeHHmm()
    });
  },
  closeDeparturePopup() {
    this.setData({ showDeparturePicker: false });
  },
  onDepartureConfirm(event) {
    const departureValue = String(parsePickerDetail(event.detail) || '').trim();
    this.setData({
      'groupForm.departureTime': departureValue,
      showDeparturePicker: false
    });
    this.ensureExpireAtValid();
  },
  openExpirePopup() {
    const { date, departureTime } = this.data.groupForm;
    if (!departureTime) {
      wx.showToast({ title: '请先选择出发时间', icon: 'none' });
      return;
    }
    if (!date) {
      wx.showToast({ title: '请先选择出发日期', icon: 'none' });
      return;
    }
    const departureTs = parseGroupDepartureTimestamp(date, departureTime);
    if (Number.isNaN(departureTs)) {
      wx.showToast({ title: '出发日期时间无效', icon: 'none' });
      return;
    }
    const now = Date.now();
    const maxAllowed = departureTs - 1000;
    if (maxAllowed <= now) {
      wx.showToast({ title: '出发时间需晚于当前时间', icon: 'none' });
      return;
    }
    const nextValue = this.data.expireTimestamp <= maxAllowed ? this.data.expireTimestamp : now;
    this.setData({
      showExpirePicker: true,
      expireMinTimestamp: now,
      expireMaxTimestamp: maxAllowed,
      expireTimestamp: nextValue
    });
  },
  closeExpirePopup() {
    this.setData({ showExpirePicker: false });
  },
  onExpireConfirm(event) {
    const value = Number(parsePickerDetail(event.detail));
    const { date, departureTime } = this.data.groupForm;
    const departureTs = parseGroupDepartureTimestamp(date, departureTime);
    if (Number.isNaN(departureTs)) {
      wx.showToast({ title: '请先选择出发日期和时间', icon: 'none' });
      this.setData({ showExpirePicker: false });
      return;
    }
    if (value >= departureTs) {
      wx.showToast({ title: '截止时间需早于出发时间', icon: 'none' });
      return;
    }
    this.setData({
      expireTimestamp: value,
      'groupForm.expireAt': normalizeDateTime(value),
      showExpirePicker: false
    });
  },
  onGuideTitleInput(event) {
    this.setData({ 'guideForm.title': parseFieldValue(event.detail).slice(0, 20) });
  },
  onGuideRouteInput(event) {
    this.setData({ 'guideForm.route': parseFieldValue(event.detail).slice(0, 500) });
  },
  onGuideSummaryInput(event) {
    this.setData({ 'guideForm.summary': parseFieldValue(event.detail).slice(0, 500) });
  },
  onGuideDaysChange(event) {
    this.setData({ 'guideForm.days': parseStepperValue(event.detail, 1) });
  },
  onGroupPeopleChange(event) {
    this.setData({ 'groupForm.maxPeople': parseStepperValue(event.detail, 2) });
  },
  onGroupPlanInput(event) {
    this.setData({ 'groupForm.plan': parseFieldValue(event.detail).slice(0, 500) });
  },
  onGroupContactInput(event) {
    this.setData({ 'groupForm.contact': parseFieldValue(event.detail).slice(0, 64) });
  },
  async onAfterRead(event) {
    const target = event.currentTarget.dataset.target;
    const file = event.detail.file || event.detail;
    const files = Array.isArray(file) ? file : [file];
    const listKey = target === 'guide' ? 'guideFileList' : 'groupFileList';
    const formKey = target === 'guide' ? 'guideForm.images' : 'groupForm.images';
    const nextFileList = [...this.data[listKey]];
    const nextImages = [...this.data[target === 'guide' ? 'guideForm' : 'groupForm'].images];
    const uploadDir = target === 'guide' ? 'miniapp/guide/' : 'miniapp/group/';
    for (const item of files) {
      if (!item) continue;
      const filePath = item.url || item.path;
      if (!filePath) continue;
      try {
        wx.showLoading({ title: '图片上传中', mask: true });
        const uploadedUrl = await uploadImageToOss(filePath, uploadDir);
        nextFileList.push({ url: uploadedUrl, isImage: true, status: 'done' });
        nextImages.push(uploadedUrl);
      } catch (error) {
        wx.showToast({ title: error.message || '图片上传失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    }
    this.setData({
      [listKey]: nextFileList,
      [formKey]: nextImages
    });
  },
  onDelete(event) {
    const target = event.currentTarget.dataset.target;
    const index = Number(event.detail.index);
    if (Number.isNaN(index)) return;
    const listKey = target === 'guide' ? 'guideFileList' : 'groupFileList';
    const form = target === 'guide' ? this.data.guideForm : this.data.groupForm;
    const nextFileList = [...this.data[listKey]];
    const nextImages = [...form.images];
    nextFileList.splice(index, 1);
    nextImages.splice(index, 1);
    this.setData({
      [listKey]: nextFileList,
      [target === 'guide' ? 'guideForm.images' : 'groupForm.images']: nextImages
    });
  },
  canPublish() {
    if (hasAuthToken()) {
      return true;
    }
    goLoginPage();
    return false;
  },
  resetGroupDraft() {
    const now = Date.now();
    this.setData({
      groupForm: createInitialGroupForm(),
      groupFileList: [],
      showGroupArea: false,
      showGroupCalendar: false,
      showDeparturePicker: false,
      showExpirePicker: false,
      departurePickerValue: getCurrentTimeHHmm(),
      expireMinTimestamp: now,
      expireMaxTimestamp: now,
      expireTimestamp: now
    });
  },
  resetGuideDraft() {
    this.setData({
      guideForm: createInitialGuideForm(),
      guideFileList: [],
      showGuideArea: false,
      showGuideCalendar: false
    });
  },
  async submitGroup() {
    if (!this.canPublish()) return;
    if (this.data.submittingGroup) return;
    const form = this.data.groupForm;
    if (!form.destination || !form.contact || !form.date || !form.departureTime || !form.expireAt || !form.plan) {
      wx.showToast({ title: '请补全拼团信息', icon: 'none' });
      return;
    }
    if (!form.images.length) {
      wx.showToast({ title: '请至少上传1张拼团图片', icon: 'none' });
      return;
    }
    if ((form.plan || '').length > 500) {
      wx.showToast({ title: '行程最多500字', icon: 'none' });
      return;
    }
    const departureTs = parseGroupDepartureTimestamp(form.date, form.departureTime);
    const expireTs = new Date(form.expireAt).getTime();
    if (Number.isNaN(departureTs) || Number.isNaN(expireTs)) {
      wx.showToast({ title: '请检查时间设置', icon: 'none' });
      return;
    }
    if (expireTs >= departureTs) {
      wx.showToast({ title: '截止时间需早于出发时间', icon: 'none' });
      return;
    }
    try {
      this.setData({ submittingGroup: true });
      await createGroup(Object.assign({}, form, { images: form.images }));
      this.resetGroupDraft();
      wx.showToast({ title: '拼团发布成功', icon: 'success' });
      setTimeout(() => {
        wx.setStorageSync(MINE_LIST_REFRESH_KEY, 1);
        wx.setStorageSync(MINE_TARGET_RECORD_TAB_KEY, 'group');
        wx.setStorageSync(MINE_FORCE_ALL_STATUS_KEY, 1);
        wx.switchTab({ url: '/pages/mine/index/index' });
      }, 350);
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submittingGroup: false });
    }
  },
  ensureExpireAtValid() {
    const { date, departureTime, expireAt } = this.data.groupForm;
    if (!date || !departureTime || !expireAt) {
      return;
    }
    const departureTs = parseGroupDepartureTimestamp(date, departureTime);
    const expireTs = new Date(expireAt).getTime();
    if (Number.isNaN(departureTs) || Number.isNaN(expireTs)) {
      return;
    }
    if (expireTs >= departureTs) {
      this.setData({
        'groupForm.expireAt': '',
        expireTimestamp: Date.now()
      });
      wx.showToast({ title: '截止时间已重置，请重新选择', icon: 'none' });
    }
  },
  async submitGuide() {
    if (!this.canPublish()) return;
    if (this.data.submittingGuide) return;
    const form = this.data.guideForm;
    if (!form.title || !form.destination || !form.travelDate || !form.route || !form.summary) {
      wx.showToast({ title: '请补全攻略信息', icon: 'none' });
      return;
    }
    if (!form.images.length) {
      wx.showToast({ title: '请至少上传1张攻略图片', icon: 'none' });
      return;
    }
    if ((form.title || '').length > 20) {
      wx.showToast({ title: '标题最多20字', icon: 'none' });
      return;
    }
    if ((form.route || '').length > 500) {
      wx.showToast({ title: '路线最多500字', icon: 'none' });
      return;
    }
    if ((form.summary || '').length > 500) {
      wx.showToast({ title: '内容最多500字', icon: 'none' });
      return;
    }
    try {
      this.setData({ submittingGuide: true });
      await createGuide(Object.assign({}, form, { images: form.images }));
      this.resetGuideDraft();
      wx.showToast({ title: '攻略发布成功', icon: 'success' });
      setTimeout(() => {
        wx.setStorageSync(MINE_LIST_REFRESH_KEY, 1);
        wx.setStorageSync(MINE_TARGET_RECORD_TAB_KEY, 'guide');
        wx.setStorageSync(MINE_FORCE_ALL_STATUS_KEY, 1);
        wx.switchTab({ url: '/pages/mine/index/index' });
      }, 350);
    } catch (error) {
      wx.showToast({ title: error.message || '发布失败', icon: 'none' });
    } finally {
      this.setData({ submittingGuide: false });
    }
  }
});