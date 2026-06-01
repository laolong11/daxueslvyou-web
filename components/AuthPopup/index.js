Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    onCancel() {
      this.triggerEvent('update:show', { value: false });
      this.triggerEvent('cancel');
    },
    onLogin() {
      this.triggerEvent('update:show', { value: false });
      this.triggerEvent('login');
    }
  }
});
