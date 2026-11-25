const $ = (id) => document.getElementById(id);
const modal = $('liveModal'), video = $('cameraPreview'), placeholder = $('cameraPlaceholder');
const cameraBtn = $('cameraBtn'), startBtn = $('startBtn'), toast = $('toast');
let mediaStream = null, isBroadcastPreview = false, currentStream = null;
let profile = JSON.parse(localStorage.getItem('streamx_profile') || '{"name":"Sai Teja","bio":"Creator account · Welcome to StreamX!"}');
let following = JSON.parse(localStorage.getItem('streamx_following') || '[]');
let likes = JSON.parse(localStorage.getItem('streamx_likes') || '{}');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}
function openBox(el) { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
function closeBox(el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
function openLive() { openBox(modal); }
function stopCamera() {
  if (mediaStream) { mediaStream.getTracks().forEach(track => track.stop()); mediaStream = null; }
  video.pause();
  video.srcObject = null;
  video.style.display = 'none';
  placeholder.style.display = 'flex';
  cameraBtn.textContent = 'Enable camera';
  startBtn.textContent = '● Go live';
  startBtn.disabled = false;
  isBroadcastPreview = false;
}
function closeLive() { closeBox(modal); stopCamera(); }

$('heroGoLive').addEventListener('click', openLive);
$('sideGoLive').addEventListener('click', openLive);
$('closeModal').addEventListener('click', closeLive);
modal.addEventListener('click', event => { if (event.target === modal) closeLive(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') [modal, $('viewerModal'), $('profileModal')].forEach(closeBox);
});

cameraBtn.addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Camera is unavailable. Open this project on localhost in Chrome.');
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    video.srcObject = mediaStream;
    video.style.display = 'block';
    placeholder.style.display = 'none';
    cameraBtn.textContent = 'Camera enabled ✓';
    showToast('Camera and microphone are ready.');
  } catch (error) {
    showToast('Camera permission denied or camera not found.');
  }
});

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function addStreamCard(title, category, creator = 'Sai Teja', local = true) {
  const card = document.createElement('article');
  card.className = 'stream-card';
  card.dataset.category = category;
  card.dataset.title = title;
  card.dataset.creator = creator;
  card.dataset.local = String(local);
  const cls = { Gaming: 'thumb-game', Music: 'thumb-music', Education: 'thumb-code', 'Just chatting': 'thumb-talk', 'Art & design': 'thumb-music' }[category] || 'thumb-code';
  const sym = { Gaming: '⌁', Music: '♫', Education: '</>', 'Just chatting': '☕', 'Art & design': '✎' }[category] || '▶';
  card.innerHTML = `<div class="thumbnail ${cls}"><span class="live-badge">● LIVE</span><span class="thumb-symbol">${sym}</span><span class="viewer-badge">◉ ${local ? '1' : '512'}</span></div><div class="stream-info"><div class="avatar">${creator.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}</div><div class="stream-text"><b>${escapeHTML(title)}</b><span>${escapeHTML(creator)} · ${escapeHTML(category)}</span></div><button class="more" type="button" aria-label="More options">•••</button></div>`;
  $('streamGrid').prepend(card);
  card.addEventListener('click', () => openViewer({ title, category, creator, local }));
  updateStreams();
  return card;
}

startBtn.addEventListener('click', () => {
  const title = $('streamTitle').value.trim(), category = $('streamCategory').value;
  if (!title) { showToast('Enter a stream title first.'); return; }
  if (!mediaStream) { showToast('Enable your camera before going live.'); return; }
  if (isBroadcastPreview) { showToast('Your local preview is already running.'); return; }
  isBroadcastPreview = true;
  startBtn.textContent = '■ End stream';
  $('modalNotice').textContent = 'Your camera preview is active on this device. This demo does not broadcast to other users.';
  addStreamCard(title, category, profile.name, true);
  startBtn.onclick = () => {
    stopCamera();
    showToast('Your local stream has ended.');
    startBtn.onclick = null;
  };
  showToast('Your local stream preview is now live!');
});

// Search and category filters
let activeFilter = 'All';
const filters = document.querySelectorAll('.filter');
function updateStreams() {
  const query = $('searchInput').value.toLowerCase().trim();
  let visible = 0;
  document.querySelectorAll('.stream-card').forEach(card => {
    const matches = (activeFilter === 'All' || card.dataset.category === activeFilter) &&
      (`${card.dataset.title} ${card.dataset.creator} ${card.dataset.category}`).toLowerCase().includes(query);
    card.style.display = matches ? '' : 'none';
    if (matches) visible++;
  });
  $('emptyState').hidden = visible !== 0;
}
filters.forEach(button => button.addEventListener('click', () => {
  filters.forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  activeFilter = button.dataset.filter === 'Talk' ? 'Just chatting' : button.dataset.filter;
  updateStreams();
}));
$('searchInput').addEventListener('input', updateStreams);

// Stream viewer, follow, like and chat interactions
function openViewer(data) {
  currentStream = data;
  $('viewerTitle').textContent = data.title;
  $('viewerCreator').textContent = `${data.creator} · ${data.category}`;
  $('likeCount').textContent = likes[data.title] || 0;
  $('likeBtn').innerHTML = `♡ Like <span id="likeCount">${likes[data.title] || 0}</span>`;
  $('followBtn').textContent = following.includes(data.creator) ? '✓ Following' : '♡ Follow creator';
  $('chatMessages').innerHTML = '<p class="chat-system">Welcome! Chat messages are saved for this session only.</p>';
  openBox($('viewerModal'));
}
document.querySelectorAll('.stream-card').forEach(card => card.addEventListener('click', event => {
  if (event.target.closest('.more')) {
    event.stopPropagation();
    showToast('Stream options: open the stream to follow or like the creator.');
    return;
  }
  openViewer({ title: card.dataset.title, category: card.dataset.category, creator: card.dataset.creator, local: false });
}));
$('closeViewer').addEventListener('click', () => closeBox($('viewerModal')));
$('viewerModal').addEventListener('click', event => { if (event.target === $('viewerModal')) closeBox($('viewerModal')); });
$('followBtn').addEventListener('click', () => {
  if (!currentStream) return;
  const name = currentStream.creator;
  if (following.includes(name)) following = following.filter(item => item !== name);
  else following.push(name);
  localStorage.setItem('streamx_following', JSON.stringify(following));
  $('followBtn').textContent = following.includes(name) ? '✓ Following' : '♡ Follow creator';
  renderFollowing();
  showToast(following.includes(name) ? `You are now following ${name}.` : `You unfollowed ${name}.`);
});
$('likeBtn').addEventListener('click', () => {
  if (!currentStream) return;
  likes[currentStream.title] = (likes[currentStream.title] || 0) + 1;
  localStorage.setItem('streamx_likes', JSON.stringify(likes));
  $('likeCount').textContent = likes[currentStream.title];
  showToast('You liked this stream!');
});
$('chatForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('chatInput'), message = input.value.trim();
  if (!message) return;
  const paragraph = document.createElement('p');
  const author = document.createElement('span');
  author.className = 'chat-user';
  author.textContent = profile.name + ':';
  paragraph.append(author, document.createTextNode(' ' + message));
  $('chatMessages').append(paragraph);
  $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
  input.value = '';
});

function renderFollowing() {
  $('followingList').innerHTML = following.length
    ? following.map(name => `<span class="follow-chip">♡ ${escapeHTML(name)}</span>`).join(' ')
    : 'You are not following any creators yet. Open a stream and select Follow to build your list.';
}
function renderProfile() {
  $('profileName').textContent = profile.name;
  $('profileBio').textContent = profile.bio;
  $('profileAvatar').textContent = profile.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  document.querySelector('.user-mini b').textContent = profile.name;
  document.querySelector('.profile-pill span:not(.avatar)').textContent = profile.name;
}
$('editProfileBtn').addEventListener('click', () => {
  $('nameInput').value = profile.name;
  $('bioInput').value = profile.bio;
  openBox($('profileModal'));
});
$('closeProfile').addEventListener('click', () => closeBox($('profileModal')));
$('profileModal').addEventListener('click', event => { if (event.target === $('profileModal')) closeBox($('profileModal')); });
$('saveProfile').addEventListener('click', () => {
  const name = $('nameInput').value.trim();
  if (!name) { showToast('Display name cannot be empty.'); return; }
  profile = { name, bio: $('bioInput').value.trim() };
  localStorage.setItem('streamx_profile', JSON.stringify(profile));
  renderProfile();
  closeBox($('profileModal'));
  showToast('Profile updated successfully.');
});

// Sidebar links navigate to actual sections; Creator Studio opens its setup modal.
document.querySelectorAll('.nav').forEach(link => link.addEventListener('click', event => {
  const target = link.getAttribute('href');
  if (target === '#studio') { event.preventDefault(); openLive(); return; }
  document.querySelectorAll('.nav').forEach(item => item.classList.remove('active'));
  link.classList.add('active');
  if (target === '#categories') $('explore').scrollIntoView({ behavior: 'smooth' });
  if (target === '#home') window.scrollTo({ top: 0, behavior: 'smooth' });
}));
document.querySelector('.icon-btn').addEventListener('click', () => showToast('You are all caught up — no new notifications.'));
document.querySelector('.profile-pill').addEventListener('click', () => $('editProfileBtn').click());
document.querySelectorAll('.more').forEach(button => button.addEventListener('click', event => {
  event.stopPropagation();
  showToast('Open this stream to follow, like, and chat with the creator.');
}));

renderProfile();
renderFollowing();
updateStreams();
