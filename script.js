import {
  auth, supabase, getMyProfile, updateMyProfile, listStreams, createStream,
  endStream, getMyFollowing, isFollowing, followCreator, unfollowCreator,
  getStreamLikeStats, likeStream, sendChatMessage, getChatMessages,
  subscribeToChat, subscribeToStreams, getPublicProfile, getMyNotifications,
  saveStreamRecording, getMyStreamRecordings, listCreators
} from './backend/streamx-api.js';

const $ = id => document.getElementById(id);
const liveModal = $('liveModal');
const video = $('cameraPreview');
const cameraPlaceholder = $('cameraPlaceholder');
const cameraBtn = $('cameraBtn');
const screenBtn = $('screenBtn');
const startBtn = $('startBtn');
const toast = $('toast');

// The original camera stream is kept separate from the composed screen+webcam recording.
const cameraSourceVideo = document.createElement('video');
cameraSourceVideo.autoplay = true;
cameraSourceVideo.muted = true;
cameraSourceVideo.playsInline = true;

let currentUser = null;
let profile = null;
let mediaStream = null;
let screenStream = null;
let screenVideo = null;
let compositionCanvas = null;
let compositionFrameId = null;
let recordingPreviewStream = null;
let recordingStream = null;
let audioContext = null;
let mediaRecorder = null;
let recordingChunks = [];
let recordingStartedAt = null;
let ownLiveStream = null;
let finishStreamPromise = null;
let selectedStream = null;
let chatChannel = null;
let chatMessageIds = new Set();
let activeFilter = 'All';
let authMode = 'signin';
let allStreams = [];
let allCreators = [];
let followingIds = new Set();
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
  $('authOpenBtn').textContent = signedIn ? (profile?.display_name || profile?.username || 'My account') : 'Login / Sign up';
  $('authLogoutBtn').hidden = !signedIn;
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
  await Promise.all([refreshStreams(), refreshRecordings()]);
  await refreshFollowing();
  renderStreams();
  await refreshCreators();
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

/* Sidebar account menu */
const accountMenu = $('accountMenu');
const accountMenuBtn = $('accountMenuBtn');

function closeAccountMenu() {
  accountMenu.hidden = true;
  accountMenuBtn.setAttribute('aria-expanded', 'false');
}

accountMenuBtn.addEventListener('click', event => {
  event.stopPropagation();
  const willOpen = accountMenu.hidden;
  accountMenu.hidden = !willOpen;
  accountMenuBtn.setAttribute('aria-expanded', String(willOpen));
});

accountMenu.addEventListener('click', event => event.stopPropagation());
document.addEventListener('click', event => {
  if (!accountMenu.hidden && !accountMenu.contains(event.target) && event.target !== accountMenuBtn) {
    closeAccountMenu();
  }
});

$('accountEditProfile').addEventListener('click', () => {
  closeAccountMenu();
  if (!currentUser) {
    openAuth();
    return;
  }
  $('nameInput').value = profile?.display_name || profile?.username || '';
  $('bioInput').value = profile?.bio || '';
  openBox($('profileModal'));
});

$('accountMyAccount').addEventListener('click', () => {
  closeAccountMenu();
  openAuth();
});

$('accountLogout').addEventListener('click', () => {
  closeAccountMenu();
  if (!currentUser) {
    openAuth();
    return;
  }
  $('authLogoutBtn').click();
});

$('authLogoutBtn').addEventListener('click', async () => {
  const button = $('authLogoutBtn');
  button.disabled = true;
  try {
    await auth.signOut();
    await syncAuthState(null);
    closeBox($('authModal'));
    showToast('You have signed out.');
  } catch (error) {
    showToast('Could not sign out: ' + error.message);
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
    await Promise.all([refreshStreams(), refreshRecordings()]);
  await refreshFollowing();
  renderStreams();
  await refreshCreators();
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
        <button class="card-follow-btn" type="button" data-card-follow data-stream-id="${id}">
          ${followingIds.has(stream.creator_id) ? '✓ Following' : '+ Follow'}
        </button>
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
  const followButton = event.target.closest('[data-card-follow]');
  if (followButton) {
    event.stopPropagation();
    followButton.disabled = true;
    try {
      const stream = allStreams.find(item => item.id === followButton.dataset.streamId);
      if (stream) await toggleCreatorFollow(stream.creator_id, !followingIds.has(stream.creator_id));
    } finally {
      followButton.disabled = false;
    }
    return;
  }
  const card = event.target.closest('.stream-card');
  if (!card) return;
  if (event.target.closest('.more')) {
    showToast('Open the stream to follow, like, and chat.');
    return;
  }
  const stream = allStreams.find(item => item.id === card.dataset.streamId);
  if (stream) await openViewer(stream);
});

function creatorAvatar(profile) {
  const name = displayName(profile, 'StreamX creator');
  return profile?.avatar_url
    ? `<img src="${escapeHTML(profile.avatar_url)}" alt="" loading="lazy">`
    : escapeHTML(initials(name));
}

function renderFollowing(rows = []) {
  const list = $('followingList');
  if (!currentUser) {
    list.textContent = 'Sign in to follow creators and build your community.';
    return;
  }
  if (!rows.length) {
    list.textContent = 'You are not following anyone yet. Visit Discover creators and press Follow.';
    return;
  }
  list.innerHTML = rows.map(row => {
    const creator = row.profiles || {};
    const id = escapeHTML(row.followed_id);
    return `<article class="person-card following-person-card">
      <div class="avatar person-avatar">${creatorAvatar(creator)}</div>
      <div class="person-details">
        <b>${escapeHTML(displayName(creator))}</b>
        <span>@${escapeHTML(creator.username || 'creator')}</span>
      </div>
      <button class="person-follow-btn is-following" type="button" data-creator-id="${id}" data-follow-action="unfollow">Unfollow</button>
    </article>`;
  }).join('');
}

async function refreshFollowing() {
  if (!currentUser) {
    followingIds = new Set();
    renderFollowing([]);
    return;
  }
  try {
    const rows = await getMyFollowing();
    followingIds = new Set(rows.map(row => row.followed_id));
    renderFollowing(rows);
  } catch (error) {
    console.error('Could not load following list:', error);
    $('followingList').textContent = 'Could not load your following list: ' + error.message;
  }
}

function renderCreators() {
  const grid = $('creatorGrid');
  if (!grid) return;
  const query = $('creatorSearchInput').value.toLowerCase().trim();
  const visible = allCreators.filter(creator => {
    if (currentUser && creator.id === currentUser.id) return false;
    const text = `${creator.display_name || ''} ${creator.username || ''} ${creator.bio || ''}`.toLowerCase();
    return text.includes(query);
  });

  if (!visible.length) {
    grid.textContent = allCreators.length > 0
      ? 'No creators match your search. Try another name or username.'
      : 'No other creators have joined StreamX yet. Invite someone to create an account, then you can follow them here.';
    return;
  }

  grid.innerHTML = visible.map(creator => {
    const id = escapeHTML(creator.id);
    const isFollowed = followingIds.has(creator.id);
    return `<article class="person-card">
      <div class="avatar person-avatar">${creatorAvatar(creator)}</div>
      <div class="person-details">
        <b>${escapeHTML(displayName(creator))}</b>
        <span>@${escapeHTML(creator.username || 'creator')}</span>
        <small>${escapeHTML(creator.bio || 'StreamX creator')}</small>
      </div>
      <button class="person-follow-btn ${isFollowed ? 'is-following' : ''}" type="button"
        data-creator-id="${id}" data-follow-action="${isFollowed ? 'unfollow' : 'follow'}">
        ${isFollowed ? '✓ Following' : '+ Follow'}
      </button>
    </article>`;
  }).join('');
}

async function refreshCreators() {
  const grid = $('creatorGrid');
  if (!grid) return;
  grid.textContent = 'Loading creators...';
  try {
    allCreators = await listCreators();
    renderCreators();
  } catch (error) {
    console.error('Could not load creators:', error);
    grid.textContent = 'Could not load creators: ' + error.message;
  }
}

async function toggleCreatorFollow(creatorId, shouldFollow) {
  if (!currentUser) {
    showToast('Sign in to follow creators.');
    openAuth();
    return;
  }
  if (currentUser.id === creatorId) {
    showToast('You cannot follow your own account.');
    return;
  }
  try {
    if (shouldFollow) {
      await followCreator(creatorId);
      showToast('You are now following this creator.');
    } else {
      await unfollowCreator(creatorId);
      showToast('Creator unfollowed.');
    }
    await refreshFollowing();
    renderCreators();
  } catch (error) {
    showToast('Follow action failed: ' + error.message);
  }
}

$('creatorSearchInput').addEventListener('input', renderCreators);

$('creatorGrid').addEventListener('click', async event => {
  const button = event.target.closest('[data-follow-action]');
  if (!button) return;
  button.disabled = true;
  try {
    await toggleCreatorFollow(button.dataset.creatorId, button.dataset.followAction === 'follow');
  } finally {
    button.disabled = false;
  }
});

$('followingList').addEventListener('click', async event => {
  const button = event.target.closest('[data-follow-action="unfollow"]');
  if (!button) return;
  button.disabled = true;
  try {
    await toggleCreatorFollow(button.dataset.creatorId, false);
  } finally {
    button.disabled = false;
  }
});

function recordingMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  return candidates.find(type => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

function drawVideoCover(context, source, x, y, width, height) {
  const sourceWidth = source.videoWidth || width;
  const sourceHeight = source.videoHeight || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sx = (sourceWidth - cropWidth) / 2;
  const sy = (sourceHeight - cropHeight) / 2;
  context.drawImage(source, sx, sy, cropWidth, cropHeight, x, y, width, height);
}

function drawCompositionFrame() {
  if (!compositionCanvas) return;
  const context = compositionCanvas.getContext('2d');
  const width = compositionCanvas.width;
  const height = compositionCanvas.height;
  context.fillStyle = '#070910';
  context.fillRect(0, 0, width, height);

  const screenReady = screenStream && screenVideo && screenVideo.readyState >= 2 && screenVideo.videoWidth;
  if (screenReady) {
    const sourceWidth = screenVideo.videoWidth;
    const sourceHeight = screenVideo.videoHeight;
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    context.drawImage(screenVideo, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);

    // Webcam picture-in-picture in the lower-right corner.
    const cameraWidth = 320;
    const cameraHeight = 180;
    const cameraX = width - cameraWidth - 28;
    const cameraY = height - cameraHeight - 28;
    context.save();
    context.fillStyle = '#0b0d14';
    context.beginPath();
    if (typeof context.roundRect === 'function') {
      context.roundRect(cameraX - 5, cameraY - 5, cameraWidth + 10, cameraHeight + 10, 18);
    } else {
      context.rect(cameraX - 5, cameraY - 5, cameraWidth + 10, cameraHeight + 10);
    }
    context.fill();
    context.clip();
    if (cameraSourceVideo.readyState >= 2 && cameraSourceVideo.videoWidth) {
      context.translate(cameraX + cameraWidth, cameraY);
      context.scale(-1, 1);
      drawVideoCover(context, cameraSourceVideo, 0, 0, cameraWidth, cameraHeight);
    } else {
      context.fillStyle = '#23283a';
      context.fillRect(cameraX, cameraY, cameraWidth, cameraHeight);
    }
    context.restore();
  } else if (cameraSourceVideo.readyState >= 2 && cameraSourceVideo.videoWidth) {
    // If screen sharing is stopped, keep recording the webcam full-frame.
    drawVideoCover(context, cameraSourceVideo, 0, 0, width, height);
  }

  compositionFrameId = requestAnimationFrame(drawCompositionFrame);
}

async function startScreenShare() {
  if (!mediaStream) {
    showToast('Enable your camera and microphone before sharing your screen.');
    return;
  }
  if (screenStream || recordingPreviewStream) {
    showToast('Screen capture is already set up for this stream.');
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    showToast('Screen sharing is not supported here. Use the latest Chrome or Edge on localhost or HTTPS.');
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 24, max: 30 } },
      audio: true
    });

    screenVideo = document.createElement('video');
    screenVideo.autoplay = true;
    screenVideo.muted = true;
    screenVideo.playsInline = true;
    screenVideo.srcObject = screenStream;
    await screenVideo.play();

    compositionCanvas = document.createElement('canvas');
    compositionCanvas.width = 1280;
    compositionCanvas.height = 720;
    compositionFrameId = requestAnimationFrame(drawCompositionFrame);
    recordingPreviewStream = compositionCanvas.captureStream(24);

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('This browser cannot mix microphone and screen audio.');
    audioContext = new AudioContextClass();
    await audioContext.resume();
    const audioDestination = audioContext.createMediaStreamDestination();
    const audioTracks = [
      ...mediaStream.getAudioTracks(),
      ...screenStream.getAudioTracks()
    ];
    audioTracks.forEach((track, index) => {
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      const gain = audioContext.createGain();
      gain.gain.value = index === 0 ? 1 : 0.65;
      source.connect(gain);
      gain.connect(audioDestination);
    });

    recordingStream = new MediaStream([
      ...recordingPreviewStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks()
    ]);
    video.srcObject = recordingPreviewStream;
    video.style.display = 'block';
    cameraPlaceholder.style.display = 'none';
    await video.play().catch(() => {});

    const activeScreen = screenStream;
    const screenTrack = screenStream.getVideoTracks()[0];
    if (screenTrack) {
      screenTrack.addEventListener('ended', () => {
        if (screenStream !== activeScreen) return;
        screenStream = null;
        if (screenVideo) {
          screenVideo.pause();
          screenVideo.srcObject = null;
        }
        screenBtn.textContent = 'Screen ended — camera continues';
        screenBtn.disabled = true;
        showToast('Screen sharing ended. Camera recording will continue.');
      }, { once: true });
    }

    screenBtn.textContent = 'Stop screen share';
    screenBtn.classList.add('screen-sharing-active');
    showToast('Screen and webcam are ready. Go Live to record both.');
  } catch (error) {
    console.error('Screen sharing setup failed:', error);
    if (screenStream) screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
    if (screenVideo) {
      screenVideo.pause();
      screenVideo.srcObject = null;
      screenVideo = null;
    }
    if (compositionFrameId !== null) cancelAnimationFrame(compositionFrameId);
    compositionFrameId = null;
    if (recordingPreviewStream) recordingPreviewStream.getTracks().forEach(track => track.stop());
    recordingPreviewStream = null;
    if (recordingStream) recordingStream.getTracks().forEach(track => track.stop());
    recordingStream = null;
    compositionCanvas = null;
    if (audioContext) await audioContext.close().catch(() => {});
    audioContext = null;
    video.srcObject = mediaStream;
    screenBtn.textContent = 'Share screen';
    screenBtn.classList.remove('screen-sharing-active');
    screenBtn.disabled = false;
    showToast('Could not share screen: ' + (error.message || 'permission was cancelled.'));
  }
}

function stopScreenShare() {
  const active = screenStream;
  screenStream = null;
  if (active) active.getTracks().forEach(track => track.stop());
  if (screenVideo) {
    screenVideo.pause();
    screenVideo.srcObject = null;
    screenVideo = null;
  }
  if (compositionFrameId !== null) cancelAnimationFrame(compositionFrameId);
  compositionFrameId = null;
  if (recordingPreviewStream) recordingPreviewStream.getTracks().forEach(track => track.stop());
  recordingPreviewStream = null;
  if (recordingStream) recordingStream.getTracks().forEach(track => track.stop());
  recordingStream = null;
  compositionCanvas = null;
  if (audioContext) {
    audioContext.close().catch(error => console.warn('Could not close audio context:', error));
    audioContext = null;
  }
  screenBtn.textContent = 'Share screen';
  screenBtn.classList.remove('screen-sharing-active');
  screenBtn.disabled = false;
}

function startLocalRecording() {
  if (!window.MediaRecorder) {
    throw new Error('This browser does not support recording. Please use the latest Chrome or Edge.');
  }
  if (!mediaStream) throw new Error('Enable your camera and microphone before going live.');
  const sourceStream = recordingStream || mediaStream;

  const mimeType = recordingMimeType();
  // Keep the recording bitrate modest so a video can fit the private bucket's 50 MB limit.
  const options = mimeType
    ? { mimeType, videoBitsPerSecond: 520000, audioBitsPerSecond: 64000 }
    : { videoBitsPerSecond: 520000, audioBitsPerSecond: 64000 };
  mediaRecorder = new MediaRecorder(sourceStream, options);
  recordingChunks = [];
  recordingStartedAt = Date.now();
  mediaRecorder.addEventListener('dataavailable', event => {
    if (event.data && event.data.size > 0) recordingChunks.push(event.data);
  });
  mediaRecorder.start(1000);
}

async function stopRecordingAndSave(stream) {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return null;
  const recorder = mediaRecorder;
  const startedAt = recordingStartedAt || Date.now();

  return new Promise((resolve, reject) => {
    recorder.addEventListener('stop', async () => {
      const chunks = recordingChunks;
      const durationSeconds = (Date.now() - startedAt) / 1000;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      mediaRecorder = null;
      recordingChunks = [];
      recordingStartedAt = null;

      try {
        const saved = await saveStreamRecording({
          streamId: stream.id,
          title: stream.title,
          category: stream.category,
          blob,
          durationSeconds,
          onProgress: (uploaded, total) => {
            const percent = total ? Math.floor((uploaded / total) * 100) : 0;
            $('modalNotice').textContent = `Uploading your recording to private storage: ${percent}%`;
          }
        });
        await refreshRecordings();
        resolve(saved);
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    recorder.stop();
  });
}

async function finishCurrentStream() {
  if (finishStreamPromise) return finishStreamPromise;

  const stream = ownLiveStream;
  if (!stream) {
    stopCamera();
    return;
  }

  ownLiveStream = null;
  startBtn.textContent = '● Go live';
  startBtn.disabled = true;
  $('modalNotice').textContent = 'Finishing your stream and uploading its recording to your private StreamX library...';

  finishStreamPromise = (async () => {
    let recordingSaved = false;
    let recordingError = null;
    let streamError = null;

    // Mark the stream as ended immediately, before a possibly long video upload.
    try {
      await endStream(stream.id);
    } catch (error) {
      streamError = error;
      console.error('Could not update stream status:', error);
    }

    try {
      if (mediaRecorder) {
        const savedRecording = await stopRecordingAndSave(stream);
        recordingSaved = Boolean(savedRecording);
      }
    } catch (error) {
      recordingError = error;
      console.error('Recording upload failed:', error);
    } finally {
      stopCamera();
      startBtn.disabled = false;
      await Promise.all([refreshStreams(), refreshRecordings()]);
    }

    if (recordingSaved) {
      $('modalNotice').textContent = 'Stream ended. Your video recording is saved under My Recordings.';
      showToast('Recording saved! Open My Recordings to watch or download it.');
    } else if (recordingError) {
      $('modalNotice').textContent = 'Your stream ended, but the recording could not be uploaded.';
      showToast('Stream ended, but recording upload failed: ' + recordingError.message);
    } else {
      showToast('Stream ended.');
    }
    if (streamError) showToast('Recording step finished, but stream status update failed: ' + streamError.message);
  })();

  try {
    await finishStreamPromise;
  } finally {
    finishStreamPromise = null;
  }
}

function formatRecordingDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${minutes}:${String(remaining).padStart(2, '0')}`;
}

async function refreshRecordings() {
  const list = $('recordingsList');
  if (!list) return;
  if (!currentUser) {
    list.textContent = 'Sign in to see your saved recordings.';
    return;
  }

  list.textContent = 'Loading your recordings...';
  try {
    const recordings = await getMyStreamRecordings();
    if (!recordings.length) {
      list.textContent = 'No recordings yet. Start a stream and end it to save your first video here.';
      return;
    }
    list.innerHTML = recordings.map(recording => {
      const date = new Date(recording.created_at).toLocaleString();
      const sizeMb = (Number(recording.file_size_bytes) / (1024 * 1024)).toFixed(1);
      return `<article class="recording-card">
        <video controls preload="metadata" src="${escapeHTML(recording.watch_url)}"></video>
        <div class="recording-card-info">
          <b>${escapeHTML(recording.title)}</b>
          <span>${escapeHTML(recording.category)} · ${formatRecordingDuration(recording.duration_seconds)} · ${sizeMb} MB</span>
          <small>${escapeHTML(date)}</small>
        </div>
        <a class="recording-download" href="${escapeHTML(recording.download_url)}" target="_blank" rel="noopener">Download recording ↗</a>
      </article>`;
    }).join('');
  } catch (error) {
    console.error('Could not load StreamX recordings:', error);
    list.textContent = 'Could not load recordings: ' + error.message;
  }
}

$('refreshRecordingsBtn').addEventListener('click', refreshRecordings);

function stopCamera() {
  stopScreenShare();
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  cameraSourceVideo.pause();
  cameraSourceVideo.srcObject = null;
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
  $('modalNotice').textContent = 'Enable your camera and microphone, then go live. StreamX records your local camera/mic feed and uploads it privately when you end the stream (50 MB max). This build does not yet relay video to remote viewers.';
  openBox(liveModal);
}
async function closeLive() {
  if (ownLiveStream || finishStreamPromise) {
    await finishCurrentStream();
  } else {
    stopCamera();
  }
  closeBox(liveModal);
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
    cameraSourceVideo.srcObject = mediaStream;
    await cameraSourceVideo.play().catch(() => {});
    video.srcObject = mediaStream;
    video.style.display = 'block';
    cameraPlaceholder.style.display = 'none';
    cameraBtn.textContent = 'Camera and mic enabled ✓';
    showToast('Camera and microphone are ready.');
  } catch (error) {
    showToast('Camera permission denied or no camera/microphone was found.');
  }
});

screenBtn.addEventListener('click', async () => {
  if (screenStream) {
    const active = screenStream;
    screenStream = null;
    active.getTracks().forEach(track => track.stop());
    if (screenVideo) {
      screenVideo.pause();
      screenVideo.srcObject = null;
    }
    screenBtn.textContent = 'Screen ended — camera continues';
    screenBtn.disabled = true;
    showToast('Screen sharing stopped. Camera recording will continue.');
    return;
  }
  await startScreenShare();
});
startBtn.addEventListener('click', async () => {
  if (!currentUser) {
    closeBox(liveModal);
    openAuth();
    return;
  }
  if (ownLiveStream) {
    await finishCurrentStream();
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
    try {
      startLocalRecording();
    } catch (recordError) {
      const failedStream = ownLiveStream;
      ownLiveStream = null;
      await endStream(failedStream.id).catch(() => {});
      stopCamera();
      throw recordError;
    }
    startBtn.textContent = '■ End stream';
    $('modalNotice').textContent = 'Recording is active. When you end the stream, StreamX uploads the video to your private My Recordings library. Remote live video broadcasting is not enabled yet.';
    showToast('Stream started and recording is active.');
    await refreshStreams();
  } catch (error) {
    showToast('Could not start recording: ' + error.message);
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
    await toggleCreatorFollow(selectedStream.creator_id, !alreadyFollowing);
    $('followBtn').textContent = alreadyFollowing ? '♡ Follow creator' : '✓ Following';
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
    if (target === '#discoverCreators') $('discoverCreators').scrollIntoView({ behavior: 'smooth' });
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
    closeAccountMenu();
    closeLive();
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
