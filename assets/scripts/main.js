// Direct-entry portfolio version (no Unity). Uses transition video as loader until first artwork is ready.
window.loaderDone = false;
window.firstArtworkReady = false;

let currentArtworkName='';
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints && navigator.maxTouchPoints>2) || window.innerWidth<=768;

// Basic audio (no Unity context)
const audioSystem={backgroundAudio:null,clickAudio:null,audioInitialized:false,_retryTimer:null,
	async init(){
		try{
			if(this.audioInitialized) return;
			this.backgroundAudio=new Audio('assets/audio/background.mp3');
			this.backgroundAudio.loop=true; this.backgroundAudio.volume=0.35;
			this.clickAudio=new Audio('assets/audio/click.mp3'); this.clickAudio.volume=0.198;
			this.audioInitialized=true;
		}catch(e){}
	},
	async startBackgroundMusic(){
		if(!this.audioInitialized || !this.backgroundAudio) return;
		try{ await this.backgroundAudio.play(); clearTimeout(this._retryTimer); }
		catch(e){ // autoplay blocked, retry soon
			clearTimeout(this._retryTimer);
			this._retryTimer=setTimeout(()=>this.startBackgroundMusic(),1200);
		}
	},
	pauseBackground(){ try{ this.backgroundAudio&&this.backgroundAudio.pause(); }catch(e){} },
	resumeBackground(){ this.startBackgroundMusic(); },
	playClickSound(){ if(this.clickAudio&&this.audioInitialized){ try{ this.clickAudio.currentTime=0; const p=this.clickAudio.play(); if(p) p.catch(()=>{}); }catch(e){} } }
};
function initializeAllAudio(){audioSystem.init(); audioSystem.startBackgroundMusic();}
['click','keydown','touchstart'].forEach(evt=>document.addEventListener(evt,initializeAllAudio,{once:true}));

// Overlay removed

const mobileTouch={touchArea:null,init(){this.touchArea=document.getElementById('mobile-touch-area');if(this.touchArea&&isMobile){this.setupTouchEvents();}},setupTouchEvents(){let touchStartTime=0;this.touchArea.addEventListener('touchstart',e=>{e.preventDefault();touchStartTime=Date.now();},{passive:false});this.touchArea.addEventListener('touchend',e=>{e.preventDefault();if(window.landscapeController && window.landscapeController.isPaused) return; if(Date.now()-touchStartTime<1000){ try{ const m=document.getElementById('artwork-media'); if(m && m.tagName==='MODEL-VIEWER') return; }catch(_){ } audioSystem.playClickSound(); setTimeout(()=>artworkManager.showNextArtwork(),20);}},{passive:false});['contextmenu','touchmove'].forEach(evt=>this.touchArea.addEventListener(evt,e=>{e.preventDefault();},{passive:false}));}};

function getAdaptivePreloadCount(){const nav=navigator.connection||navigator.webkitConnection||navigator.mozConnection; if(!nav) return 4; const slow=['slow-2g','2g','3g']; if(slow.includes(nav.effectiveType)) return 2; if(nav.downlink && nav.downlink>10) return 8; return 4; }

const artworkManager={
	paused:false,
	mediaFiles:[],currentIndex:0,isLoading:false,viewedArtworks:new Set(),cache:new Map(),preloadPromises:new Map(),
	PRELOAD_AHEAD:(function(){ const base=getAdaptivePreloadCount(); return isMobile ? Math.min(2, base) : base; })(),
	MAX_CACHE_SIZE:10,
	manifest:[],initialArtworkDisplayed:false,initialReadyMarked:false,initialArtworkInserted:false,
	initialPreloadTarget:0,loadedCount:0,
	async initFromManifest(){
		try{
			const res=await fetch('assets/scripts/artworks_models.json',{cache:'no-store'});
			this.manifest=await res.json();
			let allFiles=this.manifest.map((m,idx)=>{
				const ext=m.file.split('.').pop();
				const type=['mp4','webm','mov'].includes(ext)?'video':(['glb','gltf','usdz'].includes(ext)?'model':'image');
				return { url:`assets/artwork/${m.file}`, type, name:m.file, index:idx+1, id:idx, meta:m };
			});
			// Filter by page mode (models | animations | images)
			const mode = (document.body && (document.body.dataset.mode||document.body.getAttribute('data-mode'))) || '';
			let desiredType=null;
			if(mode==='models') desiredType='model';
			else if(mode==='animations') desiredType='video';
			else if(mode==='images') desiredType='image';
			this.mediaFiles = desiredType ? allFiles.filter(f=>f.type===desiredType) : allFiles;
			if(!this.mediaFiles.length){ this.mediaFiles = allFiles; }
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
		let elRef=this.cache.get(cacheIndex);
		let el;
		if(mediaFile.type==='image'){
			if(elRef){
				// restart CSS animations by cloning
				el=elRef.cloneNode(true);
			}else{
				el=document.createElement('img'); el.src=mediaFile.url;
			}
		} else if(mediaFile.type==='video'){
			if(elRef){
				el=elRef; el.classList.remove('wavy-in','wavy-out');
			}else{
				el=document.createElement('video'); el.src=mediaFile.url;
			}
		} else if(mediaFile.type==='model'){
			// Always create a fresh model-viewer (avoid cloning heavy DOM; ensures proper re-render)
			el=document.createElement('model-viewer');
			el.setAttribute('src', mediaFile.url);
			el.removeAttribute('camera-controls');
			el.setAttribute('interaction-prompt','none');
			el.setAttribute('alt', mediaFile.meta?.alt || mediaFile.name);
			el.setAttribute('exposure','1');
			el.setAttribute('ar-modes','webxr scene-viewer quick-look');
		}
		return el;
	},
	_attachModelLoader(modelEl){
		/* loader helper removed (restoring native model-viewer progress bar) */
	},
	async showInitialArtwork(){
		if(this.initialArtworkInserted) return;
		const mediaFile=this.mediaFiles[0];
		await this.preloadMedia(mediaFile).catch(()=>{});
		let preloadedEl=this._prepareIncoming(mediaFile,0);
		if(mediaFile.type==='video'){
			preloadedEl.loop=true; preloadedEl.muted=true; preloadedEl.autoplay=true; preloadedEl.playsInline=true; preloadedEl.controls=false;
		}
		// model loader helper removed; use native progress bar
		preloadedEl.id='artwork-media';
		preloadedEl.style.maxWidth='60vw'; preloadedEl.style.maxHeight='70vh';
		preloadedEl.style.objectFit='contain'; preloadedEl.style.willChange='transform, clip-path';
		preloadedEl.alt=mediaFile.meta?.alt || mediaFile.name;
		preloadedEl.classList.remove('wavy-in','wavy-out');
		const display=document.getElementById('artwork-display');
		while(display.firstChild) display.removeChild(display.firstChild);
		display.appendChild(preloadedEl);
		// Mosaic removed
		requestAnimationFrame(()=>{ void preloadedEl.offsetWidth; preloadedEl.classList.add('wavy-in'); if(mediaFile.type==='video'){ try{preloadedEl.play().catch(()=>{});}catch(e){} } });
		this.currentIndex=0;
		currentArtworkName=mediaFile.name;
		this.viewedArtworks.add(mediaFile.index);
		/* overlay removed */
		this.initialArtworkInserted=true;
		this.initialArtworkDisplayed=true;
		this.attemptReady();
		// Always show navigation buttons for all media types now
		try{ const nb=document.getElementById('next-artwork'); if(nb) nb.style.display='block'; const pb=document.getElementById('prev-artwork'); if(pb) pb.style.display='block'; }catch(_){ }
		// Mark first artwork ready; overlay will enable once loader completes
		try{ window.firstArtworkReady = true; }catch(_){ }
	},
	async showNextArtwork(){
		if(this.paused || this.isLoading || this.mediaFiles.length===0) return; this.isLoading=true;
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
		// native progress bar only
		preloadedEl.id='artwork-media';
		preloadedEl.style.maxWidth='60vw'; preloadedEl.style.maxHeight='70vh';
		preloadedEl.style.objectFit='contain'; preloadedEl.style.willChange='transform, clip-path';
		preloadedEl.alt=mediaFile.meta?.alt || mediaFile.name;
		preloadedEl.classList.remove('wavy-in','wavy-out');
		const display=document.getElementById('artwork-display');
		if(outgoing&&outgoing.parentNode){
			// Proactive video cleanup to release memory
			try{ if(outgoing.tagName==='VIDEO'){ outgoing.pause(); outgoing.removeAttribute('src'); outgoing.load(); } }catch(_){ }
			outgoing.parentNode.removeChild(outgoing);
		}
		display.appendChild(preloadedEl);
		// Mosaic removed
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
	// Legacy bottom-right contact box disabled; overlay removed
		this.isLoading=false;
		if(!this.initialArtworkDisplayed) this.initialArtworkDisplayed=true;
		this.attemptReady();
		// Keep nav buttons visible for all media
		try{ const nb=document.getElementById('next-artwork'); if(nb) nb.style.display='block'; const pb=document.getElementById('prev-artwork'); if(pb) pb.style.display='block'; }catch(_){ }
	},
	async showPreviousArtwork(){
		if(this.paused || this.isLoading || this.mediaFiles.length===0) return; this.isLoading=true;
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
		// native progress bar only
		preloadedEl.id='artwork-media';
		preloadedEl.style.maxWidth='60vw'; preloadedEl.style.maxHeight='70vh';
		preloadedEl.style.objectFit='contain'; preloadedEl.style.willChange='transform, clip-path';
		preloadedEl.alt=mediaFile.meta?.alt || mediaFile.name;
		preloadedEl.classList.remove('wavy-in','wavy-out');
		const display=document.getElementById('artwork-display');
		if(outgoing&&outgoing.parentNode){
			try{ if(outgoing.tagName==='VIDEO'){ outgoing.pause(); outgoing.removeAttribute('src'); outgoing.load(); } }catch(_){ }
			outgoing.parentNode.removeChild(outgoing);
		}
		display.appendChild(preloadedEl);
		// Mosaic removed
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
	// Legacy bottom-right contact box disabled; overlay removed
		this.isLoading=false;
		this.attemptReady();
		// Keep nav buttons visible for all media
		try{ const nb=document.getElementById('next-artwork'); if(nb) nb.style.display='block'; const pb=document.getElementById('prev-artwork'); if(pb) pb.style.display='block'; }catch(_){ }
	},
	preloadMedia(mediaFile){
		const idx=mediaFile.index-1;
		if(this.cache.has(idx)) return Promise.resolve(this.cache.get(idx));
		if(this.preloadPromises.has(idx)) return this.preloadPromises.get(idx);
		const p=new Promise((resolve,reject)=>{
			if(mediaFile.type==='image'){
				const img=new Image(); img.decoding='async';
				img.onload=()=>{this.cache.set(idx,img);this.loadedCount++; this.attemptReady(); this.evictIfNeeded(); resolve(img);};
				img.onerror=reject; img.src=mediaFile.url;
			}else if(mediaFile.type==='video'){
				const vid=document.createElement('video'); vid.preload='metadata'; vid.muted=true; vid.loop=true;
				vid.onloadeddata=()=>{this.cache.set(idx,vid);this.loadedCount++; this.attemptReady(); this.evictIfNeeded(); resolve(vid);};
				vid.onerror=reject; vid.src=mediaFile.url; vid.load();
			}else if(mediaFile.type==='model'){
				const sentinel={ type:'model-sentinel', url:mediaFile.url };
				this.cache.set(idx, sentinel);
				this.loadedCount++; this.attemptReady(); this.evictIfNeeded(); resolve(sentinel);
			}
		}).finally(()=>this.preloadPromises.delete(idx));
		this.preloadPromises.set(idx,p);
		return p;
	},
	evictIfNeeded(){
		if(this.cache.size <= this.MAX_CACHE_SIZE) return;
		const protectedIdx=new Set([
			this.currentIndex,
			(this.currentIndex+1)%this.mediaFiles.length,
			(this.currentIndex-1+this.mediaFiles.length)%this.mediaFiles.length
		]);
		for(const [cIdx,el] of Array.from(this.cache.entries())){
			if(this.cache.size <= this.MAX_CACHE_SIZE) break;
			if(protectedIdx.has(cIdx)) continue;
			const mediaFile=this.mediaFiles[cIdx];
			if(!mediaFile) { this.cache.delete(cIdx); continue; }
			if(mediaFile.type==='video' || mediaFile.type==='image'){
				try{ if(mediaFile.type==='video' && el && el.tagName==='VIDEO'){ el.pause(); el.removeAttribute('src'); el.load(); } }catch(_){ }
				this.cache.delete(cIdx);
			}
		}
	},
	preloadAround(centerIndex){
		if(this.mediaFiles.length===0) return;
		for(let offset=0;offset<=this.PRELOAD_AHEAD;offset++){
			const idx=(centerIndex+offset)%this.mediaFiles.length; const file=this.mediaFiles[idx]; if(!file) continue; this.preloadMedia(file).catch(()=>{});
		}
	}
};

 const portfolioLoader={isLoading:true,ready:false,minShowMs:4000,startTime:0,show(){const el=document.getElementById('portfolio-loading');const vid=document.getElementById('portfolio-loading-video'); if(el){el.style.display='flex'; el.classList.remove('fade-out');}
 if(vid){vid.playbackRate=0.66; vid.currentTime=0; const ensure=()=>{const p=vid.play(); if(p) p.catch(()=>setTimeout(ensure,400));}; ensure(); vid.addEventListener('stalled',ensure); vid.addEventListener('pause',()=>{ if(!portfolioLoader.ready && !vid.dataset.landscapePaused) ensure(); });}
 this.startTime=performance.now();},markReady(){if(this.ready) return; this.ready=true; const elapsed=performance.now()-this.startTime; const remain=Math.max(0,this.minShowMs-elapsed); setTimeout(()=>this.fadeOutAndComplete(),remain);},fadeOutAndComplete(){if(!this.isLoading) return; const el=document.getElementById('portfolio-loading'); if(el){el.classList.add('fade-out'); setTimeout(()=>this.complete(),1000);} else { this.complete(); }},complete(){this.isLoading=false; const el=document.getElementById('portfolio-loading'); const vid=document.getElementById('portfolio-loading-video'); if(el){ el.style.display='none'; }
 if(vid){ try{ vid.pause(); vid.removeAttribute('src'); vid.load(); }catch(_){ } }
 const pc=document.getElementById('portfolio-content'); if(pc){ pc.style.display='block'; pc.classList.add('active'); } audioSystem.startBackgroundMusic(); try{ window.loaderDone = true; }catch(_){ } }};
 

function isInContactUI(target){
	// Treat popover containers as active only when visible to avoid blocking clicks after close
	const entries=[
		{ id:'contact-button', always:true },
		{ id:'contact-form-popover', visible:true },
		{ id:'contact-form', visible:true },
		{ id:'contact-form-status', visible:true },
		{ id:'close-contact-form', visible:true },
	];
// isInContactUI now supplied by common.js
}
function setupPortfolioEvents(){ if(!isMobile){ const pc=document.getElementById('portfolio-content'); pc.addEventListener('click',e=>{
		if(isInContactUI(e.target)) { e.stopPropagation(); e.preventDefault(); return; }
		// If current media is a model, disable click-to-next entirely
		try{
			const m=document.getElementById('artwork-media');
			if(m && m.tagName==='MODEL-VIEWER'){ e.stopPropagation(); return; }
			// Otherwise, ignore clicks originating from model-viewer interactions just in case
			if(e.target && (e.target.tagName==='MODEL-VIEWER' || (e.target.closest && e.target.closest('model-viewer')))) { e.stopPropagation(); return; }
		}catch(_){ }
		if(window.landscapeController && window.landscapeController.isPaused) { e.preventDefault(); return; }
		e.preventDefault(); audioSystem.playClickSound(); artworkManager.showNextArtwork();
	}); }
 mobileTouch.init(); }
 // Overlay behavior removed

document.addEventListener('keydown',e=>{const pc=document.getElementById('portfolio-content'); if(!pc||pc.style.display!=='block') return; 
	if(window.landscapeController && window.landscapeController.isPaused) return;
	if(isInContactUI(document.activeElement) || isInContactUI(e.target)) { return; }
	// If a model is active, reserve arrows for rotation only (handled elsewhere)
	const am=document.getElementById('artwork-media'); const isModel = !!(am && am.tagName==='MODEL-VIEWER');
	if(isModel) return;
	if(e.key==='ArrowRight'){ e.preventDefault(); audioSystem.playClickSound(); artworkManager.showNextArtwork(); } else if(e.key==='ArrowLeft'){ e.preventDefault(); audioSystem.playClickSound(); artworkManager.showPreviousArtwork(); }});

window.addEventListener('load',()=>{ portfolioLoader.show(); artworkManager.initFromManifest(); setupPortfolioEvents(); const pc=document.getElementById('portfolio-content'); if(pc){ pc.style.display='block'; } });

// Scripted model rotation: wheel, drag, arrow keys, touch
(function(){
	function parseOrbit(orbit){
		const parts=(orbit||'0deg 75deg auto').split(/\s+/);
		return { yaw:parseFloat(parts[0])||0, pitch:parseFloat(parts[1])||75, radius:parts[2]||'auto' };
	}
	function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
	function spin(mv,hDeg,vDeg){ if(!mv) return; const {yaw,pitch,radius}=parseOrbit(mv.getAttribute('camera-orbit')); const ny=yaw+hDeg; const np=clamp(pitch+vDeg,5,175); mv.setAttribute('camera-orbit',`${ny}deg ${np}deg ${radius}`); }
	function currentMV(){ const el=document.getElementById('artwork-media'); return el && el.tagName==='MODEL-VIEWER'? el : null; }

	// Wheel (horizontal by default, Shift = vertical)
	window.addEventListener('wheel',e=>{ const mv=currentMV(); if(!mv) return; e.stopPropagation(); const delta=Math.sign(e.deltaY||0)*8; if(e.shiftKey) spin(mv,0,delta); else spin(mv,delta,0); },{passive:false});
	// Arrow keys continuous rotation: rAF only when needed (no permanent interval)
	const keyState={left:false,right:false,up:false,down:false};
	let rotateRAF=null;
	function rotateLoop(){
		const mv=currentMV();
		if(!mv){ rotateRAF=null; return; }
		const step=4;
		const h=(keyState.left?-step:0)+(keyState.right?step:0);
		const v=(keyState.up?-step:0)+(keyState.down?step:0);
		if(h||v) spin(mv,h,v);
		rotateRAF=requestAnimationFrame(rotateLoop);
	}
	function ensureRotate(){ if(!rotateRAF) rotateLoop(); }
	window.addEventListener('keydown',e=>{ const mv=currentMV(); if(!mv) return; if(e.key==='ArrowLeft'){keyState.left=true; ensureRotate(); e.preventDefault();} else if(e.key==='ArrowRight'){keyState.right=true; ensureRotate(); e.preventDefault();} else if(e.key==='ArrowUp'){keyState.up=true; ensureRotate(); e.preventDefault();} else if(e.key==='ArrowDown'){keyState.down=true; ensureRotate(); e.preventDefault();} });
	window.addEventListener('keyup',e=>{ if(e.key==='ArrowLeft') keyState.left=false; else if(e.key==='ArrowRight') keyState.right=false; else if(e.key==='ArrowUp') keyState.up=false; else if(e.key==='ArrowDown') keyState.down=false; });

	// Mouse drag (left button) & right button
	let dragging=false, lastX=0, lastY=0, button=0;
	window.addEventListener('pointerdown',e=>{ const mv=currentMV(); if(!mv) return; if(e.button===0||e.button===2){ dragging=true; button=e.button; lastX=e.clientX; lastY=e.clientY; mv.style.pointerEvents='none'; e.preventDefault(); }});
	window.addEventListener('pointermove',e=>{ if(!dragging) return; const mv=currentMV(); if(!mv) return; const dx=e.clientX-lastX; const dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; const scale = (button===2)?0.5:1; spin(mv, dx*0.4*scale, dy*0.4*scale); });
	window.addEventListener('pointerup',()=>{ dragging=false; const mv=currentMV(); if(mv) mv.style.pointerEvents=''; });
	window.addEventListener('contextmenu',e=>{ const mv=currentMV(); if(mv && dragging) { e.preventDefault(); } });

	// Touch swipe + long-hold
	let lastTouch=null, holdTimer=null;
	function startHold(dirX,dirY){ clearInterval(holdTimer); holdTimer=setInterval(()=>{ const mv=currentMV(); if(mv) spin(mv,dirX,dirY); },30); }
	function stopHold(){ clearInterval(holdTimer); holdTimer=null; }
	window.addEventListener('touchstart',e=>{ const mv=currentMV(); if(!mv) return; const t=e.touches[0]; lastTouch={x:t.clientX,y:t.clientY}; setTimeout(()=>{ if(lastTouch){ startHold(3,0); } },300); },{passive:true});
	window.addEventListener('touchmove',e=>{ const mv=currentMV(); if(!mv||!lastTouch) return; const t=e.touches[0]; const dx=t.clientX-lastTouch.x; const dy=t.clientY-lastTouch.y; lastTouch={x:t.clientX,y:t.clientY}; spin(mv, Math.sign(dx)*Math.min(8,Math.abs(dx)/4), Math.sign(dy)*Math.min(8,Math.abs(dy)/4)); },{passive:true});
	window.addEventListener('touchend',()=>{ lastTouch=null; stopHold(); },{passive:true});

	// Wire prev/next buttons
	setTimeout(()=>{ const nb=document.getElementById('next-artwork'); if(nb) nb.addEventListener('click',e=>{ e.stopPropagation(); artworkManager.showNextArtwork(); }); const pb=document.getElementById('prev-artwork'); if(pb) pb.addEventListener('click',e=>{ e.stopPropagation(); artworkManager.showPreviousArtwork(); }); },0);
})();

// Background slideshow with 6s crossfade
(function(){
	const root = document.getElementById('background-slideshow'); if(!root) return;
	const frames = Array.from(root.querySelectorAll('.bg-frame'));
	if(frames.length<2) return;
	// Build a capped candidate list (max 20 logical images) to reduce network pressure
	const bases = ['Background','background'];
	const exts = ['png','jpg','jpeg','webp','avif'];
	const candidates = [];
	function pushCandidate(path){ if(candidates.length<100) candidates.push(path); }
	for(const base of bases){ for(const ext of exts){ pushCandidate(`assets/images/${base}.${ext}`); } }
	outer: for(let i=1;i<=20;i++){
		for(const base of bases){ for(const ext of exts){ pushCandidate(`assets/images/${base}${i}.${ext}`); if(candidates.length>=100) break outer; } }
	}
	// Probe which images exist by attempting to load them
	function preload(url){ return new Promise(resolve=>{ const i=new Image(); i.onload=()=>resolve(url); i.onerror=()=>resolve(null); i.src=url; }); }
	function naturalKey(s){
		// Extract base and first number; fallback to string
		const m = s.match(/([^\/]*?)(\d+)?\.(png|jpg|jpeg|webp|avif)$/i);
		if(!m) return { name:s.toLowerCase(), num:Infinity };
		return { name:m[1].toLowerCase(), num: m[2] ? parseInt(m[2],10) : 0 };
	}
	(async function(){
		const probed = await Promise.all(candidates.map(preload));
		let existing = probed.filter(Boolean);
		if(!existing.length){
			// Fallback to the body background image if no separate assets found
			const bg = getComputedStyle(document.body).backgroundImage;
			const urlMatch = bg && bg.match(/url\("?(.*?)"?\)/);
			if(urlMatch && urlMatch[1]) existing.push(urlMatch[1]);
		}
		if(existing.length===0) return;
		// Natural sort by name and number (e.g., Background2 before Background10)
		existing.sort((a,b)=>{ const ka=naturalKey(a), kb=naturalKey(b); return ka.name===kb.name ? ka.num - kb.num : (ka.name<kb.name?-1:1); });
		// Preload into CSS backgrounds to ensure caching
		const preloadCss = existing.map(u=>new Promise(res=>{ const i=new Image(); i.onload=i.onerror=()=>res(); i.src=u; }));
		Promise.allSettled(preloadCss).then(()=>{
			let idx=0; let active=0;
			function setFrame(el,url){ el.style.backgroundImage=`url('${url}')`; }
			// Initialize first frame
			setFrame(frames[active], existing[idx]); frames[active].classList.add('active');
			if(existing.length<2) return; // only one image, no slideshow
			function step(){
				idx = (idx+1)%existing.length;
				const next = 1 - active; // flip between 0 and 1
				setFrame(frames[next], existing[idx]);
				// Crossfade by toggling classes
				frames[next].classList.add('active');
				frames[active].classList.remove('active');
				// swap active index
				active = next;
			}
			setInterval(step, 8000);
		});
	})();
})();
// Slideshow now initialized via common.js

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
	if(!btn) return;
	const openForm=(e)=>{ if(e){ e.stopPropagation(); if(e.type==='touchend') e.preventDefault(); }
		try{ window.contactFormController && window.contactFormController.open(); }catch(_){ }
	};
	btn.addEventListener('click', openForm);
	btn.addEventListener('touchend', openForm, { passive:false });
})();
// Contact button & form logic moved to common.js
window.addEventListener('load',()=>{ portfolioLoader.show(); if(window.CommonInit){ window.CommonInit.init(); } artworkManager.initFromManifest(); setupPortfolioEvents(); const pc=document.getElementById('portfolio-content'); if(pc){ pc.style.display='block'; } });

	// Contact form popover and submission (optional endpoint)
	(function(){
		const openBtn=document.getElementById('open-contact-form');
		const formPop=document.getElementById('contact-form-popover');
		const closeBtn=document.getElementById('close-contact-form');
		const statusEl=document.getElementById('contact-form-status');
		const form=document.getElementById('contact-form');
		if(!formPop||!form||!statusEl) return;
		const mobileOverlay=document.getElementById('mobile-touch-area');
			function close(){ 
			formPop.style.display='none'; 
			// Blur any focused control within the form so isInContactUI won't treat it as active via focus
			try{ if(document.activeElement && formPop.contains(document.activeElement)) document.activeElement.blur(); }catch(_){}
			if(mobileOverlay) mobileOverlay.style.display=''; 
		}
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
			// Expose controller for external triggers (contact icon)
			window.contactFormController = {
				open,
				close,
				toggle(){ if(formPop.style.display==='block') close(); else open(); },
				isOpen(){ return formPop.style.display==='block'; }
			};
	openBtn && openBtn.addEventListener('click',e=>{ e.stopPropagation(); open(); });
		closeBtn&&closeBtn.addEventListener('click',e=>{ e.stopPropagation(); close(); });
		document.addEventListener('pointerdown',e=>{ if(formPop.style.display==='block' && !formPop.contains(e.target) && e.target!==openBtn) close(); });
		window.addEventListener('resize',positionFormNearIcon);
		window.addEventListener('orientationchange',positionFormNearIcon);
		document.addEventListener('keydown',e=>{ if(e.key==='Escape') close(); });
		form.addEventListener('submit',async e=>{
			e.preventDefault();
			const submitBtn = form.querySelector('button[type="submit"]');
			if(submitBtn){ submitBtn.disabled=true; submitBtn.setAttribute('aria-busy','true'); }
			statusEl.textContent='Sending…';
			const fd=new FormData(form);
			const endpoint=formPop.getAttribute('data-endpoint');
			const emailFallback='ezrasilva@proton.me';
			const message=(fd.get('message')||'').toString().trim();
			if(!message){ statusEl.textContent='Please write a message.'; const ta=form.querySelector('textarea[name="message"]'); ta&&ta.focus(); if(submitBtn){ submitBtn.disabled=false; submitBtn.removeAttribute('aria-busy'); } return; }
			async function sendViaFormspree(){
				const controller = new AbortController();
				const timer = setTimeout(()=>controller.abort(), 12000);
				try{
					fd.append('_subject','Portfolio message');
					fd.append('_origin', window.location.href);
					const res=await fetch(endpoint,{method:'POST',body:fd,headers:{'Accept':'application/json'},signal:controller.signal});
					clearTimeout(timer);
					return res.ok;
				}catch(_){ clearTimeout(timer); return false; }
			}
			function sendViaMailto(){
				const subject=encodeURIComponent('Portfolio message');
				const body=encodeURIComponent(`${message}\n\nFrom: ${window.location.href}`);
				const href=`mailto:${emailFallback}?subject=${subject}&body=${body}`;
				// Create a temporary anchor to better trigger default mail client
				const a=document.createElement('a'); a.href=href; a.style.display='none'; document.body.appendChild(a);
				try{ a.click(); }catch(_){ try{ window.location.href=href; }catch(__){} }
				setTimeout(()=>{ try{ document.body.removeChild(a); }catch(_){} }, 100);
				statusEl.textContent='Opening mail client…';
			}
			let ok=false;
			const isLocal = location.protocol === 'file:';
			if(endpoint && !isLocal){ ok = await sendViaFormspree(); }
			if(ok){ statusEl.textContent='Sent! Thank you.'; form.reset(); setTimeout(()=>{ try{ window.contactFormController && window.contactFormController.close(); }catch(_){} }, 600); }
			else { statusEl.textContent='Could not send via form. Using email client…'; sendViaMailto(); setTimeout(()=>{ try{ window.contactFormController && window.contactFormController.close(); }catch(_){} }, 1200); }
			if(submitBtn){ submitBtn.disabled=false; submitBtn.removeAttribute('aria-busy'); }
		});
	})();

// Bouncing system removed: provide static behavior + stub controller
(function(){
	window.bounceController={ pause(){}, resume(){}, isPaused(){ return false; }, has(){ return false; } };
	const groovy=document.getElementById('groovy-bouncer');
	if(groovy){
		const openInsta=(e)=>{ if(e){ e.stopPropagation(); if(e.type==='touchend') e.preventDefault(); } window.open('https://www.instagram.com/malenkoste','_blank','noopener'); };
		groovy.addEventListener('click', openInsta);
		groovy.addEventListener('touchend', openInsta, { passive:false });
	}
	const poppies=document.getElementById('poppies-bouncer');
	if(poppies){
		const goMedia=(e)=>{ if(e){ e.stopPropagation(); if(e.type==='touchend') e.preventDefault(); } window.location.href='media.html'; };
		poppies.addEventListener('click', goMedia);
		poppies.addEventListener('touchend', goMedia, { passive:false });
	}
})();

// Mosaic renderer removed

// Removed groovy ping-pong frame animation

(function(){
	const apply=()=>{
		if(window.innerWidth<=768){ 
			document.body.style.backgroundSize='cover';
			document.body.style.backgroundRepeat='no-repeat';
			const pc=document.getElementById('portfolio-content');
			if(pc){ pc.style.backgroundImage = ''; pc.style.backgroundSize=''; pc.style.backgroundRepeat=''; pc.style.backgroundPosition=''; pc.style.backgroundAttachment=''; pc.style.backgroundColor='transparent'; }
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
	let timerId=null; let paused=false;
	frameUrls.forEach(u=>{ const img=new Image(); img.onload=done; img.onerror=done; img.src=u; function done(){ if(++loaded===frameUrls.length){ start(); } }});
	function start(){ if(ready) return; ready=true; document.body.classList.add('cursor-hidden'); cursorEl.classList.add('animating'); animate(); }
	function animate(){ if(paused) return; cursorEl.style.backgroundImage=`url('${frameUrls[frameIndex]}')`; frameIndex=(frameIndex+1)%frameUrls.length; timerId=setTimeout(animate,frameInterval); }
	window.addEventListener('pointermove',e=>{ if(!ready) return; cursorEl.style.transform=`translate3d(${e.clientX-hotspotX}px,${e.clientY-hotspotY}px,0)`; },{passive:true});
	setTimeout(()=>{ if(!ready) start(); },1200); // fallback activation
	window.cursorController={
		pause(){ paused=true; if(timerId){ clearTimeout(timerId); timerId=null; } },
		resume(){ if(!ready) return; if(!paused) return; paused=false; if(!timerId) animate(); },
		isPaused(){ return paused; }
	};
})();

// Removed fun-bouncer system

// Third bouncing icon popover and "watch it" action (movement via unified manager)
// Removed watch-button handler

// Landscape overlay controller: pause all animations/audio in mobile landscape
(function(){
	const mql = window.matchMedia('(orientation: landscape) and (hover: none) and (pointer: coarse)');
	const overlay = document.getElementById('landscape-lock');
	function pauseAll(){
		// mark paused
		document.body.classList.add('landscape-paused');
		artworkManager.paused = true;
		// pause audio
		audioSystem.pauseBackground();
		// pause any playing videos (artwork + loader)
		try{ const m=document.getElementById('artwork-media'); if(m && m.tagName==='VIDEO') m.pause(); }catch(e){}
		try{ const l=document.getElementById('portfolio-loading-video'); if(l){ l.dataset.landscapePaused='1'; l.pause(); } }catch(e){}
		// pause JS animations
		if(window.bounceController) window.bounceController.pause('landscape');
		if(window.cursorController) window.cursorController.pause();
		// ensure overlay visible
		if(overlay) overlay.style.display='flex';
	}
	function resumeAll(){
		document.body.classList.remove('landscape-paused');
		artworkManager.paused = false;
		// resume audio
		audioSystem.resumeBackground();
		// resume videos (artwork only; loader will resume when active)
		try{ const m=document.getElementById('artwork-media'); if(m && m.tagName==='VIDEO') m.play().catch(()=>{}); }catch(e){}
		try{ const l=document.getElementById('portfolio-loading-video'); if(l){ delete l.dataset.landscapePaused; const cont=document.getElementById('portfolio-loading'); if(cont && cont.style.display!=='none'){ const p=l.play(); if(p) p.catch(()=>{}); } } }catch(e){}
		// resume JS animations
		if(window.bounceController) window.bounceController.resume('landscape');
		if(window.cursorController) window.cursorController.resume();
		if(overlay) overlay.style.display=''; // back to CSS control
	}
	function apply(){ if(mql.matches) pauseAll(); else resumeAll(); }
	if(mql.addEventListener) mql.addEventListener('change', apply); else if(mql.addListener) mql.addListener(apply);
	window.addEventListener('resize', apply);
	window.addEventListener('orientationchange', apply);
	// expose minimal controller for other modules/testing
	window.landscapeController = { get isPaused(){ return mql.matches; }, pauseAll, resumeAll };
	// initial
	setTimeout(apply, 0);
})();
