const { request } = require('./http');
const { getCache, setCache } = require('./cache');

const PAGE_SIZE = 10;
const MINE_PROFILE_REFRESH_KEY = 'mine_profile_refresh';
const MINE_LIST_REFRESH_KEY = 'mine_list_refresh';
const MINE_TARGET_RECORD_TAB_KEY = 'mine_record_target_tab';
const MINE_FORCE_ALL_STATUS_KEY = 'mine_force_all_status';
let socketTask = null;
let socketConnecting = false;
const realtimeListeners = new Set();

function getWsBase() {
  return 'ws://127.0.0.1:3000/ws';
}

function toastError(error) {
  wx.showToast({
    title: (error && error.message) || '请求失败',
    icon: 'none'
  });
}

function hasAuthToken() {
  return Boolean(wx.getStorageSync('auth_token'));
}

function goLoginPage() {
  wx.navigateTo({
    url: '/pages/auth/login/index',
    fail: () => {
      wx.reLaunch({ url: '/pages/auth/login/index' });
    }
  });
}

function getUnreadCount() {
  return Number(wx.getStorageSync('unread_count') || 0);
}

function normalizeSchoolValue(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && raw !== null) {
    const school = {
      id: raw.id ? Number(raw.id) : 0,
      name: String(raw.name || '').trim(),
      address: String(raw.address || '').trim(),
      provinceName: String(raw.provinceName || '').trim(),
      cityName: String(raw.cityName || '').trim(),
      districtName: String(raw.districtName || '').trim(),
      adcode: String(raw.adcode || '').trim(),
      lat: raw.lat !== undefined && raw.lat !== null ? Number(raw.lat) : null,
      lng: raw.lng !== undefined && raw.lng !== null ? Number(raw.lng) : null
    };
    school.locationText = [school.provinceName, school.cityName, school.districtName]
      .filter(Boolean)
      .join(' ');
    school.displayText = school.name || school.locationText;
    return school.name ? school : null;
  }
  const text = String(raw || '').trim();
  if (!text) return null;
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      return normalizeSchoolValue(JSON.parse(text));
    } catch (_error) {
      // ignore invalid json and use plain string fallback
    }
  }
  return {
    id: 0,
    name: text,
    address: '',
    provinceName: '',
    cityName: '',
    districtName: '',
    adcode: '',
    lat: null,
    lng: null,
    locationText: '',
    displayText: text
  };
}

function getSchoolDisplayText(raw) {
  const school = normalizeSchoolValue(raw);
  return school ? String(school.displayText || school.name || '').trim() : '';
}

function connectRealtime(onMessage) {
  if (typeof onMessage === 'function') {
    realtimeListeners.add(onMessage);
  }
  if (socketTask || socketConnecting) {
    return () => {
      if (typeof onMessage === 'function') {
        realtimeListeners.delete(onMessage);
      }
    };
  }

  socketConnecting = true;
  const task = wx.connectSocket({ url: getWsBase() });

  const handlePayload = (payload) => {
    try {
      const data = JSON.parse(payload.data || '{}');
      realtimeListeners.forEach((handler) => {
        handler(data);
      });
    } catch (error) {
      console.warn('ws parse failed', error.message);
    }
  };

  const handleClose = () => {
    socketTask = null;
    socketConnecting = false;
  };

  task.onOpen(() => {
    socketConnecting = false;
  });
  task.onMessage(handlePayload);
  task.onClose(handleClose);
  task.onError(() => {
    socketTask = null;
    socketConnecting = false;
  });
  socketTask = task;

  return () => {
    realtimeListeners.delete(onMessage);
  };
}

async function wechatLogin(code, profile = {}) {
  const data = await request('/auth/wechat-login', {
    method: 'POST',
    data: { code, profile }
  });
  if (!data.token) {
    throw new Error('登录失败，请重试');
  }
  wx.setStorageSync('auth_token', data.token);
  setCache('user_profile', data.user, 180000);
  return data;
}

async function getOssPolicy(dir = 'miniapp/images/') {
  return request('/oss/policy', { data: { dir } });
}

function getFileInfo(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: resolve,
      fail: (err) => reject(new Error(err.errMsg || '文件信息获取失败'))
    });
  });
}

function uploadFile({ url, filePath, name, formData }) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath,
      name,
      formData,
      success: (res) => {
        if (res.statusCode >= 400) {
          reject(new Error('上传失败'));
          return;
        }
        resolve(res);
      },
      fail: (err) => reject(new Error(err.errMsg || '上传失败'))
    });
  });
}

async function uploadImageToOss(filePath, dir = 'miniapp/images/') {
  const fileInfo = await getFileInfo(filePath);
  if (fileInfo.size > 5 * 1024 * 1024) {
    throw new Error('文件超过 5MB，请压缩后重试');
  }
  const policy = await getOssPolicy(dir);
  const ext = filePath.split('.').pop() || 'jpg';
  const key = `${policy.dir}${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
  await uploadFile({
    url: policy.host,
    filePath,
    name: 'file',
    formData: {
      key,
      policy: policy.policy,
      OSSAccessKeyId: policy.accessId,
      signature: policy.signature,
      success_action_status: '200'
    }
  });
  return `${policy.host}/${key}`;
}

async function uploadPendingImages(images = [], dir = 'miniapp/images/') {
  const result = [];
  for (const item of images) {
    const value = String(item || '').trim();
    if (!value) continue;
    if (/^https?:\/\//i.test(value)) {
      result.push(value);
      continue;
    }
    result.push(await uploadImageToOss(value, dir));
  }
  return result;
}

async function fetchUser() {
  const cache = getCache('user_profile');
  if (cache) return cache;
  try {
    const data = await request('/user');
    data.school = normalizeSchoolValue(data.school);
    setCache('user_profile', data, 180000);
    return data;
  } catch (error) {
    toastError(error);
    return { nickname: '', avatar: '', school: null };
  }
}

async function saveUser(payload) {
  const result = await request('/user', { method: 'PUT', data: payload });
  result.data.school = normalizeSchoolValue(result.data.school);
  setCache('user_profile', result.data, 180000);
  return result.data;
}

function fetchSchools({ keyword = '', limit = 20 } = {}) {
  return request('/schools', {
    data: {
      keyword: String(keyword || '').trim(),
      limit
    }
  }).then((data) => {
    const list = Array.isArray(data.list) ? data.list.map((item) => normalizeSchoolValue(item)).filter(Boolean) : [];
    return { list };
  });
}

async function fetchGroups({ page = 1, keyword = '' } = {}) {
  const key = `group_page_${page}_${keyword}`;
  const cache = getCache(key);
  if (cache) return cache;
  const data = await request('/groups', {
    data: { page, pageSize: PAGE_SIZE, keyword }
  });
  setCache(key, data, 120000);
  return data;
}

async function createGroup(payload) {
  const result = await request('/groups', { method: 'POST', data: payload });
  wx.removeStorageSync('group_page_1_');
  return result.data;
}

async function applyGroup(id) {
  const result = await request(`/groups/${id}/apply`, { method: 'POST' });
  wx.removeStorageSync('group_page_1_');
  return result.data;
}

async function closeGroup(id) {
  const result = await request(`/groups/${id}/close`, { method: 'POST' });
  wx.removeStorageSync('group_page_1_');
  return result.data;
}

function fetchGroupDetail(id) {
  return request(`/groups/${id}`);
}

function reviewGroupApplication(requestId, action) {
  return request(`/groups/applications/${requestId}/review`, {
    method: 'POST',
    data: { action }
  });
}

async function fetchGuides({ page = 1, destination = '', keyword = '' } = {}) {
  const key = `guide_page_${page}_${destination}_${keyword}`;
  const cache = getCache(key);
  if (cache) return cache;
  const data = await request('/guides', {
    data: { page, pageSize: PAGE_SIZE, destination, keyword }
  });
  setCache(key, data, 120000);
  return data;
}

function fetchGuideDetail(id) {
  return request(`/guides/${id}`);
}

async function fetchUserProfile(userId) {
  const data = await request(`/users/${userId}/profile`);
  data.school = normalizeSchoolValue(data.school);
  return data;
}

async function createGuide(payload) {
  const result = await request('/guides', { method: 'POST', data: payload });
  wx.removeStorageSync('guide_page_1__');
  return result.data;
}

function toggleGuideLike(id) {
  return request(`/guides/${id}/like`, { method: 'POST' });
}

function toggleGuideFavorite(id) {
  return request(`/guides/${id}/favorite`, { method: 'POST' });
}

async function fetchMessages() {
  const data = await request('/messages');
  const unread = data.list.filter((item) => !item.read).length;
  wx.setStorageSync('unread_count', unread);
  data.unread = unread;
  return data;
}

function fetchLatestNotice() {
  return request('/notices/latest');
}

function fetchLatestAd() {
  return request('/ads/latest');
}

function readMessage(id) {
  return request(`/messages/${id}/read`, { method: 'POST' });
}

function fetchRecords() {
  return request('/records');
}

function fetchMineGroups({ auditStatus = '', page = 1, pageSize = 10 } = {}) {
  return request('/mine/groups', {
    data: { auditStatus, page, pageSize }
  });
}

function fetchMineGroupDetail(id) {
  return request(`/mine/groups/${id}`);
}

function updateGroup(id, payload) {
  return request(`/groups/${id}`, { method: 'PUT', data: payload });
}

function deleteMineGroup(id) {
  return request(`/groups/${id}`, { method: 'DELETE' });
}

function fetchMineGuides({ auditStatus = '', page = 1, pageSize = 10 } = {}) {
  return request('/mine/guides', {
    data: { auditStatus, page, pageSize }
  });
}

function fetchMineFavoriteGuides({ page = 1, pageSize = 10 } = {}) {
  return request('/mine/favorite-guides', {
    data: { page, pageSize }
  });
}

function fetchMineJoinedGroups({ status = '', page = 1, pageSize = 10 } = {}) {
  return request('/mine/joined-groups', {
    data: { status, page, pageSize }
  });
}

function leaveGroup(id) {
  return request(`/groups/${id}/leave`, { method: 'POST' });
}

function kickGroupMember(groupId, memberUserId) {
  return request(`/groups/${groupId}/members/${memberUserId}/kick`, { method: 'POST' });
}

function fetchMineGuideDetail(id) {
  return request(`/mine/guides/${id}`);
}

function updateGuide(id, payload) {
  return request(`/guides/${id}`, { method: 'PUT', data: payload });
}

function deleteMineGuide(id) {
  return request(`/guides/${id}`, { method: 'DELETE' });
}

module.exports = {
  hasAuthToken,
  goLoginPage,
  getUnreadCount,
  connectRealtime,
  wechatLogin,
  getOssPolicy,
  uploadImageToOss,
  uploadPendingImages,
  fetchUser,
  saveUser,
  fetchSchools,
  fetchGroups,
  fetchGroupDetail,
  createGroup,
  applyGroup,
  closeGroup,
  reviewGroupApplication,
  fetchGuides,
  fetchGuideDetail,
  fetchUserProfile,
  createGuide,
  toggleGuideLike,
  toggleGuideFavorite,
  fetchMessages,
  fetchLatestNotice,
  fetchLatestAd,
  readMessage,
  fetchRecords,
  fetchMineGroups,
  fetchMineGuides,
  fetchMineFavoriteGuides,
  fetchMineJoinedGroups,
  fetchMineGroupDetail,
  fetchMineGuideDetail,
  updateGroup,
  updateGuide,
  deleteMineGroup,
  deleteMineGuide,
  leaveGroup,
  kickGroupMember,
  MINE_PROFILE_REFRESH_KEY,
  MINE_LIST_REFRESH_KEY,
  MINE_TARGET_RECORD_TAB_KEY,
  MINE_FORCE_ALL_STATUS_KEY,
  normalizeSchoolValue,
  getSchoolDisplayText
};
