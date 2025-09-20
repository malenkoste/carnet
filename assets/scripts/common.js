// common.js - shared utilities (contact form, slideshow, contact UI detection, mobile zoom block, landscape lock)
(function(global){
  'use strict';
  function isInContactUI(target){
    const entries=[
      {id:'contact-button',always:true},
      {id:'contact-form-popover',visible:true},
      {id:'contact-form',visible:true},
      {id:'contact-form-status',visible:true},
      {id:'close-contact-form',visible:true},
  // Credits overlay / button elements treated as protected UI regions too
  {id:'credits-button',always:true},
  {id:'credits-overlay',visible:true},
  {id:'close-credits',visible:true},
    ];
    for(const e of entries){
      const el=document.getElementById(e.id); if(!el) continue;
      if(e.visible && !(el.offsetParent!==null || el.style.display==='block')) continue;
      if(target===el || (el.contains && el.contains(target))) return true;
    }
    return false;
  }
  global.isInContactUI = isInContactUI;

  // Contact popover open via button
  function initContactButton(){
    const btn=document.getElementById('contact-button'); if(!btn) return;
    const openForm=e=>{ if(e){ e.stopPropagation(); if(e.type==='touchend') e.preventDefault(); }
      try{ global.contactFormController && global.contactFormController.open(); }catch(_){ }
    };
    btn.addEventListener('click',openForm);
    btn.addEventListener('touchend',openForm,{passive:false});
  }

  // Contact form popover and submission (shared) - only initialize once
  function initContactForm(){
    if(global._contactFormInitialized) return; // guard
    const formPop=document.getElementById('contact-form-popover');
    const statusEl=document.getElementById('contact-form-status');
    const form=document.getElementById('contact-form');
    if(!formPop||!form||!statusEl) return;
    const closeBtn=document.getElementById('close-contact-form');
    const openBtn=document.getElementById('open-contact-form');
    const mobileOverlay=document.getElementById('mobile-touch-area');
    function position(){
      try{
        const btn=document.getElementById('contact-button'); if(!btn||formPop.style.display!=='block') return;
        const rect=btn.getBoundingClientRect(); const margin=10, gap=8;
        let popW=formPop.offsetWidth||Math.min(window.innerWidth*0.9,320);
        let popH=formPop.offsetHeight||220;
        let left=rect.left+rect.width/2-popW/2;
        const spaceBelow=window.innerHeight-rect.bottom-gap; const spaceAbove=rect.top-gap;
        let top=(spaceBelow>=popH||spaceBelow>=spaceAbove)?(rect.bottom+gap):(rect.top-gap-popH);
        left=Math.max(margin,Math.min(window.innerWidth-popW-margin,left));
        top=Math.max(margin,Math.min(window.innerHeight-popH-margin,top));
        formPop.style.left=left+'px'; formPop.style.top=top+'px'; formPop.style.transform='none';
      }catch(e){}
    }
    function close(){ formPop.style.display='none'; try{ if(document.activeElement && formPop.contains(document.activeElement)) document.activeElement.blur(); }catch(_){ } if(mobileOverlay) mobileOverlay.style.display=''; }
    function open(){ formPop.style.display='block'; statusEl.textContent=''; if(mobileOverlay) mobileOverlay.style.display='none'; position(); }
    global.contactFormController={open,close,toggle(){if(formPop.style.display==='block')close(); else open();},isOpen(){return formPop.style.display==='block';}};
    openBtn&&openBtn.addEventListener('click',e=>{e.stopPropagation();open();});
    closeBtn&&closeBtn.addEventListener('click',e=>{e.stopPropagation();close();});
    document.addEventListener('pointerdown',e=>{ if(formPop.style.display==='block'&&!formPop.contains(e.target)&&e.target!==openBtn) close(); });
    window.addEventListener('resize',position); window.addEventListener('orientationchange',position);
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') close(); });
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const submitBtn=form.querySelector('button[type="submit"]');
      if(submitBtn){submitBtn.disabled=true;submitBtn.setAttribute('aria-busy','true');}
      statusEl.textContent='Sending…';
      const fd=new FormData(form);
      const endpoint=formPop.getAttribute('data-endpoint');
      const emailFallback='ezrasilva@proton.me';
      const message=(fd.get('message')||'').toString().trim();
      if(!message){ statusEl.textContent='Please write a message.'; const ta=form.querySelector('textarea[name="message"]'); ta&&ta.focus(); if(submitBtn){submitBtn.disabled=false;submitBtn.removeAttribute('aria-busy');} return; }
      async function sendViaFormspree(){ const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000); try{ fd.append('_subject','Portfolio message'); fd.append('_origin',window.location.href); const res=await fetch(endpoint,{method:'POST',body:fd,headers:{'Accept':'application/json'},signal:controller.signal}); clearTimeout(timer); return res.ok; }catch(_){ clearTimeout(timer); return false; }}
      function sendViaMailto(){ const subject=encodeURIComponent('Portfolio message'); const body=encodeURIComponent(`${message}\n\nFrom: ${window.location.href}`); const href=`mailto:${emailFallback}?subject=${subject}&body=${body}`; const a=document.createElement('a'); a.href=href; a.style.display='none'; document.body.appendChild(a); try{a.click();}catch(_){ try{window.location.href=href;}catch(__){}} setTimeout(()=>{ try{document.body.removeChild(a);}catch(_){ }},100); statusEl.textContent='Opening mail client…'; }
      let ok=false; const isLocal=location.protocol==='file:'; if(endpoint&&!isLocal){ ok=await sendViaFormspree(); }
      if(ok){ statusEl.textContent='Sent! Thank you.'; form.reset(); setTimeout(()=>{ try{ global.contactFormController&&global.contactFormController.close(); }catch(_){ } },600); }
      else { statusEl.textContent='Could not send via form. Using email client…'; sendViaMailto(); setTimeout(()=>{ try{ global.contactFormController&&global.contactFormController.close(); }catch(_){ } },1200); }
      if(submitBtn){submitBtn.disabled=false;submitBtn.removeAttribute('aria-busy');}
    });
    global._contactFormInitialized=true;
  }

  // Background slideshow (shared) - expects two .bg-frame elements inside #background-slideshow
  function initBackgroundSlideshow(){
    if(global._slideshowInitialized) return; global._slideshowInitialized=true;
    const root=document.getElementById('background-slideshow'); if(!root) return;
    const frames=Array.from(root.querySelectorAll('.bg-frame')); if(frames.length<2) return;
    const bases=['Background','background']; const exts=['png','jpg','jpeg','webp','avif']; const candidates=[]; function pushCandidate(p){ if(candidates.length<100) candidates.push(p); }
    for(const base of bases){ for(const ext of exts){ pushCandidate(`assets/images/${base}.${ext}`); }}
    outer: for(let i=1;i<=20;i++){ for(const base of bases){ for(const ext of exts){ pushCandidate(`assets/images/${base}${i}.${ext}`); if(candidates.length>=100) break outer; } } }
    function preload(url){ return new Promise(r=>{ const i=new Image(); i.onload=()=>r(url); i.onerror=()=>r(null); i.src=url; }); }
    function naturalKey(s){ const m=s.match(/([^\\/]*?)(\d+)?\.(png|jpg|jpeg|webp|avif)$/i); if(!m) return {name:s.toLowerCase(),num:Infinity}; return {name:m[1].toLowerCase(), num:m[2]?parseInt(m[2],10):0}; }
    (async function(){ const probed=await Promise.all(candidates.map(preload)); let existing=probed.filter(Boolean); if(!existing.length){ const bg=getComputedStyle(document.body).backgroundImage; const urlMatch=bg&&bg.match(/url\("?(.*?)"?\)/); if(urlMatch&&urlMatch[1]) existing.push(urlMatch[1]); }
      if(existing.length===0) return; existing.sort((a,b)=>{ const ka=naturalKey(a),kb=naturalKey(b); return ka.name===kb.name?ka.num-kb.num:(ka.name<kb.name?-1:1); });
      const preloadCss=existing.map(u=>new Promise(res=>{ const i=new Image(); i.onload=i.onerror=()=>res(); i.src=u; }));
      Promise.allSettled(preloadCss).then(()=>{ let idx=0; let active=0; function setFrame(el,u){ el.style.backgroundImage=`url('${u}')`; }
        setFrame(frames[active],existing[idx]); frames[active].classList.add('active'); if(existing.length<2) return;
        function step(){ idx=(idx+1)%existing.length; const next=1-active; setFrame(frames[next],existing[idx]); frames[next].classList.add('active'); frames[active].classList.remove('active'); active=next; }
        setInterval(step,8000); }); })();
  }

  function blockMobileZoom(){
    if(global._zoomBlocked) return; global._zoomBlocked=true;
    const isTouch='ontouchstart'in window||navigator.maxTouchPoints>0; if(!isTouch) return;
    let last=0; document.addEventListener('touchstart',e=>{ if(e.touches.length>1) e.preventDefault(); },{passive:false});
    document.addEventListener('touchend',e=>{ const now=Date.now(); if(now-last<=300) e.preventDefault(); last=now; },{passive:false});
    document.addEventListener('gesturestart',e=>{ e.preventDefault(); });
  }

  // Unified init (call from each page after DOM ready)
  global.CommonInit={ init(){ initContactButton(); initContactForm(); initBackgroundSlideshow(); blockMobileZoom(); }};
  // Optional animated custom cursor (extracted from main.js) for desktop
  function initCustomCursor(){
    if(global._customCursorInitialized) return; global._customCursorInitialized=true;
    const prefersCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; if(prefersCoarse) return;
    const cursorEl=document.getElementById('custom-cursor'); if(!cursorEl) return;
    const frameUrls=[1,2,3,4,5,6,7,8].map(i=>`assets/cursors/cursor${i}.png`);
    let loaded=0; let ready=false; let frameIndex=0; const hotspotX=32, hotspotY=0; const frameInterval=60; let timerId=null; let paused=false;
    function start(){ if(ready) return; ready=true; document.body.classList.add('cursor-hidden'); cursorEl.classList.add('animating'); animate(); }
    function animate(){ if(paused) return; cursorEl.style.backgroundImage=`url('${frameUrls[frameIndex]}')`; frameIndex=(frameIndex+1)%frameUrls.length; timerId=setTimeout(animate,frameInterval); }
    frameUrls.forEach(u=>{ const img=new Image(); img.onload=done; img.onerror=done; img.src=u; function done(){ if(++loaded===frameUrls.length){ start(); } }});
    window.addEventListener('pointermove',e=>{ if(!ready) return; cursorEl.style.transform=`translate3d(${e.clientX-hotspotX}px,${e.clientY-hotspotY}px,0)`; },{passive:true});
    setTimeout(()=>{ if(!ready) start(); },1200);
    global.cursorController={ pause(){ paused=true; if(timerId){ clearTimeout(timerId); timerId=null; } }, resume(){ if(!ready) return; if(!paused) return; paused=false; if(!timerId) animate(); }, isPaused(){ return paused; } };
  }
  // Extend CommonInit to include cursor
  const prevInit = global.CommonInit.init;
  global.CommonInit.init = function(){ prevInit(); initCustomCursor(); };

  // ===================== CREDITS OVERLAY =====================
  function initCredits(){
    if(global._creditsInit) return; global._creditsInit=true;
    const btn=document.getElementById('credits-button');
    const overlay=document.getElementById('credits-overlay');
    if(!btn || !overlay) return; // nothing to do
  const inner=overlay.querySelector('.credits-scroll');
  const content=overlay.querySelector('.credits-content');
    const externalHolder = overlay.querySelector('[data-external-credits]');
  // Load external credits file (static content now)
  let contentReady=false;
    (async function loadExternal(){
      if(!externalHolder) return;
      try{
        const res = await fetch('assets/credits/credits.html',{cache:'no-store'});
        if(res.ok){
          const html = await res.text();
          externalHolder.innerHTML = html;
          const yearSpan = externalHolder.querySelector('[data-year]');
          if(yearSpan) yearSpan.textContent = new Date().getFullYear();
          // Previously used for scrolling restructure; now left flat/static
        } else {
          externalHolder.innerHTML = '<p>Credits unavailable.</p>';
        }
      }catch(_){ externalHolder.innerHTML = '<p>Credits unavailable.</p>'; }
      contentReady=true;
    })();
    const closeBtn=overlay.querySelector('#close-credits');
    function open(){ overlay.style.display='flex'; overlay.setAttribute('aria-hidden','false'); }
    function close(){ overlay.style.display='none'; overlay.setAttribute('aria-hidden','true'); }
    btn.addEventListener('click',e=>{ e.stopPropagation(); if(overlay.style.display==='flex') close(); else open(); });
    btn.addEventListener('touchend',e=>{ e.stopPropagation(); e.preventDefault(); if(overlay.style.display==='flex') close(); else open(); },{passive:false});
    closeBtn && closeBtn.addEventListener('click',e=>{ e.stopPropagation(); close(); });
    document.addEventListener('pointerdown',e=>{ if(!overlay || overlay.style.display!=='flex') return; if(overlay===e.target) close(); });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape' && overlay.style.display==='flex') close(); });
    // Pause auto-scroll when user hovers / touches inside (desktop accessibility)
  // Removed hover pause so scrolling always continues while open
    // Mobile touch drag to scroll manually; we don't implement custom inertia, just allow default scroll on inner
    // Provide public controller if needed elsewhere
  global.creditsController={ open, close, isOpen:()=>overlay.style.display==='flex' };
  }
  // Extend again to include credits
  const prevInit2 = global.CommonInit.init;
  global.CommonInit.init = function(){ prevInit2(); initCredits(); };
})(window);
