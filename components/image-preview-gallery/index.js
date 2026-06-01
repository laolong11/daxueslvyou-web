Component({
  properties: {
    images: {
      type: Array,
      value: []
    },
    ownerName: {
      type: String,
      value: '发布者'
    },
    ownerAvatar: {
      type: String,
      value: '/static/app_icon.png'
    },
    metaLine: {
      type: String,
      value: ''
    }
  },
  data: {
    previewVisible: false,
    previewIndex: 0
  },
  methods: {
    openPreview(event) {
      const images = this.data.images || [];
      if (!images.length) return;
      this.setData({
        previewVisible: true,
        previewIndex: Number(event.currentTarget.dataset.index || 0)
      });
    },
    closePreview() {
      this.setData({ previewVisible: false });
    },
    onPreviewChange(event) {
      this.setData({ previewIndex: Number(event.detail.current || 0) });
    },
    stopBubble() {},
    preventTouchMove() {
      return false;
    }
  }
});
