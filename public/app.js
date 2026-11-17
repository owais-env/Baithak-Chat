const socket = io();
const $ = (id) => document.getElementById(id);

let myName = '';
let joined = false;
let currentChat = 'all';          // 'all' or another user's socket id
const chats = { all: [] };        // chat key -> list of messages
const chatNames = { all: 'Everyone' };
const unread = {};
let onlineUsers = [];

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
const AUDIO_EXT = /\.(aac|m4a|mp3|oga|ogg|opus|wav|weba|webm)$/i;

// ---------- Drawer (People & files) on phones ----------
function setMenuOpen(open) {
  document.body.classList.toggle('menu-open', open);
  $('menuBtn').setAttribute('aria-expanded', String(open));
}
function closeMenu() { setMenuOpen(false); }
$('menuBtn').addEventListener('click', () => {
  setMenuOpen(!document.body.classList.contains('menu-open'));
});
$('asideClose').addEventListener('click', closeMenu);
$('backdrop').addEventListener('click', closeMenu);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

$('nameInput').value = localStorage.getItem('name') || '';

// ---------- Join ----------
function join() {
  const name = $('nameInput').value.trim();
  if (!name) return;
  localStorage.setItem('name', name);
  socket.emit('join', name, (assigned) => { myName = assigned; });
  joined = true;
  $('login').hidden = true;
  $('app').hidden = false;
  renderTabs();
}

$('joinBtn').onclick = join;
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

// Rejoin automatically if the connection drops and comes back
socket.on('connect', () => {
  if (joined) socket.emit('join', myName, (assigned) => { myName = assigned; });
});

// ---------- Helpers ----------
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function timeStr(t) {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------- Messages ----------

function openImage(url) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  const big = document.createElement('img');
  big.src = url;
  overlay.appendChild(big);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

function buildMessage(m) {
  const div = document.createElement('div');

  if (m.type === 'system') {
    div.className = 'sys';
    div.textContent = m.text;
    return div;
  }

  div.className = 'msg' + (m.name === myName ? ' me' : '') + (m.private ? ' priv' : '');

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${m.name} · ${timeStr(m.time)}`;
  div.appendChild(meta);

  if (m.type === 'file') {
    const url = '/download/' + encodeURIComponent(m.fileId);

    if (IMAGE_EXT.test(m.fileName)) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = m.fileName;
      img.className = 'preview';
      img.onclick = () => openImage(url);
      div.appendChild(img);
    }

    const card = document.createElement('a');
    card.href = url;
    card.className = 'filecard';
    const icon = document.createElement('span');
    icon.textContent = '📎';
    const name = document.createElement('span');
    name.className = 'fname';
    name.textContent = m.fileName;
    const size = document.createElement('small');
    size.textContent = formatSize(m.size);
    card.append(icon, name, size);
    div.appendChild(card);
  } else {
    const text = document.createElement('div');
    text.textContent = m.text;
    div.appendChild(text);
  }
  return div;
}

function renderMessages() {
  const box = $('messages');
  box.innerHTML = '';
  (chats[currentChat] || []).forEach((m) => box.appendChild(buildMessage(m)));
  box.scrollTop = box.scrollHeight;
}

function pushMessage(key, m) {
  if (!chats[key]) chats[key] = [];
  chats[key].push(m);

  if (key === currentChat) {
    const box = $('messages');
    box.appendChild(buildMessage(m));
    box.scrollTop = box.scrollHeight;
  } else if (m.type !== 'system' && m.name !== myName) {
    unread[key] = (unread[key] || 0) + 1;
  }
  renderTabs();
}

// ---------- Tabs (Everyone + private chats) ----------
function renderTabs() {
  const tabs = $('tabs');
  tabs.innerHTML = '';

  Object.keys(chats).forEach((key) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab' + (key === currentChat ? ' active' : '') + (key === 'all' ? '' : ' priv');
    tab.textContent = key === 'all' ? 'Everyone' : '🔒 ' + (chatNames[key] || 'User');

    if (unread[key]) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = unread[key];
      tab.appendChild(badge);
    }

    tab.onclick = () => openChat(key);

    if (key !== 'all') {
      const x = document.createElement('span');
      x.className = 'close';
      x.textContent = '×';
      x.onclick = (e) => { e.stopPropagation(); closeChat(key); };
      tab.appendChild(x);
    }
    tabs.appendChild(tab);
  });
}

function openChat(key, name) {
  if (name) chatNames[key] = name;
  if (!chats[key]) chats[key] = [];
  currentChat = key;
  unread[key] = 0;
  $('msgInput').placeholder = key === 'all'
    ? 'Message everyone'
    : 'Private message to ' + chatNames[key];
  renderTabs();
  renderMessages();
  $('msgInput').focus();
}

function closeChat(key) {
  delete chats[key];
  delete unread[key];
  if (currentChat === key) openChat('all');
  else renderTabs();
}

// ---------- Socket events ----------
socket.on('history', (list) => {
  chats.all = list;
  if (currentChat === 'all') renderMessages();
});

socket.on('message', (m) => pushMessage('all', m));

socket.on('private', (m) => {
  const mine = m.fromId === socket.id;
  const key = mine ? m.toId : m.fromId;
  if (!mine) chatNames[key] = m.name;
  pushMessage(key, m);
});

socket.on('users', (list) => {
  onlineUsers = list;
  $('count').textContent = `${list.length} online`;
  const ul = $('users');
  ul.innerHTML = '';

  list.forEach((u) => {
    if (chats[u.id]) chatNames[u.id] = u.name;
    const li = document.createElement('li');
    if (u.id === socket.id) {
      li.textContent = u.name + ' (you)';
    } else {
      li.textContent = u.name;
      li.className = 'clickable';
      li.title = 'Start a private chat';
      li.onclick = () => { openChat(u.id, u.name); closeMenu(); };
    }
    ul.appendChild(li);
  });
  renderTabs();
});

// ---------- Sending text ----------
$('msgForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('msgInput').value.trim();
  if (!text) return;

  if (currentChat === 'all') {
    socket.emit('message', text);
  } else {
    socket.emit('private', { to: currentChat, text }, (res) => {
      if (!res.ok) alert(res.error);
    });
  }
  $('msgInput').value = '';
  hideMentionPicker();
});

// ---------- People tags ----------
const msgInput = $('msgInput');
const mentionPicker = $('mentionPicker');
let mentionOptions = [];
let selectedMention = 0;
let mentionRange = null;

function hideMentionPicker() {
  mentionPicker.hidden = true;
  mentionPicker.replaceChildren();
  mentionOptions = [];
  mentionRange = null;
}

function updateMentionPicker() {
  const caret = msgInput.selectionStart;
  const beforeCaret = msgInput.value.slice(0, caret);
  const at = beforeCaret.lastIndexOf('@');
  if (at < 0 || (at > 0 && !/\s/.test(beforeCaret[at - 1]))) {
    hideMentionPicker();
    return;
  }

  const query = beforeCaret.slice(at + 1);
  if (/[\r\n,!?]/.test(query)) {
    hideMentionPicker();
    return;
  }

  mentionOptions = onlineUsers
    .filter((user) => user.id !== socket.id && user.name.toLowerCase().startsWith(query.toLowerCase()))
    .slice(0, 6);
  if (!mentionOptions.length) {
    hideMentionPicker();
    return;
  }

  mentionRange = { start: at, end: caret };
  selectedMention = 0;
  mentionPicker.replaceChildren();
  mentionOptions.forEach((user, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'mention-option' + (index === selectedMention ? ' selected' : '');
    option.setAttribute('role', 'option');
    option.textContent = '@' + user.name;
    option.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      selectMention(index);
    });
    option.addEventListener('click', () => selectMention(index));
    mentionPicker.appendChild(option);
  });
  mentionPicker.hidden = false;
}

function selectMention(index) {
  const user = mentionOptions[index];
  if (!user || !mentionRange) return;

  const start = mentionRange.start;
  const end = mentionRange.end;
  const insertion = '@' + user.name + ' ';
  msgInput.value = msgInput.value.slice(0, start) + insertion + msgInput.value.slice(end);
  const caret = start + insertion.length;
  msgInput.focus();
  msgInput.setSelectionRange(caret, caret);
  hideMentionPicker();
}

msgInput.addEventListener('input', updateMentionPicker);
msgInput.addEventListener('click', updateMentionPicker);
msgInput.addEventListener('keyup', (event) => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Escape') {
    updateMentionPicker();
  }
});
msgInput.addEventListener('keydown', (event) => {
  if (mentionPicker.hidden) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    selectedMention = (selectedMention + (event.key === 'ArrowDown' ? 1 : mentionOptions.length - 1)) % mentionOptions.length;
    [...mentionPicker.children].forEach((option, index) => {
      option.classList.toggle('selected', index === selectedMention);
    });
  } else if (event.key === 'Enter' && mentionOptions[selectedMention]) {
    event.preventDefault();
    selectMention(selectedMention);
  } else if (event.key === 'Escape') {
    hideMentionPicker();
  }
});

// ---------- Quick emoji reactions ----------
const emojiBtn = $('emojiBtn');
const emojiPicker = $('emojiPicker');

emojiBtn.onclick = () => {
  emojiPicker.hidden = !emojiPicker.hidden;
  emojiBtn.setAttribute('aria-expanded', String(!emojiPicker.hidden));
};

emojiPicker.addEventListener('click', (e) => {
  const button = e.target.closest('[data-emoji]');
  if (!button) return;

  const input = $('msgInput');
  const draft = input.value;
  input.value = button.dataset.emoji;
  $('msgForm').requestSubmit();
  input.value = draft;
  emojiPicker.hidden = true;
  emojiBtn.setAttribute('aria-expanded', 'false');
  input.focus();
});

// ---------- Sending files with the + button ----------
$('plusBtn').onclick = () => $('fileInput').click();

function uploadFile(file, onComplete) {
  if (!file) return;
  if (file.type.toLowerCase().startsWith('audio/') || AUDIO_EXT.test(file.name)) {
    const status = $('uploadStatus');
    status.hidden = false;
    status.textContent = 'Audio sharing is not available.';
    setTimeout(() => { status.hidden = true; }, 4000);
    if (onComplete) onComplete(false);
    return;
  }

  const form = new FormData();
  form.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');
  xhr.setRequestHeader('x-socket-id', socket.id);
  if (currentChat !== 'all') xhr.setRequestHeader('x-to', currentChat);

  const status = $('uploadStatus');
  status.hidden = false;
  status.textContent = `Uploading ${file.name}... 0%`;

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      status.textContent = `Uploading ${file.name}... ${Math.round((e.loaded / e.total) * 100)}%`;
    }
  };
  xhr.onload = () => {
    if (xhr.status === 200) {
      status.hidden = true;
      if (onComplete) onComplete(true);
    } else {
      let msg = 'Upload failed';
      try { msg += ': ' + JSON.parse(xhr.responseText).error; } catch (e) {}
      status.textContent = msg;
      setTimeout(() => { status.hidden = true; }, 4000);
      if (onComplete) onComplete(false);
    }
  };
  xhr.onerror = () => {
    status.textContent = 'Upload failed (network error)';
    setTimeout(() => { status.hidden = true; }, 4000);
    if (onComplete) onComplete(false);
  };
  xhr.send(form);
}

function handleFileSelection(event) {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  uploadFile(file);
  input.value = '';
}

$('fileInput').addEventListener('change', handleFileSelection);

// ---------- Shared files list (public files, with admin delete) ----------
socket.on('files', (list) => {
  $('files').innerHTML = '';
  if (!list.length) {
    $('files').innerHTML = '<li>No files yet</li>';
    return;
  }
  list.forEach((f) => {
    const li = document.createElement('li');

    const a = document.createElement('a');
    a.href = '/download/' + encodeURIComponent(f.id);
    a.textContent = f.name;

    const small = document.createElement('small');
    small.textContent = formatSize(f.size);

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'del';
    del.onclick = async () => {
      const pw = prompt('Admin password to delete "' + f.name + '":');
      if (!pw) return;
      const res = await fetch('/api/files/' + encodeURIComponent(f.id), {
        method: 'DELETE',
        headers: { 'x-admin-password': pw },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Delete failed');
      }
    };

    li.append(a, small, del);
    $('files').appendChild(li);
  });
});
