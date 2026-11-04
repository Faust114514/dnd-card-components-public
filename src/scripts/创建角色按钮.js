(() => {
  const SCRIPT_ID='e2a5bb3c-baa2-47dd-a306-494339a4b5fb';
  const NS='__dndCreatorButton_v1';
  const hosts=[window.top,window.parent,window];
  const host=hosts.find(w=>{try{return !!w.document?.body;}catch{return false;}})||window;
  const doc=host.document;
  host[NS]?.dispose?.();
  const state={modal:null,frame:null,bridge:null,chat:null,character:null,html:'',previousFocus:null,overflow:null};
  host[NS]=state;
  function context() {
    for(const w of [window,window.parent,host])try{const c=w.SillyTavern?.getContext?.();if(c)return c;}catch{}
    throw new Error('未找到酒馆上下文，请先打开角色聊天。');
  }
  function creatorHtml(ctx) {
    const scripts=ctx.characters?.[ctx.characterId]?.data?.extensions?.regex_scripts||[];
    const target=scripts.find(s=>s.id==='b179c655-147d-4572-a6ea-1c0326363009'&&!s.disabled)
      ||scripts.find(s=>['创建角色','初始化-WebView人类专长修复','初始化'].includes(s.scriptName)&&!s.disabled);
    if(!target?.replaceString)throw new Error('当前角色没有启用的创建角色正则。请同时导入新版创建面板。');
    return target.replaceString.replace(/^\s*```(?:html)?\s*/i,'').replace(/\s*```\s*$/,'').trim();
  }
  function assertChat() {
    const ctx=context();
    if(ctx.characterId!==state.character || ctx.chat!==state.chat)throw new Error('聊天已切换，请关闭并重新打开创建角色面板；未写入其他聊天。');
    return ctx;
  }
  function apiBridge() {
    const owner=context();
    const ownerChat=owner.chat, ownerCharacter=owner.characterId;
    const currentMessageId=()=>{check();return Array.isArray(ownerChat)?ownerChat.length-1:-1;};
    const check=()=>{const ctx=context();if(ctx.chat!==ownerChat||ctx.characterId!==ownerCharacter)throw new Error('聊天已切换，请重新打开创建面板；未写入其他聊天。');return ctx;};
    const bindings={
      getVariables:typeof getVariables==='function'?getVariables:window.getVariables,
      insertOrAssignVariables:typeof insertOrAssignVariables==='function'?insertOrAssignVariables:window.insertOrAssignVariables,
      replaceVariables:typeof replaceVariables==='function'?replaceVariables:window.replaceVariables,
      getTavernHelperVersion:typeof getTavernHelperVersion==='function'?getTavernHelperVersion:window.getTavernHelperVersion,
    };
    const bridge={};
    for(const [key,fn] of Object.entries(bindings))if(typeof fn==='function')bridge[key]=(...args)=>{
      check();
      if(['getVariables','insertOrAssignVariables','replaceVariables'].includes(key)) {
        const index=key==='getVariables'?0:1;
        if(args[index]?.type==='message') {
          const messageId=args[index].message_id ?? currentMessageId();
          if(messageId<0)throw new Error('当前聊天尚无消息，请先建立聊天再保存角色。');
          args[index]={...args[index],message_id:messageId};
        }
      }
      return fn(...args);
    };
    bridge.getCurrentMessageId=()=>{
      check();
      const messageId=currentMessageId();
      if(messageId<0)throw new Error('当前聊天尚无消息，请先建立聊天再保存角色。');
      return messageId;
    };
    bridge.closeCreator=()=>{check();close();};
    bridge.restartCreator=()=>{check();state.frame.srcdoc=inject(creatorHtml(context()));};
    for(const key of ['getVariables','insertOrAssignVariables','replaceVariables','getTavernHelperVersion'])if(!bridge[key])throw new Error(`酒馆助手缺少 ${key} 接口，请启用或更新酒馆助手。`);
    return bridge;
  }
  function inject(html) {
    const script='<script>(()=>{const bridge=parent.'+NS+'.bridge;for(const key of Object.keys(bridge))window[key]=(...args)=>bridge[key](...args);window.SillyTavern=parent.SillyTavern;})();</scr'+'ipt>';
    return /<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,m=>m+script):script+html;
  }
  function close() {
    if(!state.modal)return;
    state.modal.close();
    state.modal.style.display='none';
    if(state.overflow){doc.documentElement.style.overflow=state.overflow.root;doc.body.style.overflow=state.overflow.body;state.overflow=null;}
    state.previousFocus?.focus?.();
  }
  function fitViewport(){
    if(!state.modal?.open)return;
    const viewport=host.visualViewport;
    if(!viewport)return;
    Object.assign(state.modal.style,{top:viewport.offsetTop+'px',left:viewport.offsetLeft+'px',width:viewport.width+'px',height:viewport.height+'px',right:'auto',bottom:'auto'});
  }
  host.visualViewport?.addEventListener('resize',fitViewport);
  host.visualViewport?.addEventListener('scroll',fitViewport);
  function ensureModal() {
    if(state.modal)return;
    const overlay=doc.createElement('dialog');
    overlay.id='dnd-creator-dialog';
    overlay.style.cssText='position:fixed;inset:0;z-index:10060;background:#080b12cc;display:none;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;margin:0;border:0;width:100%;max-width:none;height:100dvh;max-height:none;color-scheme:dark;';
    overlay.innerHTML='<style>#dnd-creator-dialog::backdrop{background:#080b12cc}#dnd-creator-dialog>section{min-height:0}#dnd-creator-dialog header{flex-shrink:0;border-bottom:1px solid #c5a36333;background:#20232b}#dnd-creator-dialog header strong{font:600 17px Georgia,"Noto Serif SC",serif;color:#e6ca8f}#dnd-creator-dialog header button{min-height:40px;padding:8px 12px;border:1px solid #c5a36344;border-radius:8px;background:#272b34;color:#e8dfcc;font-size:13px;box-shadow:none;text-shadow:none}#dnd-creator-dialog iframe{display:block;height:100%;flex:1 1 0!important;min-height:0!important}@media(max-width:760px){#dnd-creator-dialog{padding:0!important}#dnd-creator-dialog>section{width:100%!important;height:100%!important;border:0!important;border-radius:0!important}#dnd-creator-dialog header{padding:calc(8px + env(safe-area-inset-top)) 12px 8px!important;gap:8px!important}#dnd-creator-dialog header button{min-height:44px}}</style><section role="dialog" aria-modal="true" aria-label="创建角色" style="display:flex;flex-direction:column;width:min(1440px,100%);height:calc(100dvh - 20px);background:#151922;border:1px solid #3b4658;border-radius:12px;overflow:hidden"><header style="display:flex;align-items:center;gap:12px;padding:10px 14px;color:#eee"><strong style="flex:1">创建角色</strong><button type="button" data-action="restart">重新开始</button><button type="button" data-action="close">关闭</button></header><iframe title="D&D 2024 创建角色" style="border:0;flex:1;width:100%;min-height:0;background:#111"></iframe></section>';
    overlay.querySelector('[data-action="close"]').addEventListener('click',close);
    overlay.querySelector('[data-action="restart"]').addEventListener('click',()=>{
      if(!host.confirm('重新开始会丢弃面板内尚未提交的填写，不影响已保存角色。继续吗？'))return;
      try{assertChat();state.frame.srcdoc=inject(creatorHtml(context()));}catch(e){host.alert(e.message);}
    });
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.addEventListener('cancel',e=>{e.preventDefault();close();});
    doc.body.appendChild(overlay);
    state.modal=overlay;state.frame=overlay.querySelector('iframe');
  }
  function open() {
    try {
      const ctx=context();
      const html=creatorHtml(ctx);
      const same=state.chat===ctx.chat&&state.character===ctx.characterId&&state.html===html;
      state.chat=ctx.chat;state.character=ctx.characterId;
      state.bridge=apiBridge();
      ensureModal();
      if(!same){state.html=html;state.frame.srcdoc=inject(html);}
      if(state.modal.style.display!=='flex') {
        state.previousFocus=doc.activeElement;
        state.overflow={root:doc.documentElement.style.overflow,body:doc.body.style.overflow};
        doc.documentElement.style.overflow='hidden';doc.body.style.overflow='hidden';
      }
      state.modal.style.display='flex';
      if(!state.modal.open)state.modal.showModal();
      fitViewport();
      state.modal.querySelector('[data-action="close"]').focus();
      return true;
    }catch(error){console.error('[创建角色按钮]',error);host.alert(error.message);return false;}
  }
  function onClick(event) {
    const button=event.target?.closest?.('.qr--button, .menu_button, .interactable, [role="button"], button');
    if(!button||button.textContent?.trim()!=='创建角色')return;
    const frameId=String(window.frameElement?.id||window.frameElement?.name||'').split('--').pop();
    const container=doc.getElementById('script_container_'+(frameId||SCRIPT_ID));
    if(!container?.contains(button))return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
    open();
  }
  function onKey(event){if(event.key==='Escape'&&state.modal?.style.display==='flex')close();}
  function dispose(){host.visualViewport?.removeEventListener('resize',fitViewport);host.visualViewport?.removeEventListener('scroll',fitViewport);close();state.modal?.remove();doc.removeEventListener('click',onClick,true);doc.removeEventListener('keydown',onKey,true);if(host[NS]===state)delete host[NS];}
   state.dispose=dispose;state.open=open;
  doc.addEventListener('click',onClick,true);
  doc.addEventListener('keydown',onKey,true);
  window.addEventListener('pagehide',dispose,{once:true});
})();
