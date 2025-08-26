// Direct-entry portfolio version (no Unity). Uses transition video as loader until first artwork is ready.

let currentArtworkName='';
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints && navigator.maxTouchPoints>2) || window.innerWidth<=768;

// Basic audio (no Unity context)
const audioSystem={backgroundAudio:null,clickAudio:null,audioInitialized:false,_retryTimer:null,async init(){try{if(this.audioInitialized) return; this.backgroundAudio=new Audio('assets/audio/background.mp3');this.backgroundAudio.loop=true;this.backgroundAudio.volume=0.35;this.clickAudio=new Audio('assets/audio/click.mp3');this.clickAudio.volume=0.198;this.audioInitialized=true;}catch(e){}},async startBackgroundMusic(){if(!this.audioInitialized) return; if(!this.backgroundAudio) return; try{await this.backgroundAudio.play(); clearTimeout(this._retryTimer);}catch(e){ // autoplay blocked, retry soon
			clearTimeout(this._retryTimer);
			this._retryTimer=setTimeout(()=>this.startBackgroundMusic(),1200);
		}},playClickSound(){if(this.clickAudio&&this.audioInitialized){try{this.clickAudio.currentTime=0;const p=this.clickAudio.play();if(p)p.catch(()=>{});}catch(e){}}}};
function initializeAllAudio(){audioSystem.init(); audioSystem.startBackgroundMusic();}
['click','keydown','touchstart'].forEach(evt=>document.addEventListener(evt,initializeAllAudio,{once:true}));

const titleManager={getTitleForArtwork(i,record){return record?.title || `ARTWORK ${i}`;},getMeta(record){return record?.meta||'';}};
const artworkTitle={titleEl:null,metaEl:null,init(){this.titleEl=document.getElementById('artwork-title');this.metaEl=document.getElementById('artwork-meta');},update(record){if(!record)return; if(this.titleEl){
	// Title text
	this.titleEl.textContent=titleManager.getTitleForArtwork(record.index,record);
	// Optional full video link (only for entries with fullVideoUrl)
	if(record.fullVideoUrl){
		const br=document.createElement('br');
		const a=document.createElement('a');
		a.href=record.fullVideoUrl; a.target='_blank'; a.rel='noopener'; a.textContent=record.fullVideoLabel||'Full video';
		a.style.fontSize='0.6em'; a.style.letterSpacing='2px'; a.style.marginLeft='6px'; a.style.textDecoration='underline';
		// Wrap existing title and link in a container for layout without altering desktop CSS drastically
		const wrapper=document.createElement('span'); wrapper.textContent='';
		// Rebuild titleEl content
		const titleText=document.createElement('span'); titleText.textContent=titleManager.getTitleForArtwork(record.index,record);
		this.titleEl.textContent='';
		this.titleEl.appendChild(titleText);
		this.titleEl.appendChild(br);
		this.titleEl.appendChild(a);
	}
 }
 if(this.metaEl){const m=titleManager.getMeta(record); if(m){this.metaEl.textContent=m; this.metaEl.classList.remove('hidden');} else {this.metaEl.textContent=''; this.metaEl.classList.add('hidden');}}}};

const mobileTouch={touchArea:null,init(){this.touchArea=document.getElementById('mobile-touch-area');if(this.touchArea&&isMobile){this.setupTouchEvents();}},setupTouchEvents(){let touchStartTime=0;this.touchArea.addEventListener('touchstart',e=>{e.preventDefault();touchStartTime=Date.now();},{passive:false});this.touchArea.addEventListener('touchend',e=>{e.preventDefault();if(Date.now()-touchStartTime<1000){audioSystem.playClickSound();setTimeout(()=>artworkManager.showNextArtwork(),20);}},{passive:false});['contextmenu','touchmove'].forEach(evt=>this.touchArea.addEventListener(evt,e=>{e.preventDefault();},{passive:false}));}};

function getAdaptivePreloadCount(){const nav=navigator.connection||navigator.webkitConnection||navigator.mozConnection; if(!nav) return 4; const slow=['slow-2g','2g','3g']; if(slow.includes(nav.effectiveType)) return 2; if(nav.downlink && nav.downlink>10) return 8; return 4; }

const artworkManager={
	mediaFiles:[],currentIndex:0,isLoading:false,viewedArtworks:new Set(),cache:new Map(),preloadPromises:new Map(),
	PRELOAD_AHEAD:getAdaptivePreloadCount(),manifest:[],initialArtworkDisplayed:false,initialReadyMarked:false,initialArtworkInserted:false,
	initialPreloadTarget:0,loadedCount:0,
	async initFromManifest(){
		try{
			const res=await fetch('assets/scripts/artworks.json',{cache:'no-store'});
			this.manifest=await res.json();
			this.mediaFiles=this.manifest.map((m,idx)=>{
				const ext=m.file.split('.').pop();
				const type=['mp4','webm','mov'].includes(ext)?'video':'image';
				return { url:`assets/artwork/${m.file}`, type, name:m.file, index:idx+1, id:idx, meta:m };
			});
			if(this.mediaFiles.length){
				this.initialPreloadTarget=Math.min(this.PRELOAD_AHEAD+1,this.mediaFiles.length);
				this.preloadAround(this.currentIndex);
				await this.showInitialArtwork();
			}
		}catch(e){ console.warn('Manifest load failed',e); }
	},
	attemptReady(){
		if(!this.initialReadyMarked && this.initialArtworkDisplayed && this.loadedCount>=this.initialPreloadTarget){
			this.initialReadyMarked=true; portfolioLoader.markReady();
		}
	},
	_prepareIncoming(mediaFile, cacheIndex){
		let el=this.cache.get(cacheIndex);
		if(el){
			if(mediaFile.type==='image'){
				el=el.cloneNode(true); // clone image so CSS animation restarts
			} else {
				el.classList.remove('wavy-in','wavy-out');
			}
		} else {
			el=mediaFile.type==='video'?document.createElement('video'):document.createElement('img');
			el.src=mediaFile.url;
		}
		return el;
	},
	async showInitialArtwork(){
		if(this.initialArtworkInserted) return;
		const mediaFile=this.mediaFiles[0];
		await this.preloadMedia(mediaFile).catch(()=>{});
		let preloadedEl=this._prepareIncoming(mediaFile,0);
		if(mediaFile.type==='video'){
			preloadedEl.loop=true; preloadedEl.muted=true; preloadedEl.autoplay=true; preloadedEl.playsInline=true; preloadedEl.controls=false;
		}
		preloadedEl.id='artwork-media';
		preloadedEl.style.maxWidth='60vw'; preloadedEl.style.maxHeight='70vh';
		preloadedEl.style.objectFit='contain'; preloadedEl.style.willChange='transform, clip-path';
		preloadedEl.alt=mediaFile.meta?.alt || mediaFile.name;
		preloadedEl.classList.remove('wavy-in','wavy-out');
		const display=document.getElementById('artwork-display');
		while(display.firstChild) display.removeChild(display.firstChild);
		display.appendChild(preloadedEl);
		requestAnimationFrame(()=>{ void preloadedEl.offsetWidth; preloadedEl.classList.add('wavy-in'); if(mediaFile.type==='video'){ try{preloadedEl.play().catch(()=>{});}catch(e){} } });
		this.currentIndex=0;
		currentArtworkName=mediaFile.name;
		this.viewedArtworks.add(mediaFile.index);
		artworkTitle.update(mediaFile.meta);
		this.initialArtworkInserted=true;
		this.initialArtworkDisplayed=true;
		this.attemptReady();
	},
	async showNextArtwork(){
		if(this.isLoading||this.mediaFiles.length===0) return; this.isLoading=true;
		const outgoing=document.getElementById('artwork-media');
		const nextIndex=(this.currentIndex+1)%this.mediaFiles.length;
		const mediaFile=this.mediaFiles[nextIndex];
		this.preloadAround(nextIndex);
		const incomingPromise=this.preloadMedia(mediaFile).catch(()=>null);
		const outgoingPromise=new Promise(r=>{
			if(outgoing && this.initialArtworkDisplayed){
				outgoing.classList.remove('wavy-in');
				outgoing.classList.add('wavy-out');
				outgoing.addEventListener('animationend',()=>r(),{once:true});
				setTimeout(r,900);
			} else r();
		});
		await Promise.all([incomingPromise,outgoingPromise]);
		let preloadedEl=this._prepareIncoming(mediaFile,nextIndex);
		if(mediaFile.type==='video'){
			preloadedEl.loop=true; preloadedEl.muted=true; preloadedEl.autoplay=true; preloadedEl.playsInline=true; preloadedEl.controls=false;
		}
		preloadedEl.id='artwork-media';
		preloadedEl.style.maxWidth='60vw'; preloadedEl.style.maxHeight='70vh';
		preloadedEl.style.objectFit='contain'; preloadedEl.style.willChange='transform, clip-path';
		preloadedEl.alt=mediaFile.meta?.alt || mediaFile.name;
		preloadedEl.classList.remove('wavy-in','wavy-out');
		const display=document.getElementById('artwork-display');
		if(outgoing&&outgoing.parentNode) outgoing.parentNode.removeChild(outgoing);
		display.appendChild(preloadedEl);
		requestAnimationFrame(()=>{
			void preloadedEl.offsetWidth; // force reflow
			preloadedEl.classList.add('wavy-in');
			if(mediaFile.type==='video'){
				try{preloadedEl.play().catch(()=>{});}catch(e){}
			}
		});
		this.currentIndex=nextIndex;
		currentArtworkName=mediaFile.name;
		this.viewedArtworks.add(mediaFile.index);
	// Legacy bottom-right contact box disabled
		artworkTitle.update(mediaFile.meta);
		this.isLoading=false;
		if(!this.initialArtworkDisplayed) this.initialArtworkDisplayed=true;
		this.attemptReady();
	},
	async showPreviousArtwork(){
		if(this.isLoading||this.mediaFiles.length===0) return; this.isLoading=true;
		const outgoing=document.getElementById('artwork-media');
		const prevIndex=(this.currentIndex - 1 + this.mediaFiles.length)%this.mediaFiles.length;
		const mediaFile=this.mediaFiles[prevIndex];
		this.preloadAround(prevIndex);
		const incomingPromise=this.preloadMedia(mediaFile).catch(()=>null);
		const outgoingPromise=new Promise(r=>{
			if(outgoing){
				outgoing.classList.remove('wavy-in');
				outgoing.classList.add('wavy-out');
				outgoing.addEventListener('animationend',()=>r(),{once:true});
				setTimeout(r,900);
			} else r();
		});
		await Promise.all([incomingPromise,outgoingPromise]);
		let preloadedEl=this._prepareIncoming(mediaFile,prevIndex);
		if(mediaFile.type==='video'){
			preloadedEl.loop=true; preloadedEl.muted=true; preloadedEl.autoplay=true; preloadedEl.playsInline=true; preloadedEl.controls=false;
		}
		preloadedEl.id='artwork-media';
		preloadedEl.style.maxWidth='60vw'; preloadedEl.style.maxHeight='70vh';
		preloadedEl.style.objectFit='contain'; preloadedEl.style.willChange='transform, clip-path';
		preloadedEl.alt=mediaFile.meta?.alt || mediaFile.name;
		preloadedEl.classList.remove('wavy-in','wavy-out');
		const display=document.getElementById('artwork-display');
		if(outgoing&&outgoing.parentNode) outgoing.parentNode.removeChild(outgoing);
		display.appendChild(preloadedEl);
		requestAnimationFrame(()=>{
			void preloadedEl.offsetWidth;
			preloadedEl.classList.add('wavy-in');
			if(mediaFile.type==='video'){
				try{preloadedEl.play().catch(()=>{});}catch(e){}
			}
		});
		this.currentIndex=prevIndex;
		currentArtworkName=mediaFile.name;
		this.viewedArtworks.add(mediaFile.index);
	// Legacy bottom-right contact box disabled
		artworkTitle.update(mediaFile.meta);
		this.isLoading=false;
		this.attemptReady();
	},
	preloadMedia(mediaFile){
		const idx=mediaFile.index-1;
		if(this.cache.has(idx)) return Promise.resolve(this.cache.get(idx));
		if(this.preloadPromises.has(idx)) return this.preloadPromises.get(idx);
		const p=new Promise((resolve,reject)=>{
			if(mediaFile.type==='image'){
				const img=new Image();
				img.decoding='async';
				img.onload=()=>{this.cache.set(idx,img);this.loadedCount++; this.attemptReady(); resolve(img);};
				img.onerror=reject; img.src=mediaFile.url;
			} else {
				const vid=document.createElement('video');
				vid.preload='auto'; vid.muted=true; vid.loop=true;
				vid.onloadeddata=()=>{this.cache.set(idx,vid);this.loadedCount++; this.attemptReady(); resolve(vid);};
				vid.onerror=reject; vid.src=mediaFile.url; vid.load();
			}
		}).finally(()=>this.preloadPromises.delete(idx));
		this.preloadPromises.set(idx,p);
		return p;
	},
	preloadAround(centerIndex){
		if(this.mediaFiles.length===0) return;
		for(let offset=0;offset<=this.PRELOAD_AHEAD;offset++){
			const idx=(centerIndex+offset)%this.mediaFiles.length;
			const file=this.mediaFiles[idx];
			if(file) this.preloadMedia(file).catch(()=>{});
		}
	}
};

 const portfolioLoader={isLoading:true,ready:false,minShowMs:4000,startTime:0,show(){const el=document.getElementById('portfolio-loading');const vid=document.getElementById('portfolio-loading-video'); if(el){el.style.display='flex'; el.classList.remove('fade-out');}
 if(vid){vid.playbackRate=0.66; vid.currentTime=0; const ensure=()=>{const p=vid.play(); if(p) p.catch(()=>setTimeout(ensure,400));}; ensure(); vid.addEventListener('stalled',ensure); vid.addEventListener('pause',()=>{ if(!portfolioLoader.ready) ensure(); });}
 this.startTime=performance.now();},markReady(){if(this.ready) return; this.ready=true; const elapsed=performance.now()-this.startTime; const remain=Math.max(0,this.minShowMs-elapsed); setTimeout(()=>this.fadeOutAndComplete(),remain);},fadeOutAndComplete(){if(!this.isLoading) return; const el=document.getElementById('portfolio-loading'); if(el){el.classList.add('fade-out'); setTimeout(()=>this.complete(),1000);} else { this.complete(); }},complete(){this.isLoading=false; const el=document.getElementById('portfolio-loading'); if(el) el.style.display='none'; const pc=document.getElementById('portfolio-content'); if(pc){ pc.style.display='block'; pc.classList.add('active'); } audioSystem.startBackgroundMusic(); }};

function isInContactUI(target){
	const ids=['contact-button','contact-popover','contact-form-popover','open-contact-form','contact-form','contact-form-status','close-contact-form','watch-button','watch-popover','watch-video-button'];
	for(const id of ids){ const el=document.getElementById(id); if(el && (target===el || (el.contains && el.contains(target)))) return true; }
	return false;
}
function setupPortfolioEvents(){ if(!isMobile){ const pc=document.getElementById('portfolio-content'); pc.addEventListener('click',e=>{
		if(isInContactUI(e.target)) { e.stopPropagation(); e.preventDefault(); return; }
		e.preventDefault(); audioSystem.playClickSound(); artworkManager.showNextArtwork();
	}); }
 mobileTouch.init(); }

document.addEventListener('keydown',e=>{const pc=document.getElementById('portfolio-content'); if(!pc||pc.style.display!=='block') return; 
	if(isInContactUI(document.activeElement) || isInContactUI(e.target)) { return; }
	if(e.key==='ArrowRight'){ e.preventDefault(); audioSystem.playClickSound(); artworkManager.showNextArtwork(); } else if(e.key==='ArrowLeft'){ e.preventDefault(); audioSystem.playClickSound(); artworkManager.showPreviousArtwork(); }});

window.addEventListener('load',()=>{ artworkTitle.init(); portfolioLoader.show(); artworkManager.initFromManifest(); setupPortfolioEvents(); const pc=document.getElementById('portfolio-content'); if(pc){ pc.style.display='block'; } });

// Block mobile zoom (pinch + double-tap) to avoid breaking tap targets on iOS
(function(){
	const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
	if(!isTouch) return;
	let lastTouchEnd = 0;
	document.addEventListener('touchstart', function(e){
		if(e.touches.length > 1){ e.preventDefault(); }
	}, {passive:false});
	document.addEventListener('touchend', function(e){
		const now = Date.now();
		if(now - lastTouchEnd <= 300){ e.preventDefault(); }
		lastTouchEnd = now;
	}, {passive:false});
	document.addEventListener('gesturestart', function(e){ e.preventDefault(); });
})();

// Controls hint overlay logic
// Controls hint removed

// Contact popover toggle (non-intrusive)
(function(){
	const btn=document.getElementById('contact-button');
	const pop=document.getElementById('contact-popover');
	if(!btn||!pop) return;
	const mobileOverlay=document.getElementById('mobile-touch-area');
		function hide(){ pop.style.display='none'; btn.setAttribute('aria-expanded','false'); }
		function show(){
			// Center popover under the current animated button position
			const rect = btn.getBoundingClientRect();
			const popWidth = Math.min(window.innerWidth*0.9, 420);
			const left = Math.max(10, Math.min(window.innerWidth - popWidth - 10, rect.left + rect.width/2 - popWidth/2));
			pop.style.left = left + 'px';
			pop.style.top = Math.max(10, rect.bottom + 8) + 'px';
			pop.style.maxWidth = popWidth + 'px';
			pop.style.transform = 'none';
			pop.style.display='block';
			btn.setAttribute('aria-expanded','true');
			if(mobileOverlay) mobileOverlay.style.display='none';
		}
	btn.addEventListener('click',e=>{ e.stopPropagation(); if(pop.style.display==='block'){ hide(); } else { show(); } });
	// Outside tap/click closes
	document.addEventListener('pointerdown',e=>{ if(pop.style.display==='block' && !pop.contains(e.target) && e.target!==btn && !btn.contains(e.target)) { hide(); if(mobileOverlay) mobileOverlay.style.display=''; } });
	// Escape closes
	document.addEventListener('keydown',e=>{ if(e.key==='Escape') hide(); });
})();

	// Contact form popover and submission (optional endpoint)
	(function(){
		const openBtn=document.getElementById('open-contact-form');
		const formPop=document.getElementById('contact-form-popover');
		const closeBtn=document.getElementById('close-contact-form');
		const statusEl=document.getElementById('contact-form-status');
		const form=document.getElementById('contact-form');
		if(!openBtn||!formPop||!form||!statusEl) return;
		const mobileOverlay=document.getElementById('mobile-touch-area');
		function close(){ formPop.style.display='none'; if(mobileOverlay) mobileOverlay.style.display=''; }
		function positionFormNearIcon(){
			try{
				const btn=document.getElementById('contact-button');
				if(!btn || formPop.style.display!=='block') return;
				const rect=btn.getBoundingClientRect();
				const margin=10, gap=8;
				let popW=formPop.offsetWidth || Math.min(window.innerWidth*0.9, 320);
				let popH=formPop.offsetHeight || 220;
				let left = rect.left + rect.width/2 - popW/2;
				const spaceBelow = window.innerHeight - rect.bottom - gap;
				const spaceAbove = rect.top - gap;
				let top = (spaceBelow >= popH || spaceBelow >= spaceAbove)
					? (rect.bottom + gap)
					: (rect.top - gap - popH);
				left = Math.max(margin, Math.min(window.innerWidth - popW - margin, left));
				top = Math.max(margin, Math.min(window.innerHeight - popH - margin, top));
				formPop.style.left = left + 'px';
				formPop.style.top = top + 'px';
				formPop.style.transform='none';
			}catch(e){}
		}
		function open(){ 
			formPop.style.display='block'; 
			statusEl.textContent=''; 
			if(mobileOverlay) mobileOverlay.style.display='none';
			positionFormNearIcon();
		}
		openBtn.addEventListener('click',e=>{ e.stopPropagation(); open(); });
		closeBtn&&closeBtn.addEventListener('click',e=>{ e.stopPropagation(); close(); });
		document.addEventListener('pointerdown',e=>{ if(formPop.style.display==='block' && !formPop.contains(e.target) && e.target!==openBtn) close(); });
		window.addEventListener('resize',positionFormNearIcon);
		window.addEventListener('orientationchange',positionFormNearIcon);
		document.addEventListener('keydown',e=>{ if(e.key==='Escape') close(); });
		form.addEventListener('submit',async e=>{
			e.preventDefault();
			statusEl.textContent='Sending…';
			const fd=new FormData(form);
			const endpoint=formPop.getAttribute('data-endpoint');
			if(endpoint){
				try{
					fd.append('_subject','Portfolio message');
					fd.append('_origin', window.location.href);
					const res=await fetch(endpoint,{method:'POST',body:fd,headers:{'Accept':'application/json'}});
					if(res.ok){ statusEl.textContent='Sent! Thank you.'; form.reset(); } else { statusEl.textContent='Failed to send. Please try again.'; }
				}catch(err){ statusEl.textContent='Network error. Please try later.'; }
			} else {
				// Fallback: open mailto with subject/body
				const email='ezrasilva@proton.me';
				const subject=encodeURIComponent('Portfolio message');
				const body=encodeURIComponent(`${fd.get('message') || ''}`);
				window.location.href=`mailto:${email}?subject=${subject}&body=${body}`;
				statusEl.textContent='Opening mail client…';
			}
		});
	})();

// Bouncing movement for contact button (desktop and mobile)
(function(){
	const btn=document.getElementById('contact-button');
	if(!btn) return;
	const squashWrap=btn.querySelector('.squashwrap');
	let x=20, y=20; let vx=140, vy=110; // px/sec in CSS px
	let last=performance.now();
	function getViewport(){
		const vv = window.visualViewport;
		if(vv){ return { w: Math.floor(vv.width), h: Math.floor(vv.height) }; }
		return { w: window.innerWidth, h: window.innerHeight };
	}
	function step(now){
		const dt=(now-last)/1000; last=now;
		const {w,h}=getViewport();
		// Measure the moving element itself (translation doesn't affect its size)
		const rectNow=btn.getBoundingClientRect();
		const bw = rectNow.width || 144;
		const bh = rectNow.height || 144;
		x+=vx*dt; y+=vy*dt;
		let collided=false;
		if(x<=0){ x=0; vx=Math.abs(vx); collided=true; }
		if(x + bw >= w){ x = Math.max(0, w - bw); vx = -Math.abs(vx); collided=true; }
		if(y<=0){ y=0; vy=Math.abs(vy); collided=true; }
		if(y + bh >= h){ y = Math.max(0, h - bh); vy = -Math.abs(vy); collided=true; }
		btn.style.transform = `translate3d(${x}px, ${y}px, 0)`;
		if(collided && squashWrap){ squashWrap.classList.add('squash'); setTimeout(()=>squashWrap.classList.remove('squash'),160); }
		requestAnimationFrame(step);
	}
	// Start near current position
	const startRect=btn.getBoundingClientRect();
	const vp0=getViewport();
	const bw0 = startRect.width || 144;
	const bh0 = startRect.height || 144;
	x = Math.max(0, Math.min(vp0.w - bw0, startRect.left));
	y = Math.max(0, Math.min(vp0.h - bh0, startRect.top));
	// Randomize direction a bit
	vx *= (Math.random()>0.5?1:-1); vy *= (Math.random()>0.5?1:-1);
	// Re-clamp on viewport changes (iOS address bar collapse/expand etc.)
	const reclamp = ()=>{
		const {w,h}=getViewport();
		const rectNow=btn.getBoundingClientRect();
		const bw = rectNow.width || 144; const bh = rectNow.height || 144;
		x = Math.max(0, Math.min(w - bw, x));
		y = Math.max(0, Math.min(h - bh, y));
		btn.style.transform = `translate3d(${x}px, ${y}px, 0)`;
	};
	if(window.visualViewport){
		window.visualViewport.addEventListener('resize', reclamp);
		window.visualViewport.addEventListener('scroll', reclamp);
	}
	window.addEventListener('orientationchange', reclamp);
	window.addEventListener('resize', reclamp);
	requestAnimationFrame(step);
})();

// Ensure background fills mobile screens fully by forcing cover on resize/orientation
(function(){
	const apply=()=>{
		if(window.innerWidth<=768){ 
			document.body.style.backgroundSize='cover';
			document.body.style.backgroundRepeat='no-repeat';
			const pc=document.getElementById('portfolio-content');
			if(pc){ pc.style.backgroundImage = getComputedStyle(document.body).backgroundImage; pc.style.backgroundSize='cover'; pc.style.backgroundRepeat='no-repeat'; pc.style.backgroundPosition='center top'; pc.style.backgroundAttachment='scroll'; pc.style.backgroundColor='transparent'; }
		} else {
			const pc=document.getElementById('portfolio-content');
			if(pc){ pc.style.backgroundImage=''; pc.style.backgroundSize=''; pc.style.backgroundRepeat=''; pc.style.backgroundPosition=''; pc.style.backgroundAttachment=''; }
			document.body.style.backgroundSize=''; document.body.style.backgroundRepeat='';
		}
	};
	window.addEventListener('resize',apply); window.addEventListener('orientationchange',apply); apply();
})();

// Animated custom cursor setup (uses 8 separate PNG frames)
(function(){
	const prefersCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches; if(prefersCoarse) return;
	const cursorEl=document.getElementById('custom-cursor'); if(!cursorEl) return;
	const frameUrls=[1,2,3,4,5,6,7,8].map(i=>`assets/cursors/cursor${i}.png`);
	let loaded=0; let ready=false; let frameIndex=0; const hotspotX=32,hotspotY=0; const frameInterval=60; // ~16fps
	frameUrls.forEach(u=>{ const img=new Image(); img.onload=done; img.onerror=done; img.src=u; function done(){ if(++loaded===frameUrls.length){ start(); } }});
	function start(){ if(ready) return; ready=true; document.body.classList.add('cursor-hidden'); cursorEl.classList.add('animating'); animate(); }
	function animate(){ cursorEl.style.backgroundImage=`url('${frameUrls[frameIndex]}')`; frameIndex=(frameIndex+1)%frameUrls.length; setTimeout(animate,frameInterval); }
	window.addEventListener('pointermove',e=>{ if(!ready) return; cursorEl.style.transform=`translate3d(${e.clientX-hotspotX}px,${e.clientY-hotspotY}px,0)`; },{passive:true});
	setTimeout(()=>{ if(!ready) start(); },1200); // fallback activation
})();

// Second visual-only bouncing icon that disappears on tap and respawns later
(function(){
	const el=document.getElementById('fun-bouncer');
	if(!el) return;
	const squashWrap=el.querySelector('.squashwrap');
	let x=40,y=40,vx=120,vy=95; let last=performance.now(); let running=true;
	function vp(){ const vv=window.visualViewport; return vv?{w:Math.floor(vv.width),h:Math.floor(vv.height)}:{w:innerWidth,h:innerHeight}; }
	function reset(randomizePos=true){
		const {w,h}=vp();
		const r=el.getBoundingClientRect(); const bw=r.width||120, bh=r.height||120;
		if(randomizePos){
			x=Math.max(0, Math.min(w-bw, Math.random()*(w-bw)));
			y=Math.max(0, Math.min(h-bh, Math.random()*(h-bh)));
		} else {
			x=Math.max(0, Math.min(w-bw, x)); y=Math.max(0, Math.min(h-bh, y));
		}
		vx = (Math.random()>0.5?1:-1)*(100+Math.random()*70);
		vy = (Math.random()>0.5?1:-1)*(80+Math.random()*60);
		el.style.transform=`translate3d(${x}px,${y}px,0)`;
	}
	function step(now){
		if(!running) return;
		const dt=(now-last)/1000; last=now;
		const {w,h}=vp();
		const r=el.getBoundingClientRect(); const bw=r.width||120, bh=r.height||120;
		x+=vx*dt; y+=vy*dt; let hit=false;
		if(x<=0){x=0;vx=Math.abs(vx);hit=true;} if(x+bw>=w){x=w-bw;vx=-Math.abs(vx);hit=true;}
		if(y<=0){y=0;vy=Math.abs(vy);hit=true;} if(y+bh>=h){y=h-bh;vy=-Math.abs(vy);hit=true;}
		el.style.transform=`translate3d(${x}px,${y}px,0)`;
		if(hit&&squashWrap){squashWrap.classList.add('squash'); setTimeout(()=>squashWrap.classList.remove('squash'),160);}    
		requestAnimationFrame(step);
	}
	// Disappear on tap/click and respawn after delay
	function vanish(){
		el.style.display='none'; running=false;
		setTimeout(()=>{ el.style.display=''; running=true; reset(true); last=performance.now(); requestAnimationFrame(step); }, 2500);
	}
	el.addEventListener('click', (e)=>{ e.stopPropagation(); vanish(); });
	el.addEventListener('touchend', (e)=>{ e.preventDefault(); e.stopPropagation(); vanish(); }, {passive:false});
	if(window.visualViewport){ const reclamp=()=>reset(false); visualViewport.addEventListener('resize',reclamp); visualViewport.addEventListener('scroll',reclamp);} 
	window.addEventListener('resize',()=>reset(false)); window.addEventListener('orientationchange',()=>reset(false));
	reset(true); requestAnimationFrame(step);
})();

// Third bouncing icon with popover and "watch it" action
(function(){
	const btn=document.getElementById('watch-button');
	const pop=document.getElementById('watch-popover');
	const watchBtn=document.getElementById('watch-video-button');
	if(!btn||!pop||!watchBtn) return;
	const mobileOverlay=document.getElementById('mobile-touch-area');
	// Bounce
	const squashWrap=btn.querySelector('.squashwrap');
	let x=80,y=80,vx=100,vy=130,last=performance.now();
	function vp(){ const vv=visualViewport; return vv?{w:Math.floor(vv.width),h:Math.floor(vv.height)}:{w:innerWidth,h:innerHeight}; }
	function step(now){
		const dt=(now-last)/1000; last=now; const {w,h}=vp();
		const r=btn.getBoundingClientRect(); const bw=r.width||120,bh=r.height||120;
		x+=vx*dt; y+=vy*dt; let hit=false;
		if(x<=0){x=0;vx=Math.abs(vx);hit=true;} if(x+bw>=w){x=w-bw;vx=-Math.abs(vx);hit=true;}
		if(y<=0){y=0;vy=Math.abs(vy);hit=true;} if(y+bh>=h){y=h-bh;vy=-Math.abs(vy);hit=true;}
		btn.style.transform=`translate3d(${x}px,${y}px,0)`;
		if(hit&&squashWrap){squashWrap.classList.add('squash'); setTimeout(()=>squashWrap.classList.remove('squash'),160);}    
		requestAnimationFrame(step);
	}
	const start=btn.getBoundingClientRect(); const {w:hvw,h:vvh}=vp(); const bw=start.width||120,bh=start.height||120;
	x=Math.max(0,Math.min(hvw-bw,start.left)); y=Math.max(0,Math.min(vvh-bh,start.top));
	vx*=(Math.random()>0.5?1:-1); vy*=(Math.random()>0.5?1:-1);
	if(visualViewport){ const reclamp=()=>{ const {w,h}=vp(); x=Math.max(0,Math.min(w-bw,x)); y=Math.max(0,Math.min(h-bh,y)); btn.style.transform=`translate3d(${x}px,${y}px,0)`; }; visualViewport.addEventListener('resize',reclamp); visualViewport.addEventListener('scroll',reclamp); }
	window.addEventListener('resize',()=>{ const {w,h}=vp(); x=Math.max(0,Math.min(w-bw,x)); y=Math.max(0,Math.min(h-bh,y)); btn.style.transform=`translate3d(${x}px,${y}px,0)`; });
	requestAnimationFrame(step);
	// Popover
	function positionPop(){
		const rect=btn.getBoundingClientRect(); const margin=10,gap=8;
		let popW=pop.offsetWidth||Math.min(window.innerWidth*0.9,420);
		let popH=pop.offsetHeight||120; let left=rect.left+rect.width/2-popW/2;
		const spaceBelow=window.innerHeight-rect.bottom-gap; const spaceAbove=rect.top-gap;
		let top=(spaceBelow>=popH||spaceBelow>=spaceAbove)?(rect.bottom+gap):(rect.top-gap-popH);
		left=Math.max(margin,Math.min(window.innerWidth-popW-margin,left));
		top=Math.max(margin,Math.min(window.innerHeight-popH-margin,top));
		pop.style.left=left+'px'; pop.style.top=top+'px'; pop.style.transform='none';
	}
	function show(){ pop.style.display='block'; btn.setAttribute('aria-expanded','true'); if(mobileOverlay) mobileOverlay.style.display='none'; positionPop(); }
	function hide(){ pop.style.display='none'; btn.setAttribute('aria-expanded','false'); if(mobileOverlay) mobileOverlay.style.display=''; }
	btn.addEventListener('click',e=>{ e.stopPropagation(); if(pop.style.display==='block') hide(); else show(); });
	document.addEventListener('pointerdown',e=>{ if(pop.style.display==='block' && !pop.contains(e.target) && e.target!==btn && !btn.contains(e.target)) hide(); });
	window.addEventListener('resize',positionPop); window.addEventListener('orientationchange',positionPop);
	// Watch action
	watchBtn.addEventListener('click',()=>{ const url=pop.getAttribute('data-vimeo'); if(url) window.open(url,'_blank','noopener'); });
})();
