/* ==========================================================================
   Equipify — Freelance Worker / Messages

   Two paged lists side by side. The conversation list on the left is an
   EquipifyList over GET /freelancer/conversations (searchable, paged). The
   thread on the right pages GET /freelancer/messages?conversation_id= newest
   first, so "Load earlier" walks backwards a page at a time and prepends.

   Messaging has no tables in the schema yet, so both endpoints serve
   placeholder data and sending validates without storing.
   ========================================================================== */

(function () {
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

  // ---------- Conversations ----------
  EquipifyList.create({
    endpoint: '/freelancer/conversations',
    container: document.getElementById('conversationList'),
    searchInput: document.getElementById('conversationSearch'),
    pager: document.getElementById('conversationPager'),
    perPage: 8,
    emptyMessage: 'No conversations match that search.',
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
    } else {
      top.appendChild(Portal.element('span', 'conversation-when', Portal.date(conversation.last_message_at)));
    }
    button.appendChild(top);

    button.appendChild(Portal.element('span', 'conversation-preview', conversation.last_message));
    button.appendChild(Portal.element('span', 'conversation-when',
      conversation.party_role + ' · ' + conversation.job_ref));

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
    threadPage = 1;

    threadName.textContent = conversation.party_name;
    threadMeta.textContent = conversation.party_role + ' · ' + conversation.job_ref;
    composerInput.disabled = false;
    composerSend.disabled = false;
    composerError.hidden = true;

    thread.textContent = '';
    thread.appendChild(Portal.element('p', 'list-state', 'Loading…'));
    loadThreadPage(1, true);
  }

  function loadThreadPage(page, replace) {
    return EquipifyApi.query('/freelancer/messages', {
      conversation_id: activeConversation.conversation_id,
      page: page,
      per_page: 12
    }).then(function (res) {
      if (replace) thread.textContent = '';

      if (!res.ok) {
        thread.appendChild(Portal.element('p', 'list-state list-state--error', res.error));
        return;
      }

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
        bubbles.reverse().forEach(function (bubble) { thread.insertBefore(bubble, thread.firstChild); });
        // Keep the message the user was reading in place after prepending.
        thread.scrollTop = thread.scrollHeight - previousHeight;
      }

      loadEarlierBtn.hidden = threadPage >= threadTotalPages;
    });
  }

  function messageBubble(message) {
    var bubble = Portal.element('div', 'bubble bubble--' + (message.sender === 'me' ? 'me' : 'them'));
    bubble.appendChild(document.createTextNode(message.body));
    bubble.appendChild(Portal.element('span', 'bubble-when', Portal.dateTime(message.sent_at)));
    return bubble;
  }

  loadEarlierBtn.addEventListener('click', function () {
    if (threadPage >= threadTotalPages) return;
    loadEarlierBtn.disabled = true;
    loadThreadPage(threadPage + 1, false).then(function () {
      loadEarlierBtn.disabled = false;
    });
  });

  // ---------- Composer ----------
  document.getElementById('composerForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!activeConversation) return;

    var body = composerInput.value.trim();
    composerError.hidden = true;
    if (body === '') {
      composerError.textContent = 'Write a message first.';
      composerError.hidden = false;
      return;
    }
    composerSend.disabled = true;

    EquipifyApi.post('/freelancer/messages', {
      conversation_id: activeConversation.conversation_id,
      body: body
    }).then(function (res) {
      composerSend.disabled = false;
      if (!res.ok) {
        Portal.showFormError(composerError, res);
        return;
      }
      // The placeholder endpoint stores nothing, so the sent message is
      // appended from the response rather than by refetching the thread.
      var placeholder = thread.querySelector('.list-state');
      if (placeholder) placeholder.remove();
      thread.appendChild(messageBubble(res.data));
      thread.scrollTop = thread.scrollHeight;
      composerInput.value = '';
    });
  });
})();
