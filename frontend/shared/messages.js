/* ==========================================================================
   Equipify — shared Messages page (vanilla JS)
   Exposes window.EquipifyMessages.init().

   Needs, in order: shared/api.js, session.js, script.js, list.js,
   inbox-mock.js, inbox-badges.js. Used by <Role>/Messages/ for every role but
   the freelance worker (whose page predates this and reads its own
   placeholder endpoints); the layout and behaviour are the same as that page:

   - Left: the conversation list, an EquipifyList over
     EquipifyInbox.conversations (searchable, paged, newest activity first).
   - Right: the open thread. It pages newest first, so "Load earlier" walks
     backwards a page at a time and prepends, keeping the reading position.
   - "New message" opens a dialog listing only the roles this role may start a
     conversation with (EquipifyInbox.RULES). Picking a person reuses an
     existing conversation with them or starts a new one.
   - A link like Messages/index.html?to=<name>&role=<role>&about=<ref> opens
     (or starts) a conversation with that person, e.g. from a listing's
     "Message" button.

   Every row is built with createElement/textContent, never innerHTML.
   ========================================================================== */

(function () {
  'use strict';

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(name, className) {
    var span = element('span', 'icon ' + (className || 'icon-sm'), name);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function parseDate(value) {
    return new Date(String(value).replace(' ', 'T'));
  }

  /** "22 Sep 2026", or the time alone when it is today. */
  function shortWhen(value) {
    if (!value) return '';
    var d = parseDate(value);
    if (isNaN(d.getTime())) return String(value);
    var now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /** "22 Sep 2026, 14:05". */
  function dateTime(value) {
    if (!value) return '';
    var d = parseDate(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).map(function (word) {
      return word.charAt(0);
    }).join('').slice(0, 2).toUpperCase();
  }

  var toastTimer;
  function toast(message) {
    var box = document.getElementById('toast');
    if (!box) return;
    box.textContent = message;
    box.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.classList.remove('is-visible'); }, 2600);
  }

  function refreshBadges() {
    if (window.EquipifyInboxBadges) window.EquipifyInboxBadges.refresh();
  }

  function init() {
    var Inbox = window.EquipifyInbox;

    var conversationList = document.getElementById('conversationList');
    var conversationSearch = document.getElementById('conversationSearch');
    var threadCard = document.getElementById('threadCard');
    var thread = document.getElementById('thread');
    var threadName = document.getElementById('threadName');
    var threadMeta = document.getElementById('threadMeta');
    var threadAvatar = document.getElementById('threadAvatar');
    var loadEarlierBtn = document.getElementById('loadEarlierBtn');
    var composerForm = document.getElementById('composerForm');
    var composerInput = document.getElementById('composerInput');
    var composerSend = document.getElementById('composerSend');
    var composerError = document.getElementById('composerError');
    var composerHint = document.getElementById('composerHint');

    var activeConversation = null;
    var threadPage = 1;
    var threadTotalPages = 1;
    var list = null;

    // ---------- Conversations ----------
    function conversationButton(conversation) {
      var button = element('button', 'conversation');
      button.type = 'button';
      button.dataset.conversationId = conversation.conversation_id;
      if (activeConversation && activeConversation.conversation_id === conversation.conversation_id) {
        button.classList.add('is-active');
      }

      var top = element('div', 'conversation-top');
      top.appendChild(element('span', 'conversation-name', conversation.party_name));
      if (conversation.unread_count > 0) {
        var dot = element('span', 'unread-dot', conversation.unread_count);
        dot.setAttribute('aria-label', conversation.unread_count + ' unread');
        top.appendChild(dot);
      } else {
        top.appendChild(element('span', 'conversation-when', shortWhen(conversation.last_message_at)));
      }
      button.appendChild(top);

      button.appendChild(element('span', 'conversation-preview', conversation.last_message || 'No messages yet'));
      button.appendChild(element('span', 'conversation-when',
        [conversation.party_role, conversation.context_ref].filter(Boolean).join(' · ')));

      button.addEventListener('click', function () {
        selectConversation(conversation);
        highlight(conversation.conversation_id);
        // On a phone the thread is below the list; bring it into view.
        if (window.matchMedia('(max-width: 1023px)').matches && threadCard) {
          threadCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      return button;
    }

    function highlight(conversationId) {
      conversationList.querySelectorAll('.conversation').forEach(function (other) {
        other.classList.toggle('is-active', other.dataset.conversationId === conversationId);
      });
    }

    /** Once a thread has been read, swap its unread count for the time, without refetching. */
    function markListRead(conversation) {
      var button = conversationList.querySelector('.conversation[data-conversation-id="' + conversation.conversation_id + '"]');
      if (!button) return;
      var dot = button.querySelector('.unread-dot');
      if (dot) dot.replaceWith(element('span', 'conversation-when', shortWhen(conversation.last_message_at)));
    }

    // ---------- Thread ----------
    function selectConversation(conversation) {
      activeConversation = conversation;
      threadPage = 1;

      threadName.textContent = conversation.party_name;
      threadMeta.textContent = [conversation.party_role, conversation.context_ref].filter(Boolean).join(' · ');
      threadAvatar.textContent = initials(conversation.party_name);

      composerInput.disabled = false;
      composerSend.disabled = false;
      composerError.hidden = true;

      // Replying is always allowed; say so when this person's role is one
      // you could not have messaged first (e.g. an admin who contacted you).
      if (composerHint) {
        composerHint.hidden = conversation.can_start !== false;
        if (!composerHint.hidden) {
          composerHint.lastChild.textContent = conversation.party_role +
            ' accounts start these conversations with you. You can reply here any time.';
        }
      }

      thread.textContent = '';
      thread.appendChild(element('p', 'list-state', 'Loading…'));
      loadThreadPage(1, true).then(function () {
        markListRead(conversation);
        refreshBadges();
      });
    }

    function loadThreadPage(page, replace) {
      var conversationId = activeConversation.conversation_id;
      return Inbox.messages(conversationId, { page: page, per_page: 12 }).then(function (res) {
        // The user may have opened another conversation while this loaded.
        if (!activeConversation || activeConversation.conversation_id !== conversationId) return;
        if (replace) thread.textContent = '';

        if (!res.ok) {
          thread.appendChild(element('p', 'list-state list-state--error', res.error));
          return;
        }

        threadPage = res.data.page;
        threadTotalPages = res.data.total_pages;

        if (!res.data.items.length && replace) {
          thread.appendChild(element('p', 'list-state', 'No messages yet. Say hello.'));
        }

        // Newest first from the source; the thread reads oldest to newest, so
        // each batch is reversed. A later page is older, so it goes on top.
        var bubbles = res.data.items.slice().reverse().map(messageBubble);
        if (replace) {
          bubbles.forEach(function (bubble) { thread.appendChild(bubble); });
          thread.scrollTop = thread.scrollHeight;
        } else {
          var previousHeight = thread.scrollHeight;
          bubbles.reverse().forEach(function (bubble) { thread.insertBefore(bubble, thread.firstChild); });
          thread.scrollTop = thread.scrollHeight - previousHeight;
        }

        loadEarlierBtn.hidden = threadPage >= threadTotalPages;
      });
    }

    function messageBubble(message) {
      var bubble = element('div', 'bubble bubble--' + (message.sender === 'me' ? 'me' : 'them'));
      bubble.appendChild(document.createTextNode(message.body));
      bubble.appendChild(element('span', 'bubble-when', dateTime(message.sent_at)));
      return bubble;
    }

    loadEarlierBtn.addEventListener('click', function () {
      if (!activeConversation || threadPage >= threadTotalPages) return;
      loadEarlierBtn.disabled = true;
      loadThreadPage(threadPage + 1, false).then(function () {
        loadEarlierBtn.disabled = false;
      });
    });

    // ---------- Composer ----------
    function sendMessage() {
      if (!activeConversation) return;

      var body = composerInput.value.trim();
      composerError.hidden = true;
      if (body === '') {
        composerError.textContent = 'Write a message first.';
        composerError.hidden = false;
        return;
      }
      composerSend.disabled = true;

      Inbox.send(activeConversation.conversation_id, body).then(function (res) {
        composerSend.disabled = false;
        if (!res.ok) {
          composerError.textContent = res.error;
          composerError.hidden = false;
          return;
        }
        var placeholder = thread.querySelector('.list-state');
        if (placeholder) placeholder.remove();
        thread.appendChild(messageBubble(res.data));
        thread.scrollTop = thread.scrollHeight;
        composerInput.value = '';
        composerInput.focus();
        // The conversation now has the newest activity, so it moves to the top.
        if (list) list.reset();
      });
    }

    composerForm.addEventListener('submit', function (event) {
      event.preventDefault();
      sendMessage();
    });

    // Enter sends; Shift+Enter starts a new line.
    composerInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendMessage();
      }
    });

    /** Shows a conversation that was just started or reused, at the top of an unfiltered list. */
    function openStarted(conversation) {
      selectConversation(conversation);
      if (!list) return;
      if (conversationSearch.value !== '') {
        conversationSearch.value = '';
        conversationSearch.dispatchEvent(new Event('input'));
      } else {
        list.reset();
      }
      if (threadCard && window.matchMedia('(max-width: 1023px)').matches) {
        threadCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // ---------- New message dialog ----------
    var modal = document.getElementById('newMessageModal');
    var roleChips = document.getElementById('roleChips');
    var peopleList = null;

    function openModal() {
      modal.classList.add('is-open');
      var search = document.getElementById('peopleSearch');
      if (!peopleList) {
        buildChips();
        peopleList = EquipifyList.create({
          source: Inbox.people,
          container: document.getElementById('peopleList'),
          searchInput: search,
          pager: document.getElementById('peoplePager'),
          perPage: 6,
          extraParams: { role: '' },
          emptyMessage: 'Nobody matches that search.',
          renderItem: personRow
        });
      } else {
        peopleList.reload();
      }
      search.focus();
    }

    function closeModal() {
      modal.classList.remove('is-open');
      document.getElementById('newMessageBtn').focus();
    }

    function buildChips() {
      var roles = Inbox.allowedRoles();
      var options = [{ value: '', label: 'Everyone' }].concat(roles.map(function (key) {
        return { value: key, label: Inbox.ROLE_LABELS[key] };
      }));
      options.forEach(function (option, index) {
        var chip = element('button', 'chip' + (index === 0 ? ' is-active' : ''), option.label);
        chip.type = 'button';
        chip.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
        chip.addEventListener('click', function () {
          roleChips.querySelectorAll('.chip').forEach(function (other) {
            var on = other === chip;
            other.classList.toggle('is-active', on);
            other.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          peopleList.setParam('role', option.value);
        });
        roleChips.appendChild(chip);
      });
    }

    function personRow(person) {
      var row = element('button', 'person-row');
      row.type = 'button';

      var avatar = element('span', 'thread-avatar', initials(person.name));
      avatar.setAttribute('aria-hidden', 'true');
      row.appendChild(avatar);

      var main = element('span', 'person-main');
      main.appendChild(element('span', 'person-name', person.name));
      main.appendChild(element('span', 'person-detail',
        [person.role_label, person.detail].filter(Boolean).join(' · ')));
      row.appendChild(main);

      row.appendChild(element('span', 'person-action', person.conversation_id ? 'Open chat' : 'Message'));

      row.addEventListener('click', function () {
        row.disabled = true;
        Inbox.start(person.person_id).then(function (res) {
          row.disabled = false;
          if (!res.ok) {
            toast(res.error);
            return;
          }
          closeModal();
          openStarted(res.data);
          composerInput.focus();
        });
      });
      return row;
    }

    document.getElementById('newMessageBtn').addEventListener('click', openModal);
    modal.querySelectorAll('[data-modal-close]').forEach(function (button) {
      button.addEventListener('click', closeModal);
    });
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });

    // ---------- Deep link: ?to=<name>&role=<role>&about=<ref> ----------
    function openDeepLink() {
      var params = new URLSearchParams(window.location.search);
      var name = params.get('to');
      var role = params.get('role');
      if (!name || !role) return Promise.resolve(null);

      // Don't reopen it on a refresh.
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      return Inbox.findPerson(name, role).then(function (res) {
        if (!res.ok) {
          toast(res.error);
          return null;
        }
        return Inbox.start(res.data.person_id, params.get('about') || '').then(function (started) {
          if (!started.ok) {
            toast(started.error);
            return null;
          }
          return started.data;
        });
      });
    }

    // ---------- Start ----------
    openDeepLink().then(function (linked) {
      if (linked) selectConversation(linked);

      list = EquipifyList.create({
        source: Inbox.conversations,
        container: conversationList,
        searchInput: conversationSearch,
        pager: document.getElementById('conversationPager'),
        perPage: 8,
        emptyMessage: 'No conversations to show. Use "New message" to start one.',
        renderItem: conversationButton,
        onLoad: function (data) {
          // Open the first conversation automatically, but never pull the
          // user away from one they are already reading.
          if (activeConversation === null && data.items.length) {
            selectConversation(data.items[0]);
            highlight(data.items[0].conversation_id);
          }
        }
      });

      if (linked) composerInput.focus();
    });
  }

  window.EquipifyMessages = { init: init };
})();
