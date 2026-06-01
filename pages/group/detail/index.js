const { fetchGroupDetail, applyGroup, closeGroup, leaveGroup, kickGroupMember, fetchUserProfile, getSchoolDisplayText, hasAuthToken, goLoginPage } = require('../../../utils/api');
const DialogModule = require('@vant/weapp/dialog/dialog');
const Dialog = DialogModule.default || DialogModule;
const { getCountdownMs } = require('../../../utils/groupTime');

const SHARE_OPTIONS = [
  [{ name: '微信好友', icon: 'wechat' }, { name: '朋友圈', icon: 'wechat-moments' }],
  [{ name: '复制链接', icon: 'link' }, { name: '生成海报', icon: 'poster' }]
];

function formatDateTimeMinute(value) {
  if (!value) return '未设置';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 16).replace('T', ' ');
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function formatDeparture(group) {
  if (!group) return '';
  const date = group.date || '';
  const time = group.departureTime || '';
  if (!date && !time) return '';
  return `${date} ${time}`.trim();
}

function getCountdownState(group) {
  if (!group) return { time: 0, ended: false };
  if (group.status === '已截止') {
    return { time: 0, ended: true, expired: false };
  }
  const time = getCountdownMs(group.expireAt);
  if (!group.expireAt) {
    return { time: 0, ended: false, expired: false };
  }
  return { time, ended: false, expired: time <= 0 };
}

Page({
  data: {
    group: null,
    loading: true,
    countdownTime: 0,
    departureDisplay: '',
    expireDisplay: '',
    members: [],
    canViewContact: false,
    applying: false,
    leaveSubmitting: false,
    countdownEnded: false,
    countdownExpired: false,
    actionDisabled: false,
    leaderName: '发起人',
    leaderAvatar: '/static/app_icon.png',
    managingMember: false,
    showUserDialog: false,
    userDialogLoading: false,
    userProfile: null,
    userDialogCanKick: false,
    selectedMemberUserId: '',
    selectedMemberName: '',
    showShareSheet: false,
    shareOptions: SHARE_OPTIONS
  },
  id: '',
  onLoad(options) {
    this.id = options.id;
    this.loadGroup();
  },
  async loadGroup() {
    this.setData({ loading: true });
    try {
      const target = await fetchGroupDetail(this.id);
      const members = (target.members || []).map((item) => ({
        ...item,
        displayName: item.nickname || '用户'
      }));
      const leader = members.find((item) => item.role === 'leader') || {};
      const countdownState = getCountdownState(target);
      this.setData({
        group: target,
        members,
        canViewContact: Boolean(target && target.canViewContact),
        actionDisabled: Boolean(target && target.isOwner && target.auditStatus !== 'rejected'),
        departureDisplay: formatDeparture(target),
        expireDisplay: formatDateTimeMinute(target ? target.expireAt : ''),
        countdownTime: countdownState.time,
        countdownEnded: countdownState.ended,
        countdownExpired: countdownState.expired,
        leaderName: leader.displayName || '发起人',
        leaderAvatar: leader.avatar || '/static/app_icon.png',
        shareOptions: SHARE_OPTIONS
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
  handleCountdownFinish() {
    if ((this.data.group && this.data.group.status) === '已截止') {
      this.setData({ countdownTime: 0, countdownEnded: true, countdownExpired: false });
      return;
    }
    this.setData({ countdownTime: 0, countdownEnded: false, countdownExpired: true });
  },
  async applyJoin() {
    if (this.data.applying) return;
    if (!hasAuthToken()) {
      goLoginPage();
      return;
    }
    try {
      this.setData({ applying: true });
      await applyGroup(this.id);
      wx.showToast({ title: '申请已提交', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '申请失败', icon: 'none' });
    } finally {
      this.setData({ applying: false });
      this.loadGroup();
    }
  },
  async onMemberTap(event) {
    const group = this.data.group || {};
    const memberUserId = String(event.currentTarget.dataset.userId || '').trim();
    const role = String(event.currentTarget.dataset.role || '').trim();
    const nickname = String(event.currentTarget.dataset.nickname || '').trim() || '该团员';
    if (!memberUserId) return;
    const canKick = Boolean(group.isOwner && group.status === '招募中' && role !== 'leader');
    this.setData({
      showUserDialog: true,
      userDialogLoading: true,
      userProfile: null,
      userDialogCanKick: canKick,
      selectedMemberUserId: memberUserId,
      selectedMemberName: nickname
    });
    try {
      const profile = await fetchUserProfile(memberUserId);
      this.setData({
        userProfile: Object.assign({}, profile, {
          schoolText: getSchoolDisplayText(profile.school)
        })
      });
    } catch (error) {
      wx.showToast({ title: error.message || '用户资料加载失败', icon: 'none' });
      this.setData({ showUserDialog: false });
    } finally {
      this.setData({ userDialogLoading: false });
    }
  },
  closeUserDialog() {
    if (this.data.managingMember) return;
    this.setData({
      showUserDialog: false,
      userDialogLoading: false,
      userProfile: null,
      userDialogCanKick: false,
      selectedMemberUserId: '',
      selectedMemberName: ''
    });
  },
  async kickCurrentMember() {
    const group = this.data.group || {};
    const memberUserId = String(this.data.selectedMemberUserId || '').trim();
    const nickname = String(this.data.selectedMemberName || '').trim() || '该团员';
    if (!group.id || !memberUserId || !this.data.userDialogCanKick || this.data.managingMember) return;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '团员管理',
        content: `确认将${nickname}移出当前拼团吗？`,
        confirmText: '确认踢出',
        cancelText: '取消',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false)
      });
    });
    if (!confirmed) return;
    try {
      this.setData({ managingMember: true });
      await kickGroupMember(group.id, memberUserId);
      wx.showToast({ title: '已移出团员', icon: 'success' });
      this.setData({
        showUserDialog: false,
        userDialogLoading: false,
        userProfile: null,
        userDialogCanKick: false,
        selectedMemberUserId: '',
        selectedMemberName: ''
      });
      await this.loadGroup();
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    } finally {
      this.setData({ managingMember: false });
    }
  },
  goEdit() {
    if (!this.data.group || !this.data.group.id) return;
    wx.navigateTo({
      url: `/pages/group/edit/index?id=${this.data.group.id}`,
      fail: () => {
        wx.reLaunch({ url: `/pages/group/edit/index?id=${this.data.group.id}` });
      }
    });
  },
  async closeJoin() {
    const group = this.data.group;
    if (!group || !group.id) return;
    if (group.auditStatus !== 'approved') {
      wx.showToast({ title: '仅已审核通过拼团可截止入团', icon: 'none' });
      return;
    }
    if (group.status !== '招募中') return;
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '截止入团',
        content: '确认截止入团吗？操作后剩余时间会显示为已截止。',
        confirmText: '确认截止',
        cancelText: '取消',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false)
      });
    });
    if (!confirm) return;
    try {
      await closeGroup(group.id);
      wx.showToast({ title: '已截止入团', icon: 'success' });
      await this.loadGroup();
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    }
  },
  openShareSheet() {
    const group = this.data.group || {};
    if (!group || group.auditStatus !== 'approved') return;
    this.setData({ showShareSheet: true, shareOptions: SHARE_OPTIONS });
  },
  closeShareSheet() {
    this.setData({ showShareSheet: false });
  },
  async onShareSelect(event) {
    const option = (event && event.detail && event.detail.option) || {};
    this.setData({ showShareSheet: false });
    wx.showToast({
      title: `${option.name || '分享'}演示：${this.data.leaderName || '发起人'}`,
      icon: 'none'
    });
  },
  async onLeaveGroup() {
    const group = this.data.group || {};
    if (!group || !group.id || this.data.leaveSubmitting) return;
    if (!hasAuthToken()) {
      goLoginPage();
      return;
    }
    if (!group.canLeave || group.isOwner) {
      wx.showToast({ title: '当前不可退团', icon: 'none' });
      return;
    }
    const leaveMessage = group.isOfficial
      ? '确认退出该官方拼团吗？'
      : '确认退出该拼团吗？退出后将通知团主。';
    try {
      if (Dialog && typeof Dialog.confirm === 'function') {
        await Dialog.confirm({
          context: this,
          selector: '#van-dialog',
          title: '退出拼团',
          message: leaveMessage,
          confirmButtonText: '确认退出',
          cancelButtonText: '取消'
        });
      } else {
        const confirm = await new Promise((resolve) => {
          wx.showModal({
            title: '退出拼团',
            content: leaveMessage,
            confirmText: '确认退出',
            cancelText: '取消',
            success: (res) => resolve(Boolean(res.confirm)),
            fail: () => resolve(false)
          });
        });
        if (!confirm) return;
      }
      this.setData({ leaveSubmitting: true });
      await leaveGroup(group.id);
      wx.showToast({ title: '已退出拼团', icon: 'success' });
      await this.loadGroup();
    } catch (error) {
      if (error && error.message === 'cancel') return;
      wx.showToast({ title: (error && error.message) || '退团失败', icon: 'none' });
    } finally {
      this.setData({ leaveSubmitting: false });
    }
  }
});
