// Target: the installed Tavern Helper 4.12.0 message recovery event.
// Display-only: never edits messages, variables, regexes or host settings.
(() => {
  const doc = window.parent.document;
  const chat = doc.getElementById('chat');
  if (!chat || typeof eventEmit !== 'function' || typeof builtin === 'undefined' ||
      typeof builtin.duringGenerating !== 'function') {
    console.warn('[DND 状态栏恢复] 缺少聊天容器或酒馆助手接口，未启动。');
    return;
  }

  const attempted = new WeakSet();
  let timer;
  let stopped = false;

  async function recover() {
    if (stopped || builtin.duringGenerating() || doc.getElementById('curEditTextarea')) return;
    const message = chat.querySelector('.mes.last_mes');
    if (!message || message.getAttribute('is_user') === 'true' ||
        message.querySelector('.TH-streaming, .mes_streaming')) return;
    const messageId = Number(message.getAttribute('mesid'));
    if (!Number.isInteger(messageId) || messageId < 0) return;

    for (const pre of message.querySelectorAll('.mes_text pre')) {
      const code = pre.textContent;
      if (!code.includes('id="collapse-toggle-btn"') || !code.includes('DND_EFFECT_PRESETS')) continue;
      const wrapper = pre.closest('.TH-render');
      if (wrapper?.querySelector('iframe') || attempted.has(pre)) continue;
      // One request per stranded code node; a failed renderer must not cause a loop.
      attempted.add(pre);
      try {
        await eventEmit('TH_REQUEST_RENDER_MESSAGE', messageId);
      } catch (error) {
        console.warn('[DND 状态栏恢复] 请求重绘失败，可原样保存消息恢复。', error);
      }
      break;
    }
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    // Let the host and Vue finish their normal render before checking for a leftover code block.
    timer = setTimeout(recover, 150);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(chat, { childList: true, subtree: true });
  const ended = eventOn(tavern_events.GENERATION_ENDED, schedule);
  const cancelled = eventOn(tavern_events.GENERATION_STOPPED, schedule);
  window.addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
    ended.stop();
    cancelled.stop();
  }, { once: true });
  schedule();
})();
