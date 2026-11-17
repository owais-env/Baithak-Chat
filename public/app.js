
const socket = io();
const $ = (id) => document.getElementById(id);

// --------------------------------------------------
// STATE
// --------------------------------------------------

let myName = '';
let joined = false;
let currentChat = 'all';

const chats = { all: [] };
const chatNames = { all: 'Everyone' };
const unread = {};
let onlineUsers = [];

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();
}

function formatSize(bytes = 0) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024)
    return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';

  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function timeStr(time) {
  return new Date(time).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function dateLabel(time) {
  const date = new Date(time);
  const today = new Date();

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

// --------------------------------------------------
// MOBILE SIDEBAR
// --------------------------------------------------

function closeMenu() {
  document.body.classList.remove('menu-open');
}

$('menuBtn').onclick = () => {
  document.body.classList.toggle('menu-open');
};

$('asideClose').onclick = closeMenu;
$('backdrop').onclick = closeMenu;

// --------------------------------------------------
// CONNECTION STATUS
// --------------------------------------------------

function updateConnection(connected) {
  const status = $('connectionStatus');

  status.classList.toggle('connected', connected);
  status.classList.toggle('disconnected', !connected);

  $('connectionText').textContent =
    connected ? 'Connected' : 'Reconnecting';
}

socket.on('connect', () => {
  updateConnection(true);

  if (joined) {
    socket.emit('join', myName, (assigned) => {
      myName = assigned;
      updateProfile();
    });
  }
});

socket.on('disconnect', () => {
  updateConnection(false);
});

// --------------------------------------------------
// PROFILE
// --------------------------------------------------

function updateProfile() {
  $('myName').textContent = myName;
  $('myAvatar').textContent = initials(myName);
}

// --------------------------------------------------
// JOIN
// --------------------------------------------------

$('nameInput').value = localStorage.getItem('name') || '';

function join() {
  const name = $('nameInput').value.trim();

  if (!name) {
    $('nameInput').focus();
    return;
  }

  if (!socket.connected) {
    alert('Please wait until Baithak connects.');
    return;
  }

  $('joinBtn').disabled = true;

  socket.emit('join', name, (assigned) => {
    myName = assigned;
    joined = true;

    localStorage.setItem('name', name);

    $('login').hidden = true;
    $('app').hidden = false;

    updateProfile();
    updateConnection(true);
    renderTabs();
    updateConversationHeader();
    renderMessages();
  });
}

$('joinBtn').onclick = join;

$('nameInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') join();
});

// --------------------------------------------------
// MESSAGE LIGHTBOX
// --------------------------------------------------

function openImage(url) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';

  const image = document.createElement('img');
  image.src = url;
  image.alt = 'Shared image';

  overlay.appendChild(image);
  overlay.onclick = () => overlay.remove();

  document.body.appendChild(overlay);
}

// --------------------------------------------------
// EMPTY CHAT
// --------------------------------------------------

function renderEmptyState() {
  const box = $('messages');

  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';

  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.textContent = currentChat === 'all' ? '✦' : '↗';

  const heading = document.createElement('h3');
  heading.textContent = currentChat === 'all'
    ? 'Welcome to the Baithak'
    : 'Start a conversation';

  const description = document.createElement('p');
  description.textContent = currentChat === 'all'
    ? 'This is your shared space. Say hello and bring everyone together.'
    : `Your conversation with ${chatNames[currentChat] || 'this person'} starts here.`;

  wrapper.append(icon, heading, description);
  box.appendChild(wrapper);
}

// --------------------------------------------------
// BUILD MESSAGE
// --------------------------------------------------

function buildMessage(message) {
  const div = document.createElement('div');

  if (message.type === 'system') {
    div.className = 'sys';
    div.textContent = message.text;
    return div;
  }

  const isMe = message.name === myName;

  div.className =
    'msg' +
    (isMe ? ' me' : '') +
    (message.private ? ' priv' : '');

  // Message header
  const header = document.createElement('div');
  header.className = 'message-header';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = initials(message.name);

  const meta = document.createElement('div');
  meta.className = 'meta';

  const name = document.createElement('strong');
  name.textContent = isMe ? 'You' : message.name;

  const time = document.createElement('span');
  time.textContent = timeStr(message.time);

  meta.append(name, time);
  header.append(avatar, meta);

  div.appendChild(header);

  // File message
  if (message.type === 'file') {
    const url = '/download/' + encodeURIComponent(message.fileId);

    if (IMAGE_EXT.test(message.fileName)) {
      const image = document.createElement('img');

      image.src = url;
      image.alt = message.fileName;
      image.className = 'preview';
      image.loading = 'lazy';
      image.onclick = () => openImage(url);

      div.appendChild(image);
    }

    const card = document.createElement('a');
    card.href = url;
    card.className = 'filecard';
    card.download = message.fileName;

    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = IMAGE_EXT.test(message.fileName)
      ? '▧'
      : '↧';

    const info = document.createElement('span');
    info.className = 'file-info';

    const fileName = document.createElement('strong');
    fileName.className = 'fname';
    fileName.textContent = message.fileName;

    const fileSize = document.createElement('small');
    fileSize.textContent = formatSize(message.size);

    info.append(fileName, fileSize);
    card.append(icon, info);

    div.appendChild(card);

  } else {
    // Text message
    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = message.text;

    div.appendChild(text);
  }

  return div;
}

// --------------------------------------------------
// RENDER MESSAGES
// --------------------------------------------------

function renderMessages() {
  const box = $('messages');
  box.innerHTML = '';

  const list = chats[currentChat] || [];

  if (!list.length) {
    renderEmptyState();
    return;
  }

  let previousDate = '';

  list.forEach((message) => {
    if (message.type !== 'system') {
      const currentDate = new Date(message.time).toDateString();

      if (currentDate !== previousDate) {
        const separator = document.createElement('div');
        separator.className = 'date-separator';

        const label = document.createElement('span');
        label.textContent = dateLabel(message.time);

        separator.appendChild(label);
        box.appendChild(separator);

        previousDate = currentDate;
      }
    }

    box.appendChild(buildMessage(message));
  });

  box.scrollTop = box.scrollHeight;
}

// --------------------------------------------------
// ADD MESSAGE
// --------------------------------------------------

function pushMessage(key, message) {
  if (!chats[key]) chats[key] = [];

  chats[key].push(message);

  if (key === currentChat) {
    const box = $('messages');

    const isEmpty = box.querySelector('.empty-state');

    if (isEmpty) {
      renderMessages();
    } else {
      const list = chats[key];
      const previous = list[list.length - 2];

      if (
        message.type !== 'system' &&
        previous &&
        new Date(previous.time).toDateString() !==
        new Date(message.time).toDateString()
      ) {
        const separator = document.createElement('div');
        separator.className = 'date-separator';

        const label = document.createElement('span');
        label.textContent = dateLabel(message.time);

        separator.appendChild(label);
        box.appendChild(separator);
      }

      box.appendChild(buildMessage(message));
      box.scrollTop = box.scrollHeight;
    }
  } else if (
    message.type !== 'system' &&
    message.name !== myName
  ) {
    unread[key] = (unread[key] || 0) + 1;
  }

  renderTabs();
}

// --------------------------------------------------
// CONVERSATION HEADER
// --------------------------------------------------

function updateConversationHeader() {
  const isGroup = currentChat === 'all';

  const title = isGroup
    ? 'Everyone'
    : chatNames[currentChat] || 'Private chat';

  $('chatTitle').textContent = title;
  $('chatAvatar').textContent = isGroup ? 'G' : initials(title);

  $('chatSubtitle').textContent = isGroup
    ? `${onlineUsers.length} people in your Baithak`
    : 'Private conversation';

  $('msgInput').placeholder = isGroup
    ? 'Message everyone...'
    : `Message ${title}...`;

  $('sendBtn').title = 'Send message';
}

// --------------------------------------------------
// CHAT TABS
// --------------------------------------------------

function renderTabs() {
  const tabs = $('tabs');
  tabs.innerHTML = '';

  Object.keys(chats).forEach((key) => {
    const tab = document.createElement('button');

    tab.type = 'button';

    tab.className =
      'tab' +
      (key === currentChat ? ' active' : '') +
      (key === 'all' ? '' : ' priv');

    const label = document.createElement('span');
    label.textContent = key === 'all'
      ? 'Everyone'
      : '🔒 ' + (chatNames[key] || 'User');

    tab.appendChild(label);

    if (unread[key]) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = unread[key];

      tab.appendChild(badge);
    }

    tab.onclick = () => openChat(key);

    if (key !== 'all') {
      const close = document.createElement('span');

      close.className = 'close';
      close.textContent = '×';
      close.title = 'Close conversation';

      close.onclick = (event) => {
        event.stopPropagation();
        closeChat(key);
      };

      tab.appendChild(close);
    }

    tabs.appendChild(tab);
  });
}

function openChat(key, name) {
  if (name) chatNames[key] = name;

  if (!chats[key]) chats[key] = [];

  currentChat = key;
  unread[key] = 0;

  renderTabs();
  updateConversationHeader();
  renderMessages();

  $('msgInput').focus();
}

function closeChat(key) {
  delete chats[key];
  delete unread[key];
  delete chatNames[key];

  if (currentChat === key) {
    openChat('all');
  } else {
    renderTabs();
  }
}

// --------------------------------------------------
// SOCKET EVENTS
// --------------------------------------------------

socket.on('history', (list) => {
  chats.all = list || [];

  if (currentChat === 'all') {
    renderMessages();
  }
});

socket.on('message', (message) => {
  pushMessage('all', message);
});

socket.on('private', (message) => {
  const mine = message.fromId === socket.id;

  const key = mine
    ? message.toId
    : message.fromId;

  if (!mine) {
    chatNames[key] = message.name;
  }

  pushMessage(key, message);
});

// --------------------------------------------------
// ONLINE USERS
// --------------------------------------------------

function renderUsers() {
  const list = $('users');
  const search = $('userSearch').value.toLowerCase().trim();

  list.innerHTML = '';

  const filtered = onlineUsers.filter(user =>
    user.name.toLowerCase().includes(search)
  );

  if (!filtered.length) {
    const empty = document.createElement('li');
    empty.className = 'user-empty';
    empty.textContent = search
      ? 'No people found'
      : 'Nobody is online yet';

    list.appendChild(empty);
    return;
  }

  filtered.forEach((user) => {
    if (chats[user.id]) {
      chatNames[user.id] = user.name;
    }

    const li = document.createElement('li');

    li.className = 'user-item';

    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.textContent = initials(user.name);

    const details = document.createElement('div');
    details.className = 'user-info';

    const name = document.createElement('strong');
    name.textContent = user.name;

    const status = document.createElement('small');
    status.textContent = user.id === socket.id
      ? 'You'
      : 'Available';

    details.append(name, status);

    const action = document.createElement('span');
    action.className = 'user-arrow';
    action.textContent = user.id === socket.id ? '✓' : '›';

    li.append(avatar, details, action);

    if (user.id !== socket.id) {
      li.classList.add('clickable');

      li.onclick = () => {
        openChat(user.id, user.name);
        closeMenu();
      };
    }

    if (user.id === currentChat) {
      li.classList.add('selected');
    }

    list.appendChild(li);
  });
}

$('userSearch').addEventListener('input', renderUsers);

socket.on('users', (list) => {
  onlineUsers = list || [];

  $('count').textContent = `${onlineUsers.length} online`;
  $('peopleCount').textContent = onlineUsers.length;

  renderUsers();
  updateConversationHeader();
  renderTabs();
});

// --------------------------------------------------
// SEND TEXT MESSAGES
// --------------------------------------------------

$('msgForm').addEventListener('submit', (event) => {
  event.preventDefault();

  const text = $('msgInput').value.trim();

  if (!text) return;

  if (!socket.connected) {
    alert('Connection lost. Please wait for reconnection.');
    return;
  }

  if (currentChat === 'all') {
    socket.emit('message', text);
  } else {
    socket.emit(
      'private',
      {
        to: currentChat,
        text
      },
      (response) => {
        if (!response || !response.ok) {
          alert(response?.error || 'Message could not be sent.');
        }
      }
    );
  }

  $('msgInput').value = '';
  $('msgInput').focus();
});

// --------------------------------------------------
// FILE UPLOAD
// --------------------------------------------------

$('plusBtn').onclick = () => {
  if (!socket.connected) {
    alert('You are currently disconnected.');
    return;
  }

  $('fileInput').click();
};

$('fileInput').addEventListener('change', () => {
  const file = $('fileInput').files[0];

  if (!file) return;

  const form = new FormData();
  form.append('file', file);

  const xhr = new XMLHttpRequest();

  xhr.open('POST', '/api/upload');
  xhr.setRequestHeader('x-socket-id', socket.id);

  if (currentChat !== 'all') {
    xhr.setRequestHeader('x-to', currentChat);
  }

  const status = $('uploadStatus');

  status.hidden = false;
  status.textContent = `Uploading ${file.name} · 0%`;

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percent = Math.round(
        (event.loaded / event.total) * 100
      );

      status.textContent =
        `Uploading ${file.name} · ${percent}%`;
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      status.textContent = 'File shared successfully ✓';

      setTimeout(() => {
        status.hidden = true;
      }, 1800);
    } else {
      let error = 'Upload failed';

      try {
        error += ': ' + JSON.parse(xhr.responseText).error;
      } catch (e) {}

      status.textContent = error;

      setTimeout(() => {
        status.hidden = true;
      }, 4000);
    }
  };

  xhr.onerror = () => {
    status.textContent = 'Upload failed. Check your connection.';

    setTimeout(() => {
      status.hidden = true;
    }, 4000);
  };

  xhr.send(form);

  $('fileInput').value = '';
});

// --------------------------------------------------
// SHARED FILES
// --------------------------------------------------

socket.on('files', (list) => {
  const container = $('files');
  container.innerHTML = '';

  if (!list || !list.length) {
    const empty = document.createElement('li');
    empty.className = 'file-empty';
    empty.textContent = 'No shared files yet';

    container.appendChild(empty);
    return;
  }

  list.forEach((file) => {
    const li = document.createElement('li');
    li.className = 'shared-file';

    const icon = document.createElement('div');
    icon.className = 'shared-file-icon';
    icon.textContent = IMAGE_EXT.test(file.name) ? '▧' : '↧';

    const info = document.createElement('div');
    info.className = 'shared-file-info';

    const link = document.createElement('a');

    link.href = '/download/' + encodeURIComponent(file.id);
    link.textContent = file.name;
    link.title = file.name;

    const size = document.createElement('small');
    size.textContent = formatSize(file.size);

    info.append(link, size);

    const actions = document.createElement('div');
    actions.className = 'file-actions';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.textContent = '×';
    del.title = 'Delete shared file';

    del.onclick = async () => {
      const password = prompt(
        `Admin password to delete "${file.name}":`
      );

      if (!password) return;

      try {
        const response = await fetch(
          '/api/files/' + encodeURIComponent(file.id),
          {
            method: 'DELETE',
            headers: {
              'x-admin-password': password
            }
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          alert(data.error || 'Delete failed');
        }
      } catch (error) {
        alert('Could not connect to the server.');
      }
    };

    actions.appendChild(del);
    li.append(icon, info, actions);

    container.appendChild(li);
  });
});

