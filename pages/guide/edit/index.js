const { areaList } = require('../../../utils/data');
const { fetchMineGuideDetail, updateGuide, uploadImageToOss } = require('../../../utils/api');

Page({
  data: {
    areaList,
    id: '',
    showArea: false,
    saving: false,
    fileList: [],
    form: {
      title: '',
      destination: '',
      route: '',
      summary: '',
      images: []
    }
  },
  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.loadDetail();
  },
  async loadDetail() {
    try {
      const detail = await fetchMineGuideDetail(this.data.id);
      this.setData({
        form: {
          title: detail.title || '',
          destination: detail.destination || '',
          route: detail.route || '',
          summary: detail.summary || '',
          images: detail.images || []
        },
        fileList: (detail.images || []).map((url) => ({ url }))
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
  onTitleInput(event) { this.setData({ 'form.title': String((event.detail && event.detail.value) || '').slice(0, 20) }); },
  onRouteInput(event) { this.setData({ 'form.route': String((event.detail && event.detail.value) || '').slice(0, 500) }); },
  onSummaryInput(event) { this.setData({ 'form.summary': String((event.detail && event.detail.value) || '').slice(0, 500) }); },
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
        const uploadedUrl = await uploadImageToOss(filePath, 'miniapp/guide/');
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
    if (!form.title || !form.destination || !form.route || !form.summary || !form.images.length) {
      wx.showToast({ title: '请补全攻略信息', icon: 'none' });
      return;
    }
    try {
      this.setData({ saving: true });
      await updateGuide(this.data.id, Object.assign({}, form, { images: form.images }));
      wx.showToast({ title: '修改成功，待审核', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 260);
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  }
});