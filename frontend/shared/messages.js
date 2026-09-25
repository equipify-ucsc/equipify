/* Shared participant-scoped messaging, using the existing API/list/Portal helpers. */
window.EquipifyMessages = { init: function (prefix) {
  'use strict';

  var thread = document.getElementById('thread');
  var threadName = document.getElementById('threadName');
  var threadMeta = document.getElementById('threadMeta');
  var loadEarlierBtn = document.getElementById('loadEarlierBtn');
  var composerInput = document.getElementById('composerInput');
  var composerSend = document.getElementById('composerSend');
  var composerError = document.getElementById('composerError');

  var activeConversation = null;
  var threadPage = 1;
  var threadTotalPages = 1;

  var snapshotId = null;
  var selectionVersion = 0;
  var loading = false;
  var sending = false;

  // People discovery is separate from searching the existing conversation list.
  var newMessageBtn = document.getElementById('newMessageBtn');
  var peoplePanel = document.getElementById('newMessagePanel');
  var closePeopleBtn = document.getElementById('closeNewMessageBtn');
  var peopleInput = document.getElementById('messageUserSearch');
  var peopleResults = document.getElementById('messageUserResults');
  var peopleError = document.getElementById('messageUserError');
  var peopleVersion = 0;
  var peopleTimer;
  var starting = false;
  var roleLabels = { customer: 'Customer', renting_party: 'Renting Party',
    freelance_worker: 'Freelance Worker', delivery_personnel: 'Delivery Personnel', maintenance_tech: 'Technician' };

  function closePeople() {
    if (starting) return;
    peopleVersion++;
    clearTimeout(peopleTimer);
    peoplePanel.hidden = true;
    newMessageBtn.setAttribute('aria-expanded', 'false');
    newMessageBtn.focus();
  }
  newMessageBtn.addEventListener('click', function () {
    if (!peoplePanel.hidden) { closePeople(); return; }
    peoplePanel.hidden = false;
    newMessageBtn.setAttribute('aria-expanded', 'true');
    peopleInput.focus();
    searchPeople();
  });
  closePeopleBtn.addEventListener('click', closePeople);
  peoplePanel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closePeople();
  });
  peopleInput.addEventListener('input', function () {
    peopleVersion++;
    clearTimeout(peopleTimer);
    peopleResults.textContent = '';
    peopleTimer = setTimeout(searchPeople, 250);
  });
  function searchPeople() {
    var version = ++peopleVersion;
    peopleError.hidden = true;
    peopleResults.textContent = '';
    peopleResults.appendChild(Portal.element('p', 'list-state', 'Searching...'));
    var term = peopleInput.value.trim();
    EquipifyApi.query(prefix + '/message-users', { search: term }).then(function (res) {
      if (version !== peopleVersion || peoplePanel.hidden) return;
      peopleResults.textContent = '';
      if (!res.ok) { Portal.showFormError(peopleError, res); return; }
      document.getElementById('messageUserRoles').textContent = 'Available: ' + res.data.allowed_roles.map(function (role) {
        return roleLabels[role] || role;
      }).join(', ') + '. Up to 20 matches; refine your search if needed.';
      if (!res.data.items.length) {
        peopleResults.appendChild(Portal.element('p', 'list-state', term ? 'No matching people.' : 'Enter a name to find someone.'));
      }
      res.data.items.forEach(function (person) {
        var button = Portal.element('button', 'message-user');
        button.type = 'button';
        button.appendChild(Portal.element('span', 'conversation-name', person.name));
        button.appendChild(Portal.element('span', 'conversation-when', roleLabels[person.role] || person.role));
        button.addEventListener('click', function () { startConversation(person); });
        peopleResults.appendChild(button);
      });
    });
  }
  function startConversation(person) {
    if (starting || sending) return;
    starting = true;
    peopleVersion++;
    peopleError.hidden = true;
    peopleInput.disabled = true;
    closePeopleBtn.disabled = true;
    peopleResults.querySelectorAll('button').forEach(function (button) { button.disabled = true; });
    EquipifyApi.post(prefix + '/conversations', { participant_user_id: person.user_id }).then(function (res) {
      starting = false;
      peopleInput.disabled = false;
      closePeopleBtn.disabled = false;
      peopleResults.querySelectorAll('button').forEach(function (button) { button.disabled = false; });
      if (!res.ok) { Portal.showFormError(peopleError, res); return; }
      closePeople();
      // Clear only the conversation filter so the opened thread is not hidden by an old search.
      var filter = document.getElementById('conversationSearch');
      filter.value = '';
      filter.dispatchEvent(new Event('input', { bubbles: true }));
      selectConversation(res.data);
      conversations.reset();
    });
  }

  // ---------- Conversations ----------
  var conversations = EquipifyList.create({
    endpoint: prefix + '/conversations',
    container: document.getElementById('conversationList'),
    searchInput: document.getElementById('conversationSearch'),
    pager: document.getElementById('conversationPager'),
    perPage: 8,
    emptyMessage: 'No conversations yet, or none match your search.',
    renderItem: conversationButton,
    onLoad: function (data) {
      // Open the first conversation automatically, but don't yank the user
      // away from one they're already reading.
      if (activeConversation === null && data.items.length) {
        selectConversation(data.items[0]);
      }
    }
  });

  function conversationButton(conversation) {
    var button = Portal.element('button', 'conversation');
    button.type = 'button';
    button.dataset.conversationId = conversation.conversation_id;
    if (activeConversation && activeConversation.conversation_id === conversation.conversation_id) {
      button.classList.add('is-active');
    }

    var top = Portal.element('div', 'conversation-top');
    top.appendChild(Portal.element('span', 'conversation-name', conversation.party_name));
    if (conversation.unread_count > 0) {
      top.appendChild(Portal.element('span', 'unread-dot', conversation.unread_count));
    }
    button.appendChild(top);
    button.appendChild(Portal.element('span', 'conversation-when', Portal.dateTime(conversation.last_message_at)));

    button.appendChild(Portal.element('span', 'conversation-preview', conversation.last_message || 'No messages yet.'));
    button.appendChild(Portal.element('span', 'conversation-when',
      conversation.party_role.replace(/_/g, ' ')));

    button.addEventListener('click', function () {
      selectConversation(conversation);
      // Move the highlight without refetching the whole list.
      document.querySelectorAll('.conversation').forEach(function (other) {
        other.classList.toggle('is-active', other === button);
      });
    });

    return button;
  }

  // ---------- Thread ----------
  function selectConversation(conversation) {
    activeConversation = conversation;
    selectionVersion++;
    snapshotId = null;
    threadPage = 1;
    threadTotalPages = 1;
    loadEarlierBtn.hidden = true;
    composerInput.value = '';
    document.querySelectorAll('.conversation').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.conversationId === String(conversation.conversation_id));
    });

    threadName.textContent = conversation.party_name;
    threadMeta.textContent = conversation.party_role.replace(/_/g, ' ');
    composerInput.disabled = true;
    composerSend.disabled = true;
    composerError.hidden = true;

    thread.textContent = '';
    thread.appendChild(Portal.element('p', 'list-state', 'Loading…'));
    loadThreadPage(1, true);
  }

  function loadThreadPage(page, replace) {
    var version = selectionVersion;
    loading = true;
    loadEarlierBtn.disabled = true;
    return EquipifyApi.query(prefix + '/messages', {
      conversation_id: activeConversation.conversation_id,
      page: page,
      per_page: 12,
      snapshot_id: snapshotId
    }).then(function (res) {
      if (version !== selectionVersion) return;
      loading = false;
      loadEarlierBtn.disabled = false;
      if (replace) thread.textContent = '';

      if (!res.ok) {
        thread.appendChild(Portal.element('p', 'list-state list-state--error', res.error));
        return;
      }

      snapshotId = res.data.snapshot_id;
      composerInput.disabled = sending;
      composerSend.disabled = sending;
      threadPage = res.data.page;
      threadTotalPages = res.data.total_pages;

      if (!res.data.items.length && replace) {
        thread.appendChild(Portal.element('p', 'list-state', 'No messages yet. Say hello.'));
      }

      // The endpoint returns newest first; the thread reads oldest to newest,
      // so each batch is reversed. A later page is older, so it goes on top.
      var bubbles = res.data.items.slice().reverse().map(messageBubble);
      if (replace) {
        bubbles.forEach(function (bubble) { thread.appendChild(bubble); });
        thread.scrollTop = thread.scrollHeight;
      } else {
        var previousHeight = thread.scrollHeight;
        var previousTop = thread.scrollTop;
        bubbles.reverse().forEach(function (bubble) { thread.insertBefore(bubble, thread.firstChild); });
        // Keep the message the user was reading in place after prepending.
        thread.scrollTop = previousTop + thread.scrollHeight - previousHeight;
      }

      loadEarlierBtn.hidden = threadPage >= threadTotalPages;
      conversations.reload();
    });
  }

  function messageBubble(message) {
    var bubble = Portal.element('div', 'bubble bubble--' + (message.sender === 'me' ? 'me' : 'them'));
    bubble.appendChild(document.createTextNode(message.body));
    bubble.appendChild(Portal.element('span', 'bubble-when', Portal.dateTime(message.sent_at)));
    return bubble;
  }

  loadEarlierBtn.addEventListener('click', function () {
    if (loading || threadPage >= threadTotalPages) return;
    loadEarlierBtn.disabled = true;
    loadThreadPage(threadPage + 1, false);
  });

  // ---------- Composer ----------
  document.getElementById('composerForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!activeConversation || sending || loading || composerInput.disabled) return;

    var body = composerInput.value.trim();
    composerError.hidden = true;
    if (body === '') {
      composerError.textContent = 'Write a message first.';
      composerError.hidden = false;
      return;
    }
    if (Array.from(body).length > 2000) {
      composerError.textContent = 'Message must be at most 2000 characters.';
      composerError.hidden = false;
      return;
    }
    var version = selectionVersion;
    sending = true;
    composerInput.disabled = true;
    composerSend.disabled = true;

    EquipifyApi.post(prefix + '/messages', {
      conversation_id: activeConversation.conversation_id,
      body: body
    }).then(function (res) {
      sending = false;
      if (version !== selectionVersion) {
        if (!loading) { composerInput.disabled = false; composerSend.disabled = false; }
        if (!res.ok) window.showToast(res.error);
        conversations.reload();
        return;
      }
      composerInput.disabled = false;
      composerSend.disabled = false;
      if (!res.ok) {
        Portal.showFormError(composerError, res);
        return;
      }
      // Append the stored row; retain the original boundary for older pages.
      var placeholder = thread.querySelector('.list-state');
      if (placeholder) placeholder.remove();
      thread.appendChild(messageBubble(res.data));
      thread.scrollTop = thread.scrollHeight;
      composerInput.value = '';
      conversations.reload();
    });
  });
} };
