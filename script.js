import {
  auth, supabase, getMyProfile, updateMyProfile, listStreams, createStream,
  endStream, getMyFollowing, isFollowing, followCreator, unfollowCreator,
  getStreamLikeStats, likeStream, sendChatMessage, getChatMessages,
  subscribeToChat, subscribeToStreams, getPublicProfile, getMyNotifications
} from './backend/streamx-api.js';

const $ = id => document.getElementById(id);
const liveModal = $('liveModal');
const video = $('cameraPreview');
const cameraPlaceholder = $('cameraPlaceholder');
const cameraBtn = $('cameraBtn');
const startBtn = $('startBtn');
const toast = $('toast');

let currentUser = null;
let profile = null;
let mediaStream = null;
let ownLiveStream = null;
let selectedStream = null;
let chatChannel = null;
let chatMessageIds = new Set();
let activeFilter = 'All';
let authMode = 'signin';
let allStreams = [];
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
function openBox(el) {
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
}
function closeBox(el) {
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function initials(value) {
  return String(value || 'SX').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}
function categoryClass(category) {
  return {
    Gaming: 'thumb-game',
    Music: 'thumb-music',
    Education: 'thumb-code',
    'Just chatting': 'thumb-talk',
    'Art & design': 'thumb-music'
  }[category] || 'thumb-code';
}
function categorySymbol(category) {
  return {
    Gaming: '⌁', Music: '♫', Education: '</>',
    'Just chatting': '☕', 'Art & design': '✎'
  }[category] || '▶';
}
function displayName(userProfile, fallback = 'StreamX creator') {
  return userProfile?.display_name || userProfile?.username || fallback;
}

function renderAuthPanel() {
  const signedIn = Boolean(currentUser);
  $('authForm').hidden = signedIn;
  $('signedInPanel').hidden = !signedIn;
  if (signedIn) {
    $('authHeading').textContent = 'You are signed in';
    $('authSubheading').textContent = 'Your StreamX account is connected to Supabase.';
    $('signedInDetails').textContent = `Signed in as ${currentUser.email || profile?.username || 'your account'}`;
  } else {
    updateAuthMode();
  }
  $('authOpenBtn').textContent = signedIn ? (profile?.display_name || profile?.username || 'My account') : 'Sign in / Sign up';
}
function updateAuthMode() {
  const signup = authMode === 'signup';
  $('signupFields').hidden = !signup;
  $('authHeading').textContent = signup ? 'Create your account' : 'Welcome to StreamX';
  $('authSubheading').textContent = signup
    ? 'Create a profile to start streaming and follow creators.'
    : 'Sign in to follow creators, chat, and go live.';
  $('authSubmit').textContent = signup ? 'Create account' : 'Sign in';
  $('authModeToggle').textContent = signup ? 'Already have an account? Sign in' : 'New here? Create an account';
  $('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
}
function renderProfile() {
  const name = displayName(profile, currentUser?.email?.split('@')[0] || 'StreamX Guest');
  $('profileName').textContent = name;
  $('profileBio').textContent = profile?.bio || 'Welcome to StreamX!';
  $('profileAvatar').textContent = initials(name);
  $('profileAvatar').style.backgroundImage = profile?.avatar_url ? `url("${profile.avatar_url}")` : '';
  $('profileAvatar').style.backgroundSize = 'cover';
  const sidebarName = document.querySelector('.user-mini b');
  const sidebarSub = document.querySelector('.user-mini small');
  if (sidebarName) sidebarName.textContent = currentUser ? name : 'Guest';
  if (sidebarSub) sidebarSub.textContent = currentUser ? (currentUser.email || 'Signed in') : 'Sign in to join';
  renderAuthPanel();
}
async function syncAuthState(session) {
  currentUser = session?.user || null;
  profile = null;
  if (currentUser) {
    try {
      profile = await getMyProfile();
    } catch (error) {
      console.error('Could not load profile:', error);
      showToast('Signed in, but the profile could not be loaded. Check the profiles table policies.');
    }
  }
  renderProfile();
  await Promise.all([refreshStreams(), refreshFollowing()]);
}
function openAuth() {
  $('authMessage').textContent = 'Your account is stored securely in Supabase Auth.';
  renderAuthPanel();
  openBox($('authModal'));
}
$('authOpenBtn').addEventListener('click', openAuth);
$('closeAuth').addEventListener('click', () => closeBox($('authModal')));
$('authModal').addEventListener('click', event => {
  if (event.target === $('authModal')) closeBox($('authModal'));
});
$('authModeToggle').addEventListener('click', () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  $('authMessage').textContent = '';
  updateAuthMode();
});
$('authSubmit').addEventListener('click', async () => {
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  const button = $('authSubmit');
  if (!email || !password) {
    $('authMessage').textContent = 'Enter your email and password.';
    return;
  }
  if (password.length < 6) {
    $('authMessage').textContent = 'Password must contain at least 6 characters.';
    return;
  }
  button.disabled = true;
  try {
    if (authMode === 'signup') {
      const rawUsername = $('authUsername').value.trim().toLowerCase();
      const username = rawUsername.replace(/[^a-z0-9_]/g, '').slice(0, 30);
      const name = $('authDisplayName').value.trim() || rawUsername;
      if (username.length < 3) throw new Error('Username must be at least 3 letters, numbers, or underscores.');
      await auth.signUp(email, password, username, name);
      $('authMessage').textContent = 'Account created. Check your email to confirm your address, then sign in. If confirmation is disabled, you are signed in now.';
      authMode = 'signin';
      updateAuthMode();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await syncAuthState(data.session);
        closeBox($('authModal'));
        showToast('Your StreamX account is ready.');
      }
    } else {
      const result = await auth.signIn(email, password);
      await syncAuthState(result.session);
      closeBox($('authModal'));
      showToast('Welcome back to StreamX!');
    }
  } catch (error) {
    $('authMessage').textContent = error.message || 'Authentication failed.';
  } finally {
    button.disabled = false;
  }
});
$('authSignOut').addEventListener('click', async () => {
  try {
    await auth.signOut();
    currentUser = null;
    profile = null;
    renderProfile();
    await Promise.all([refreshStreams(), refreshFollowing()]);
    closeBox($('authModal'));
    showToast('You have signed out.');
  } catch (error) {
    $('authMessage').textContent = error.message;
  }
});

async function refreshStreams() {
  try {
    allStreams = await listStreams();
    renderStreams();
  } catch (error) {
    console.error('Stream loading failed:', error);
    $('emptyState').hidden = false;
    $('emptyState').textContent = 'Could not load live streams. Check your Supabase connection and table access.';
    showToast('Could not load streams: ' + error.message);
  }
}
function renderStreams() {
  const grid = $('streamGrid');
  const query = $('searchInput').value.toLowerCase().trim();
  const visible = allStreams.filter(stream => {
    const category = stream.category || 'General';
    const creator = displayName(stream.profiles);
    const normalizedFilter = activeFilter === 'Talk' ? 'Just chatting'
      : activeFilter === 'Art' ? 'Art & design' : activeFilter;
    const categoryMatches = normalizedFilter === 'All' || category === normalizedFilter;
    const searchMatches = `${stream.title} ${creator} ${category}`.toLowerCase().includes(query);
    return categoryMatches && searchMatches;
  });
  grid.innerHTML = visible.map(stream => {
    const creator = displayName(stream.profiles);
    const id = escapeHTML(stream.id);
    return `<article class="stream-card" data-stream-id="${id}">
      <div class="thumbnail ${categoryClass(stream.category)}">
        <span class="live-badge">● LIVE</span>
        <span class="thumb-symbol">${categorySymbol(stream.category)}</span>
        <span class="viewer-badge">◉ ${Number(stream.viewer_count || 0).toLocaleString()} viewers</span>
      </div>
      <div class="stream-info">
        <div class="avatar">${escapeHTML(initials(creator))}</div>
        <div class="stream-text"><b>${escapeHTML(stream.title)}</b><span>${escapeHTML(creator)} · ${escapeHTML(stream.category || 'General')}</span></div>
        <button class="more" type="button" aria-label="Stream options">•••</button>
      </div>
    </article>`;
  }).join('');
  $('emptyState').hidden = visible.length > 0;
  $('emptyState').textContent = allStreams.length
    ? 'No streams match your search or category.'
    : 'There are no live streams yet. Sign in and start the first StreamX stream.';
  const liveCount = document.querySelector('.live-count');
  if (liveCount) liveCount.textContent = `● ${allStreams.length} live`;
}
$('streamGrid').addEventListener('click', async event => {
  const card = event.target.closest('.stream-card');
  if (!card) return;
  if (event.target.closest('.more')) {
    showToast('Open the stream to follow, like, and chat.');
    return;
  }
  const stream = allStreams.find(item => item.id === card.dataset.streamId);
  if (stream) await openViewer(stream);
});

async function refreshFollowing() {
  if (!currentUser) {
    $('followingList').textContent = 'Sign in to see the creators you follow.';
    return;
  }
  try {
    const rows = await getMyFollowing();
    $('followingList').innerHTML = rows.length
      ? rows.map(row => {
          const creator = row.profiles;
          return `<span class="follow-chip">${escapeHTML(displayName(creator))}</span>`;
        }).join(' ')
      : 'You are not following anyone yet. Open a live stream and select Follow creator.';
  } catch (error) {
    console.error('Could not load following list:', error);
    $('followingList').textContent = 'Could not load your following list.';
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  video.pause();
  video.srcObject = null;
  video.style.display = 'none';
  cameraPlaceholder.style.display = 'flex';
  cameraBtn.textContent = 'Enable camera';
}
function openLive() {
  if (!currentUser) {
    showToast('Sign in before starting a stream.');
    openAuth();
    return;
  }
  $('modalNotice').textContent = 'Camera preview is local to this browser. Supabase will store the live stream record; video broadcasting needs a WebRTC/media service.';
  openBox(liveModal);
}
function closeLive() {
  closeBox(liveModal);
  if (!ownLiveStream) stopCamera();
}
$('heroGoLive').addEventListener('click', openLive);
$('sideGoLive').addEventListener('click', openLive);
$('closeModal').addEventListener('click', closeLive);
liveModal.addEventListener('click', event => {
  if (event.target === liveModal) closeLive();
});
cameraBtn.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Camera access needs localhost or HTTPS in a supported browser.');
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    video.srcObject = mediaStream;
    video.style.display = 'block';
    cameraPlaceholder.style.display = 'none';
    cameraBtn.textContent = 'Camera and mic enabled ✓';
    showToast('Camera and microphone are ready.');
  } catch (error) {
    showToast('Camera permission denied or no camera/microphone was found.');
  }
});
startBtn.addEventListener('click', async () => {
  if (!currentUser) {
    closeBox(liveModal);
    openAuth();
    return;
  }
  if (ownLiveStream) {
    startBtn.disabled = true;
    try {
      await endStream(ownLiveStream.id);
      ownLiveStream = null;
      stopCamera();
      startBtn.textContent = '● Go live';
      $('modalNotice').textContent = 'Your stream has ended and the status was saved in Supabase.';
      showToast('Stream ended and saved.');
      await refreshStreams();
    } catch (error) {
      showToast('Could not end stream: ' + error.message);
    } finally {
      startBtn.disabled = false;
    }
    return;
  }
  const title = $('streamTitle').value.trim();
  const category = $('streamCategory').value;
  if (title.length < 3) {
    showToast('Stream title must have at least 3 characters.');
    return;
  }
  if (!mediaStream) {
    showToast('Enable your camera first. You can still create a stream after granting access.');
    return;
  }
  startBtn.disabled = true;
  try {
    ownLiveStream = await createStream({ title, category, description: '' });
    startBtn.textContent = '■ End stream';
    $('modalNotice').textContent = 'Your live stream record is stored in Supabase and visible to other signed-in visitors. The camera preview is still local to this browser.';
    showToast('Your stream is now listed in StreamX!');
    await refreshStreams();
  } catch (error) {
    showToast('Could not start stream: ' + error.message);
  } finally {
    startBtn.disabled = false;
  }
});

async function closeChatChannel() {
  if (chatChannel) {
    await supabase.removeChannel(chatChannel);
    chatChannel = null;
  }
}
function appendChatMessage(message, senderName) {
  if (!message?.id || chatMessageIds.has(message.id)) return;
  chatMessageIds.add(message.id);
  const paragraph = document.createElement('p');
  const author = document.createElement('span');
  author.className = 'chat-user';
  author.textContent = (senderName || 'Creator') + ':';
  paragraph.append(author, document.createTextNode(' ' + message.message));
  $('chatMessages').append(paragraph);
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
}
async function openViewer(stream) {
  selectedStream = stream;
  chatMessageIds = new Set();
  await closeChatChannel();
  const creator = stream.profiles || {};
  $('viewerTitle').textContent = stream.title;
  $('viewerCreator').textContent = `${displayName(creator)} · ${stream.category || 'General'}`;
  $('viewerScreen').innerHTML = '<span>▶</span><small>Live video is not connected yet. This is the stream room and live chat.</small>';
  openBox($('viewerModal'));
  $('followBtn').disabled = Boolean(currentUser && currentUser.id === stream.creator_id);
  $('likeBtn').disabled = false;
  try {
    const [stats, chat] = await Promise.all([
      getStreamLikeStats(stream.id),
      getChatMessages(stream.id)
    ]);
    $('likeBtn').innerHTML = `♡ Like <span id="likeCount">${stats.count}</span>`;
    $('likeBtn').dataset.liked = String(stats.liked);
    $('likeBtn').textContent = stats.liked ? `✓ Liked · ${stats.count}` : `♡ Like · ${stats.count}`;
    $('followBtn').textContent = currentUser && await isFollowing(stream.creator_id) ? '✓ Following' : '♡ Follow creator';
    $('chatMessages').innerHTML = '';
    for (const message of chat) appendChatMessage(message, displayName(message.profiles));
    if (!chat.length) $('chatMessages').innerHTML = '<p class="chat-system">No messages yet. Start the conversation.</p>';
    chatChannel = subscribeToChat(stream.id, async payload => {
      try {
        const sender = await getPublicProfile(payload.user_id);
        appendChatMessage(payload, displayName(sender));
      } catch {
        appendChatMessage(payload, 'StreamX user');
      }
    });
  } catch (error) {
    $('chatMessages').textContent = 'Could not load chat: ' + error.message;
    showToast('Stream room loaded, but chat could not load.');
  }
}
$('closeViewer').addEventListener('click', async () => {
  closeBox($('viewerModal'));
  await closeChatChannel();
});
$('viewerModal').addEventListener('click', async event => {
  if (event.target === $('viewerModal')) {
    closeBox($('viewerModal'));
    await closeChatChannel();
  }
});
$('followBtn').addEventListener('click', async () => {
  if (!selectedStream) return;
  if (!currentUser) {
    openAuth();
    return;
  }
  if (currentUser.id === selectedStream.creator_id) {
    showToast('You cannot follow your own account.');
    return;
  }
  try {
    const alreadyFollowing = await isFollowing(selectedStream.creator_id);
    if (alreadyFollowing) {
      await unfollowCreator(selectedStream.creator_id);
      $('followBtn').textContent = '♡ Follow creator';
      showToast('Creator unfollowed.');
    } else {
      await followCreator(selectedStream.creator_id);
      $('followBtn').textContent = '✓ Following';
      showToast('You are now following this creator.');
    }
    await refreshFollowing();
  } catch (error) {
    showToast('Follow action failed: ' + error.message);
  }
});
$('likeBtn').addEventListener('click', async () => {
  if (!selectedStream) return;
  if (!currentUser) {
    openAuth();
    return;
  }
  try {
    const stats = await getStreamLikeStats(selectedStream.id);
    if (stats.liked) {
      showToast('You already liked this stream.');
      return;
    }
    await likeStream(selectedStream.id);
    const nextCount = stats.count + 1;
    $('likeBtn').textContent = `✓ Liked · ${nextCount}`;
    $('likeBtn').dataset.liked = 'true';
    showToast('Like saved to Supabase.');
  } catch (error) {
    showToast('Could not like stream: ' + error.message);
  }
});
$('chatForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!selectedStream) return;
  if (!currentUser) {
    openAuth();
    return;
  }
  const input = $('chatInput');
  const message = input.value.trim();
  if (!message) return;
  try {
    const saved = await sendChatMessage(selectedStream.id, message);
    appendChatMessage(saved, displayName(saved.profiles, profile?.username || 'You'));
    input.value = '';
  } catch (error) {
    showToast('Chat message was not saved: ' + error.message);
  }
});

$('editProfileBtn').addEventListener('click', () => {
  if (!currentUser) {
    openAuth();
    return;
  }
  $('nameInput').value = profile?.display_name || profile?.username || '';
  $('bioInput').value = profile?.bio || '';
  openBox($('profileModal'));
});
$('closeProfile').addEventListener('click', () => closeBox($('profileModal')));
$('profileModal').addEventListener('click', event => {
  if (event.target === $('profileModal')) closeBox($('profileModal'));
});
$('saveProfile').addEventListener('click', async () => {
  const name = $('nameInput').value.trim();
  const bio = $('bioInput').value.trim();
  if (!name) {
    showToast('Display name cannot be empty.');
    return;
  }
  try {
    profile = await updateMyProfile({ display_name: name, bio });
    renderProfile();
    closeBox($('profileModal'));
    showToast('Profile updated in Supabase.');
  } catch (error) {
    showToast('Profile could not be saved: ' + error.message);
  }
});

$('searchInput').addEventListener('input', renderStreams);
document.querySelectorAll('.filter').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    activeFilter = button.dataset.filter;
    renderStreams();
  });
});
document.querySelectorAll('.nav').forEach(link => {
  link.addEventListener('click', event => {
    const target = link.getAttribute('href');
    if (target === '#studio') {
      event.preventDefault();
      openLive();
      return;
    }
    document.querySelectorAll('.nav').forEach(item => item.classList.remove('active'));
    link.classList.add('active');
    if (target === '#home') window.scrollTo({ top: 0, behavior: 'smooth' });
    if (target === '#categories') $('explore').scrollIntoView({ behavior: 'smooth' });
  });
});
document.querySelector('.icon-btn').addEventListener('click', async () => {
  if (!currentUser) {
    openAuth();
    return;
  }
  try {
    const notifications = await getMyNotifications();
    const unread = notifications.filter(item => !item.is_read).length;
    if (!notifications.length) showToast('No notifications yet.');
    else showToast(`You have ${unread} unread notification(s). Latest: ${notifications[0].message}`);
  } catch (error) {
    showToast('Could not load notifications: ' + error.message);
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeBox(liveModal);
    closeBox($('viewerModal'));
    closeBox($('profileModal'));
    closeBox($('authModal'));
  }
});

(async function init() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await syncAuthState(data.session);
    subscribeToStreams(() => refreshStreams());
    supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => syncAuthState(session));
    });
  } catch (error) {
    console.error('StreamX startup error:', error);
    renderProfile();
    $('emptyState').hidden = false;
    $('emptyState').textContent = 'Unable to connect to Supabase. Check your internet connection.';
  }
})();
