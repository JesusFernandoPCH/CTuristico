// Concierge chat: talks to the Worker in chatbot/ and moves the tour when the answer points somewhere.
'use strict';

(function() {
  var toggle = document.querySelector('#chatToggle');
  var panel = document.querySelector('#chat');
  var log = panel.querySelector('.chat-log');
  var suggestions = panel.querySelector('.chat-suggestions');
  var form = panel.querySelector('.chat-form');
  var input = form.querySelector('input');
  var submit = form.querySelector('button');

  // Production endpoint comes from <meta name="chat-endpoint">; local pages talk to `wrangler dev`.
  var meta = document.querySelector('meta[name="chat-endpoint"]');
  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var endpoint = (meta && meta.content) || (isLocal ? 'http://127.0.0.1:8787/chat' : '');
  if (!endpoint) {
    toggle.hidden = true;
    return;
  }

  var history = [];
  var busy = false;

  function addMessage(kind, text) {
    var item = document.createElement('li');
    item.className = 'chat-msg chat-msg-' + kind;
    item.textContent = text;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
    return item;
  }

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      input.focus();
    }
  }

  function send(text) {
    text = text.trim();
    if (!text || busy) {
      return;
    }
    busy = true;
    submit.disabled = true;
    suggestions.hidden = true;
    addMessage('user', text);
    history.push({ role: 'user', content: text });
    var pending = addMessage('assistant', 'Escribiendo…');
    pending.classList.add('is-pending');

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-12), sceneId: window.tour.currentSceneId() })
    })
      .then(function(res) {
        return res.json().catch(function() { return {}; }).then(function(data) {
          if (!res.ok) {
            throw new Error(data.error || 'No pude responder. Inténtalo de nuevo.');
          }
          return data;
        });
      })
      .then(function(data) {
        pending.textContent = data.reply;
        pending.classList.remove('is-pending');
        history.push({ role: 'assistant', content: data.reply });
        if (data.action && data.action.type === 'goto') {
          window.tour.goTo(data.action.sceneId);
        }
      })
      .catch(function(err) {
        pending.textContent = err instanceof TypeError ? 'No hay conexión con el asistente. Inténtalo de nuevo.' : err.message;
        pending.className = 'chat-msg chat-msg-error';
        // Drop the unanswered question so the next request still ends with a single user turn.
        history.pop();
      })
      .then(function() {
        busy = false;
        submit.disabled = false;
        input.focus();
      });
  }

  toggle.addEventListener('click', function() {
    setOpen(panel.hidden);
  });
  panel.querySelector('.panel-close').addEventListener('click', function() {
    setOpen(false);
    toggle.focus();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !e.defaultPrevented && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  suggestions.addEventListener('click', function(e) {
    var chip = e.target.closest('button');
    if (chip) {
      send(chip.textContent);
    }
  });
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var text = input.value;
    input.value = '';
    send(text);
  });
})();
