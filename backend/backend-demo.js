import { supabase } from './supabase-client.js';
import * as api from './streamx-api.js';
const $ = id => document.getElementById(id);
const status = $('status');
function show(message, error = false) {
  status.textContent = message;
  status.className = 'status ' + (error ? 'bad' : 'good');
}
async function run(fn) {
  try {
    const value = await fn();
    if (value !== undefined) show(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    return value;
  } catch (e) {
    show(e.message || String(e), true);
  }
}
run(async () => {
  const { error } = await supabase.from('streams').select('id').limit(1);
  if (error) throw error;
  return 'Connected to StreamX Supabase successfully. Database API is responding.';
});
$('signup').onclick = () => run(() => api.auth.signUp($('suEmail').value, $('suPass').value, $('suName').value, $('suDisplay').value));
$('login').onclick = () => run(async () => {
  const d = await api.auth.signIn($('inEmail').value, $('inPass').value);
  return { message: 'Login successful', user: d.user?.email };
});
$('logout').onclick = () => run(async () => { await api.auth.signOut(); return 'Logged out.'; });
$('profile').onclick = () => run(() => api.getMyProfile());
$('createStream').onclick = () => run(() => api.createStream({
  title: $('streamTitle').value,
  description: $('streamDesc').value,
  category: $('streamCategory').value
}));
$('loadStreams').onclick = () => run(async () => {
  const rows = await api.listStreams();
  $('streams').innerHTML = rows.map(s => `<div class="item"><b>${escapeHTML(s.title)}</b><br><small>${escapeHTML(s.category)} · ${s.id}</small></div>`).join('') || 'No live streams yet';
  return `Loaded ${rows.length} live streams.`;
});
$('sendChat').onclick = () => run(() => api.sendChatMessage($('chatStreamId').value, $('chatText').value));
$('loadChat').onclick = () => run(async () => {
  const rows = await api.getChatMessages($('chatStreamId').value);
  $('chat').innerHTML = rows.map(m => `<div class="item">${escapeHTML(m.message)}</div>`).join('') || 'No messages';
  return `Loaded ${rows.length} messages.`;
});
$('follow').onclick = () => run(async () => { await api.followCreator($('creatorId').value); return 'Follow saved.'; });
$('like').onclick = () => run(async () => { await api.likeStream($('likeStreamId').value); return 'Like saved.'; });
$('notifications').onclick = () => run(async () => {
  const rows = await api.getMyNotifications();
  $('notices').innerHTML = rows.map(n => `<div class="item">${escapeHTML(n.message)}</div>`).join('') || 'No notifications';
  return `Loaded ${rows.length} notifications.`;
});
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
