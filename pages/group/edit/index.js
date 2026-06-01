const { areaList } = require('../../../utils/data');
const { fetchMineGroupDetail, updateGroup, uploadImageToOss } = require('../../../utils/api');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDateTime(raw) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw || '');
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function parseDeparture(dateStr, timeStr) {
  return new Date(`${dateStr} ${timeStr}:00`).getTime();
}

Page({
  data: {
    areaList,
    id: '',
    saving: false,
    showArea: false,
    showDate: false,
    showDeparture: false,
    showExpire: false,
    departureValue: '09:00',
    expireValue: Date.now(),
    expireMin: Date.now(),
    expireMax: Date.now(),
    minDate: new Date().setHours(0, 0, 0, 0),
    maxDate: new Date(new Date().setMonth(new Date().getMonth() + 6)).getTime(),
    fileList: [],
    form: {
      destination: '',
      contact: '',
      date: '',
      departureTime: '',
      expireAt: '',
      maxPeople: 4,
      plan: '',
      images: []
    }
  },
  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.loadDetail();
  },
  async loadDetail() {
    try {
      const detail = await fetchMineGroupDetail(this.data.id);
      this.setData({
        form: {
          destination: detail.destination || '',
          contact: detail.contact || '',
          date: detail.date || '',
          departureTime: detail.departureTime || '',
          expireAt: detail.expireAt || '',
          maxPeople: Number(detail.maxPeople || 4),
          plan: detail.plan || '',
          images: detail.images || []
        },
        fileList: (detail.images || []).map((url) => ({ url })),
        departureValue: detail.departureTime || '09:00',
        expireValue: detail.expireAt ? new Date(detail.expireAt).getTime() : Date.now()
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },
  openArea() { this.setData({ showArea: true }); },
  closeArea() { this.setData({ showArea: false }); },
  onAreaConfirm(event) {
    const values = event.detail.values || [];
    this.setData({ 'form.destination': values.map((v) => v.name).join(' '), showArea: false });
  },
  openDate() { this.setData({ showDate: true }); },
  closeDate() { this.setData({ showDate: false }); },
  onDateConfirm(event) {
    const value = Array.isArray(event.detail) ? event.detail[0] : event.detail;
    this.setData({ 'form.date': formatDate(new Date(value)), showDate: false });
  },
  openDeparture() { this.setData({ showDeparture: true, departureValue: this.data.form.departureTime || '09:00' }); },
  closeDeparture() { this.setData({ showDeparture: false }); },
  onDepartureConfirm(event) {
    const value = String((event.detail && event.detail.value) || event.detail || '').trim();
    this.setData({ 'form.departureTime': value, departureValue: value, showDeparture: false });
  },
  openExpire() {
    const departureTs = parseDeparture(this.data.form.date, this.data.form.departureTime);
    if (Number.isNaN(departureTs)) {
      wx.showToast({ title: '请先选择出发日期和时间', icon: 'none' });
      return;
    }
    const now = Date.now();
    const maxAllowed = departureTs - 1000;
    if (maxAllowed <= now) {
      wx.showToast({ title: '出发时间需晚于当前时间', icon: 'none' });
      return;
    }
    this.setData({ showExpire: true, expireMin: now, expireMax: maxAllowed, expireValue: now });
  },
  closeExpire() { this.setData({ showExpire: false }); },
  onExpireConfirm(event) {
    const value = Number((event.detail && event.detail.value) || event.detail || 0);
    const departureTs = parseDeparture(this.data.form.date, this.data.form.departureTime);
    if (Number.isNaN(departureTs)) {
      wx.showToast({ title: '请先选择出发日期和时间', icon: 'none' });
      this.setData({ showExpire: false });
      return;
    }
    if (value >= departureTs) {
      wx.showToast({ title: '截止时间需早于出发时间', icon: 'none' });
      return;
    }
    this.setData({ 'form.expireAt': normalizeDateTime(value), expireValue: value, showExpire: false });
  },
  onPeopleChange(event) { this.setData({ 'form.maxPeople': Number((event.detail && event.detail.value) || event.detail || 4) }); },
  onContactInput(event) { this.setData({ 'form.contact': String((event.detail && event.detail.value) || '').slice(0, 64) }); },
  onPlanInput(event) { this.setData({ 'form.plan': String((event.detail && event.detail.value) || '').slice(0, 500) }); },
  async onAfterRead(event) {
    const file = event.detail.file || event.detail;
    const files = Array.isArray(file) ? file : [file];
    const nextFileList = [...this.data.fileList];
    const nextImages = [...this.data.form.images];
    for (const item of files) {
      const filePath = item.url || item.path;
      if (!filePath) continue;
      try {
        wx.showLoading({ title: '图片上传中', mask: true });
        const uploadedUrl = await uploadImageToOss(filePath, 'miniapp/group/');
        nextFileList.push({ url: uploadedUrl, isImage: true, status: 'done' });
        nextImages.push(uploadedUrl);
      } catch (error) {
        wx.showToast({ title: error.message || '图片上传失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    }
    this.setData({ fileList: nextFileList, 'form.images': nextImages });
  },
  onDelete(event) {
    const index = Number(event.detail.index);
    const nextFileList = [...this.data.fileList];
    const nextImages = [...this.data.form.images];
    nextFileList.splice(index, 1);
    nextImages.splice(index, 1);
    this.setData({ fileList: nextFileList, 'form.images': nextImages });
  },
  async submit() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!form.destination || !form.contact || !form.date || !form.departureTime || !form.expireAt || !form.plan || !form.images.length) {
      wx.showToast({ title: '请补全拼团信息', icon: 'none' });
      return;
    }
    const departureTs = parseDeparture(form.date, form.departureTime);
    const expireTs = new Date(form.expireAt).getTime();
    if (Number.isNaN(departureTs) || Number.isNaN(expireTs) || expireTs >= departureTs) {
      wx.showToast({ title: '截止时间需早于出发时间', icon: 'none' });
      return;
    }
    try {
      this.setData({ saving: true });
      await updateGroup(this.data.id, Object.assign({}, form, { images: form.images }));
      wx.showToast({ title: '修改成功，待审核', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 260);
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});