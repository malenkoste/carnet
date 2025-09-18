// Direct-entry portfolio version (no Unity). Uses transition video as loader until first artwork is ready.
// Overlay gating: only allow after loader finished AND first artwork displayed
window.overlayEnabled = false;
window.firstArtworkReady = false;
window.loaderDone = false;
function tryEnableOverlay(){
	if(window.firstArtworkReady && window.loaderDone){ window.overlayEnabled = true; }
}

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

const titleManager={getTitleForArtwork(i,record){return record?.title || `ARTWORK ${i}`;},getMeta(record){return record?.meta||'';}};
// Cursor overlay controller for showing title/meta near the cursor when over the artwork area
const cursorOverlay=(function(){
	let el=null; let active=false; let latest={ title:'', meta:'' }; let lastPos={x:innerWidth/2,y:innerHeight/2};
	let hideTimer=null;
	function ensure(){ if(!el) el=document.getElementById('cursor-overlay'); return el; }
	function setContent(title, meta){ latest.title=title||''; latest.meta=meta||''; const o=ensure(); if(!o) return; o.innerHTML=`<span class="title">${latest.title}</span><span class="meta">${latest.meta}</span>`; }
	function visible(v){ const o=ensure(); if(!o) return; o.style.opacity = v ? '1' : '0'; o.style.display = v ? 'block' : 'none'; }
	function show(){ if(!window.overlayEnabled) return; const o=ensure(); if(!o) return; active=true; o.style.transform='translate3d(-9999px,-9999px,0)'; visible(true); resetAutoHide(); }
	function hide(){ const o=ensure(); if(!o) return; active=false; clearTimeout(hideTimer); hideTimer=null; visible(false); }
	function resetAutoHide(){ clearTimeout(hideTimer); hideTimer=setTimeout(()=>{ hide(); }, 2000); }
	function move(x,y){
		lastPos={x,y}; const o=ensure(); if(!o||!active) return;
		const pad=14; const ow=o.offsetWidth, oh=o.offsetHeight; const maxX=window.innerWidth - ow - pad; const maxY=window.innerHeight - oh - pad;
		// Always place to the right of the cursor by default; flip to left if no space
		const gapX = 120; // horizontal gap from pointer (tripled)
		const gapY = 54;  // vertical nudge below pointer (tripled)
		let placedRight = true;
		let nx = x + gapX;
		if(nx > maxX){ placedRight = false; nx = Math.max(pad, x - ow - gapX); }
		let ny = Math.min(y + gapY, maxY);
		// Collision with screen boundaries is handled by clamping above; avoid bouncy icons too
		try{
			const blockers=[ 'contact-button','fun-bouncer','watch-button','groovy-bouncer','poppies-bouncer' ]
				.map(id=>document.getElementById(id)).filter(Boolean).map(el=>el.getBoundingClientRect());
			const r={ left:nx, top:ny, right:nx+o.offsetWidth, bottom:ny+o.offsetHeight };
			const inflate=10; // slightly larger buffer so overlay collider stays off icons
			let adjusted=true; let iter=0; const limit=6;
			while(adjusted && iter++<limit){
				adjusted=false;
				for(const b of blockers){
					const bx=b.left-inflate, by=b.top-inflate, br=b.right+inflate, bb=b.bottom+inflate;
					const overlap = !(r.right<bx || r.left>br || r.bottom<by || r.top>bb);
					if(overlap){
						// Push minimally away along smallest penetration axis
						const dxLeft = r.right - bx;  // move left by this
						const dxRight = br - r.left;  // move right by this
						const dyUp = r.bottom - by;   // move up by this
						const dyDown = bb - r.top;    // move down by this
						const min = Math.min(dxLeft, dxRight, dyUp, dyDown);
						if(min===dxLeft){ nx -= dxLeft; r.left-=dxLeft; r.right-=dxLeft; }
						else if(min===dxRight){ nx += dxRight; r.left+=dxRight; r.right+=dxRight; }
						else if(min===dyUp){ ny -= dyUp; r.top-=dyUp; r.bottom-=dyUp; }
						else { ny += dyDown; r.top+=dyDown; r.bottom+=dyDown; }
						// Re-clamp to viewport
						nx=Math.max(pad, Math.min(nx, maxX)); ny=Math.max(pad, Math.min(ny, maxY));
						adjusted=true;
					}
				}
			}
		}catch(e){}
		// Final guarantee: keep the pointer outside of the overlay rect so clicks are never occluded by collider
		try{
			const w=ow||o.offsetWidth, h=oh||o.offsetHeight;
			// If overlay still covers the pointer, snap to the side away from the cursor
			if(x>=nx && x<=nx+w && y>=ny && y<=ny+h){
				if(placedRight){ nx = Math.max(pad, x + gapX); }
				else { nx = Math.max(pad, Math.min(maxX, x - w - gapX)); }
			}
			// Re-clamp after exclusion
			nx=Math.max(pad, Math.min(nx, maxX)); ny=Math.max(pad, Math.min(ny, maxY));
		}catch(_){ }
		o.style.transform=`translate3d(${nx}px,${ny}px,0)`; resetAutoHide();
	}
	function placeNow(){ move(lastPos.x, lastPos.y); }
	return { setContent, show, hide, move, placeNow };
})();
// No-op holder to satisfy existing calls; replaced with overlay logic
const artworkTitle={init(){},update(record){ if(!record) return; const title=titleManager.getTitleForArtwork(record.index,record); const meta=titleManager.getMeta(record); cursorOverlay.setContent(title, meta); }};

const mobileTouch={touchArea:null,init(){this.touchArea=document.getElementById('mobile-touch-area');if(this.touchArea&&isMobile){this.setupTouchEvents();}},setupTouchEvents(){let touchStartTime=0;this.touchArea.addEventListener('touchstart',e=>{e.preventDefault();touchStartTime=Date.now();},{passive:false});this.touchArea.addEventListener('touchend',e=>{e.preventDefault();if(window.landscapeController && window.landscapeController.isPaused) return; if(Date.now()-touchStartTime<1000){audioSystem.playClickSound();setTimeout(()=>artworkManager.showNextArtwork(),20);}},{passive:false});['contextmenu','touchmove'].forEach(evt=>this.touchArea.addEventListener(evt,e=>{e.preventDefault();},{passive:false}));}};

function getAdaptivePreloadCount(){const nav=navigator.connection||navigator.webkitConnection||navigator.mozConnection; if(!nav) return 4; const slow=['slow-2g','2g','3g']; if(slow.includes(nav.effectiveType)) return 2; if(nav.downlink && nav.downlink>10) return 8; return 4; }

const artworkManager={
	paused:false,
	mediaFiles:[],currentIndex:0,isLoading:false,viewedArtworks:new Set(),cache:new Map(),preloadPromises:new Map(),
	PRELOAD_AHEAD:getAdaptivePreloadCount(),manifest:[],initialArtworkDisplayed:false,initialReadyMarked:false,initialArtworkInserted:false,
	initialPreloadTarget:0,loadedCount:0,
	async initFromManifest(){
		try{
			const res=await fetch('assets/scripts/artworks.json',{cache:'no-store'});
			this.manifest=await res.json();
			this.mediaFiles=this.manifest.map((m,idx)=>{
				const ext=m.file.split('.').pop();
				const type=['mp4','webm','mov'].includes(ext)?'video':(['glb','gltf','usdz'].includes(ext)?'model':'image');
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
			} else if(mediaFile.type==='video'){
				el.classList.remove('wavy-in','wavy-out');
			} else if(mediaFile.type==='model'){
				// Important: clone model-viewer so it re-mounts cleanly
				el = el.cloneNode(true);
			}
		} else {
			if(mediaFile.type==='video'){
				el=document.createElement('video'); el.src=mediaFile.url;
			}else if(mediaFile.type==='model'){
				el=document.createElement('model-viewer');
				el.setAttribute('src', mediaFile.url);
				// Disable native controls so we can drive rotation ourselves
				el.removeAttribute('camera-controls');
				el.setAttribute('interaction-prompt','none');
				el.setAttribute('alt', mediaFile.meta?.alt || mediaFile.name);
				el.setAttribute('exposure','1');
				el.setAttribute('shadow-intensity','0');
				el.setAttribute('ar-modes','webxr scene-viewer quick-look');
			}else{
				el=document.createElement('img'); el.src=mediaFile.url;
			}
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
		// Mosaic removed
		requestAnimationFrame(()=>{ void preloadedEl.offsetWidth; preloadedEl.classList.add('wavy-in'); if(mediaFile.type==='video'){ try{preloadedEl.play().catch(()=>{});}catch(e){} } });
		this.currentIndex=0;
		currentArtworkName=mediaFile.name;
		this.viewedArtworks.add(mediaFile.index);
		artworkTitle.update(mediaFile.meta);
		this.initialArtworkInserted=true;
		this.initialArtworkDisplayed=true;
		this.attemptReady();
		// Show or hide model rotation controls depending on media
		try{ const mc=document.getElementById('model-controls'); if(mc) mc.style.display = (mediaFile.type==='model') ? 'block' : 'none'; if(window.modelControls) window.modelControls.refresh(); }catch(_){ }
		// Mark first artwork ready; overlay will enable once loader completes
		try{ window.firstArtworkReady = true; tryEnableOverlay(); }catch(_){ }
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
		preloadedEl.id='artwork-media';
		preloadedEl.style.maxWidth='60vw'; preloadedEl.style.maxHeight='70vh';
		preloadedEl.style.objectFit='contain'; preloadedEl.style.willChange='transform, clip-path';
		preloadedEl.alt=mediaFile.meta?.alt || mediaFile.name;
		preloadedEl.classList.remove('wavy-in','wavy-out');
		const display=document.getElementById('artwork-display');
		if(outgoing&&outgoing.parentNode) outgoing.parentNode.removeChild(outgoing);
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
	// Legacy bottom-right contact box disabled
		artworkTitle.update(mediaFile.meta);
		this.isLoading=false;
		if(!this.initialArtworkDisplayed) this.initialArtworkDisplayed=true;
		this.attemptReady();
		// Toggle model controls on change
		try{ const mc=document.getElementById('model-controls'); if(mc) mc.style.display = (mediaFile.type==='model') ? 'block' : 'none'; if(window.modelControls) window.modelControls.refresh(); }catch(_){ }
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
		preloadedEl.id='artwork-media';
		preloadedEl.style.maxWidth='60vw'; preloadedEl.style.maxHeight='70vh';
		preloadedEl.style.objectFit='contain'; preloadedEl.style.willChange='transform, clip-path';
		preloadedEl.alt=mediaFile.meta?.alt || mediaFile.name;
		preloadedEl.classList.remove('wavy-in','wavy-out');
		const display=document.getElementById('artwork-display');
		if(outgoing&&outgoing.parentNode) outgoing.parentNode.removeChild(outgoing);
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
	// Legacy bottom-right contact box disabled
		artworkTitle.update(mediaFile.meta);
		this.isLoading=false;
		this.attemptReady();
		// Toggle model controls on change
		try{ const mc=document.getElementById('model-controls'); if(mc) mc.style.display = (mediaFile.type==='model') ? 'block' : 'none'; if(window.modelControls) window.modelControls.refresh(); }catch(_){ }
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
			} else if(mediaFile.type==='video'){
				const vid=document.createElement('video');
				vid.preload='auto'; vid.muted=true; vid.loop=true;
				vid.onloadeddata=()=>{this.cache.set(idx,vid);this.loadedCount++; this.attemptReady(); resolve(vid);};
				vid.onerror=reject; vid.src=mediaFile.url; vid.load();
			}else if(mediaFile.type==='model'){
				// Resolve immediately and cache a model-viewer element; let the real load happen on attach
				const mv=document.createElement('model-viewer');
				mv.setAttribute('src', mediaFile.url);
				this.cache.set(idx, mv);
				this.loadedCount++; this.attemptReady(); resolve(mv);
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
 if(vid){vid.playbackRate=0.66; vid.currentTime=0; const ensure=()=>{const p=vid.play(); if(p) p.catch(()=>setTimeout(ensure,400));}; ensure(); vid.addEventListener('stalled',ensure); vid.addEventListener('pause',()=>{ if(!portfolioLoader.ready && !vid.dataset.landscapePaused) ensure(); });}
 this.startTime=performance.now();},markReady(){if(this.ready) return; this.ready=true; const elapsed=performance.now()-this.startTime; const remain=Math.max(0,this.minShowMs-elapsed); setTimeout(()=>this.fadeOutAndComplete(),remain);},fadeOutAndComplete(){if(!this.isLoading) return; const el=document.getElementById('portfolio-loading'); if(el){el.classList.add('fade-out'); setTimeout(()=>this.complete(),1000);} else { this.complete(); }},complete(){this.isLoading=false; const el=document.getElementById('portfolio-loading'); if(el) el.style.display='none'; const pc=document.getElementById('portfolio-content'); if(pc){ pc.style.display='block'; pc.classList.add('active'); } audioSystem.startBackgroundMusic(); try{ window.loaderDone = true; tryEnableOverlay(); }catch(_){ } }};
 

function isInContactUI(target){
	// Treat popover containers as active only when visible to avoid blocking clicks after close
	const entries=[
		{ id:'contact-button', always:true },
		{ id:'watch-button', always:true },
		{ id:'open-contact-form', always:true },
		{ id:'watch-video-button', always:true },
		{ id:'contact-popover', visible:true },
		{ id:'contact-form-popover', visible:true },
		{ id:'watch-popover', visible:true },
		{ id:'contact-form', visible:true },
		{ id:'contact-form-status', visible:true },
		{ id:'close-contact-form', visible:true },
	];
	for(const e of entries){
		const el=document.getElementById(e.id);
		if(!el) continue;
		if(e.visible && !(el.offsetParent!==null || el.style.display==='block')) continue; // skip hidden
		if(target===el || (el.contains && el.contains(target))) return true;
	}
	return false;
}
function setupPortfolioEvents(){ if(!isMobile){ const pc=document.getElementById('portfolio-content'); pc.addEventListener('click',e=>{
		if(isInContactUI(e.target)) { e.stopPropagation(); e.preventDefault(); return; }
		// Ignore clicks originating from model-viewer interactions
		try{ if(e.target && (e.target.tagName==='MODEL-VIEWER' || (e.target.closest && e.target.closest('model-viewer')))) { e.stopPropagation(); return; } }catch(_){ }
		if(window.landscapeController && window.landscapeController.isPaused) { e.preventDefault(); return; }
		e.preventDefault(); audioSystem.playClickSound(); artworkManager.showNextArtwork();
	}); }
 mobileTouch.init(); }
 // Overlay behavior
 (function(){
	 const fine = window.matchMedia ? window.matchMedia('(pointer: fine)').matches : !isMobile;
	 const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : isMobile;
	 // Desktop: show anywhere on pointer move (global), hide after 2s via controller
	 if(fine){
		 window.addEventListener('pointermove', (e)=>{ if(!window.overlayEnabled) return; cursorOverlay.show(); cursorOverlay.move(e.clientX, e.clientY); }, { passive:true });
	 }
	 // Mobile/touch unchanged: tap to show anywhere
	 if(coarse){
		 const tapHandler = (e)=>{
			 if(!window.overlayEnabled) return;
			 try{
				 const t = e.target; if(isInContactUI && isInContactUI(t)) return;
				 const touch = e.changedTouches ? e.changedTouches[0] : null;
				 const x = touch ? touch.clientX : (e.clientX||0);
				 const y = touch ? touch.clientY : (e.clientY||0);
				 cursorOverlay.show(); cursorOverlay.move(x, y);
			 }catch(_){ }
		 };
		 window.addEventListener('touchend', tapHandler, { passive:false });
		 window.addEventListener('pointerup', (e)=>{ if(e.pointerType==='touch') tapHandler(e); }, { passive:true });
	 }
 })();

document.addEventListener('keydown',e=>{const pc=document.getElementById('portfolio-content'); if(!pc||pc.style.display!=='block') return; 
	if(window.landscapeController && window.landscapeController.isPaused) return;
	if(isInContactUI(document.activeElement) || isInContactUI(e.target)) { return; }
	if(e.key==='ArrowRight'){ e.preventDefault(); audioSystem.playClickSound(); artworkManager.showNextArtwork(); } else if(e.key==='ArrowLeft'){ e.preventDefault(); audioSystem.playClickSound(); artworkManager.showPreviousArtwork(); }});

window.addEventListener('load',()=>{ artworkTitle.init(); portfolioLoader.show(); artworkManager.initFromManifest(); setupPortfolioEvents(); const pc=document.getElementById('portfolio-content'); if(pc){ pc.style.display='block'; } });

// Scripted model rotation controls (wheel + arrow buttons)
(function(){
	const controls = {
		root: null, up:null, down:null, left:null, right:null,
		get mv(){ const el=document.getElementById('artwork-media'); return el && el.tagName==='MODEL-VIEWER' ? el : null; }
	};
	function ensure(){
		if(controls.root) return true;
		controls.root = document.getElementById('model-controls');
		if(!controls.root) return false;
		controls.up = document.getElementById('model-rot-up');
		controls.down = document.getElementById('model-rot-down');
		controls.left = document.getElementById('model-rot-left');
		controls.right = document.getElementById('model-rot-right');
		// Prevent click-to-next
		[controls.up,controls.down,controls.left,controls.right].forEach(b=>{
			if(!b) return;
			b.addEventListener('click', e=>{ e.stopPropagation(); e.preventDefault(); spinFromButton(e.currentTarget); });
		});
		// Wheel rotate
		window.addEventListener('wheel', e=>{
			const mv = controls.mv; if(!mv || controls.root.style.display!=='block') return;
			e.stopPropagation(); // do not scroll page
			// Horizontal spin with wheel; shift to spin vertically
			const delta = Math.sign(e.deltaY||0) * 8; // deg per notch
			const vertical = e.shiftKey ? delta : 0;
			const horizontal = e.shiftKey ? 0 : delta;
			spin(horizontal, vertical);
		}, { passive:false });
		return true;
	}
	function parseOrbit(orbit){
		// format: yawdeg deg pitchdeg deg radius[m]
		// Accepts strings like "45deg 75deg auto"
		const parts=(orbit||'0deg 75deg auto').split(/\s+/);
		const yaw=parseFloat(parts[0])||0;
		const pitch=parseFloat(parts[1])||75;
		const radius=parts[2]||'auto';
		return { yaw, pitch, radius };
	}
	function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
	function spin(hDeg, vDeg){
		const mv = controls.mv; if(!mv) return;
		const { yaw, pitch, radius } = parseOrbit(mv.getAttribute('camera-orbit'));
		const ny = (yaw + hDeg);
		const np = clamp(pitch + vDeg, 5, 175); // avoid flipping over poles
		mv.setAttribute('camera-orbit', `${ny}deg ${np}deg ${radius}`);
	}
	function spinFromButton(btn){
		if(!btn) return;
		const step=12; // deg per click
		if(btn.id==='model-rot-left') spin(-step,0);
		else if(btn.id==='model-rot-right') spin(step,0);
		else if(btn.id==='model-rot-up') spin(0,-step);
		else if(btn.id==='model-rot-down') spin(0,step);
	}
	// Public refresh when media changes
	window.modelControls = {
		refresh(){ if(!ensure()) return; /* no-op */ }
	};
	// Initialize bindings
	ensure();
})();

// Background slideshow with 6s crossfade
(function(){
	const root = document.getElementById('background-slideshow'); if(!root) return;
	const frames = Array.from(root.querySelectorAll('.bg-frame'));
	if(frames.length<2) return;
	// Build a broad candidate list (Background/background + 1..50, multiple extensions)
	const bases = ['Background','background'];
	const exts = ['png','jpg','jpeg','webp','avif'];
	const candidates = new Set();
	for(const base of bases){ for(const ext of exts){ candidates.add(`assets/images/${base}.${ext}`); } }
	for(let i=1;i<=50;i++){
		for(const base of bases){ for(const ext of exts){ candidates.add(`assets/images/${base}${i}.${ext}`); } }
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
		const probed = await Promise.all(Array.from(candidates).map(preload));
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
		function hide(){ 
			pop.style.display='none'; 
			btn.setAttribute('aria-expanded','false'); 
			// If focus is inside the popover, blur it so key handlers aren't blocked
			try{ if(document.activeElement && pop.contains(document.activeElement)) document.activeElement.blur(); }catch(_){}
			// Re-enable mobile tap overlay when closing via any path (icon toggle, Escape, or outside click)
			if(mobileOverlay) mobileOverlay.style.display='';
		}
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
	// Clicking the contact icon toggles the SEND MESSAGE popover (re-enabled)
	btn.addEventListener('click',e=>{ 
		e.stopPropagation(); 
		if(pop.style.display==='block'){ hide(); } else { show(); }
	});
	// Outside tap/click closes
	document.addEventListener('pointerdown',e=>{ if(pop.style.display==='block' && !pop.contains(e.target) && e.target!==btn && !btn.contains(e.target)) { hide(); } });
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

// Unified bouncing manager: single rAF, independent motion per icon (no synchrony)
(function(){
	const getViewport = () => {
		const vv = window.visualViewport;
		return vv ? { w: Math.floor(vv.width), h: Math.floor(vv.height) } : { w: innerWidth, h: innerHeight };
	};

	function measure(el){ const r=el.getBoundingClientRect(); return { w:r.width||120, h:r.height||120, l:r.left||0, t:r.top||0 }; }
	function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
	function rnd(min,max){ return min + Math.random()*(max-min); }
	function rndSign(){ return Math.random()>0.5?1:-1; }

	// Helper: get overlay rect if overlay text is visible
	function getOverlayRect(){
		try{
			if(!window.overlayEnabled) return null;
			const el = document.getElementById('cursor-overlay');
			if(!el) return null;
			const cs = getComputedStyle(el);
			if(cs.display === 'none' || parseFloat(cs.opacity||'0') <= 0.01) return null;
			const r = el.getBoundingClientRect();
			return { l:r.left, t:r.top, r:r.right, b:r.bottom };
		}catch(_){ return null; }
	}

	// Build sprite state
	const sprites = [];
	function addSprite(el, speedRange){
		if(!el) return null;
		const wrap = el.querySelector('.squashwrap');
		const rot = el.querySelector('.rotwrap');
		if(rot){ rot.style.animationDelay = `-${rnd(0,10).toFixed(2)}s`; }
		const { w:vw, h:vh } = getViewport();
		const m = measure(el);
	const w = m.w, h = m.h;
		// Randomize start to avoid same-point spawn
		let x = clamp(rnd(0, Math.max(0, vw - w)), 0, Math.max(0, vw - w));
		let y = clamp(rnd(0, Math.max(0, vh - h)), 0, Math.max(0, vh - h));
		// Independent speeds
		let vx = rnd(speedRange.vx[0], speedRange.vx[1]) * rndSign();
		let vy = rnd(speedRange.vy[0], speedRange.vy[1]) * rndSign();
		const timeScale = rnd(0.92, 1.08);
		const jitter = rnd(6, 12); // px/s^2
		el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
	const s = { el, wrap, x, y, vx, vy, w, h, timeScale, jitter, active:true, speedRange };
		sprites.push(s);
		return s;
	}

	// Register existing icons
	const contactSprite = addSprite(document.getElementById('contact-button'), { vx:[120,170], vy:[90,140] });
	const funSprite = addSprite(document.getElementById('fun-bouncer'), { vx:[100,170], vy:[80,140] });
	const watchSprite = addSprite(document.getElementById('watch-button'), { vx:[90,140], vy:[110,160] });

	// Register fourth and fifth icons
	const groovySprite = addSprite(document.getElementById('groovy-bouncer'), { vx:[110,160], vy:[100,150] });
	const poppiesSprite = addSprite(document.getElementById('poppies-bouncer'), { vx:[100,150], vy:[90,140] });

	// Vanish/respawn for fun-bouncer
	if(funSprite){
		const respawn = ()=>{
			const { w:vw, h:vh } = getViewport();
			const m = measure(funSprite.el); funSprite.w=m.w; funSprite.h=m.h;
			funSprite.x = rnd(0, Math.max(0, vw - funSprite.w));
			funSprite.y = rnd(0, Math.max(0, vh - funSprite.h));
			funSprite.vx = rnd(funSprite.speedRange.vx[0], funSprite.speedRange.vx[1]) * rndSign();
			funSprite.vy = rnd(funSprite.speedRange.vy[0], funSprite.speedRange.vy[1]) * rndSign();
			funSprite.el.style.transform = `translate3d(${funSprite.x}px, ${funSprite.y}px, 0)`;
			funSprite.active = true;
		};
		const vanish = (e)=>{
			if(e){ e.stopPropagation(); if(e.type==='touchend') e.preventDefault(); }
			funSprite.el.style.display='none';
			funSprite.active=false;
			setTimeout(()=>{ funSprite.el.style.display=''; respawn(); }, 2500);
		};
		funSprite.el.addEventListener('click', vanish);
		funSprite.el.addEventListener('touchend', vanish, { passive:false });
	}

	// Vanish/respawn helper
	function wireVanish(sprite, delayMs=2500){
		if(!sprite) return;
		const respawn = ()=>{
			const { w:vw, h:vh } = getViewport();
			const m = measure(sprite.el); sprite.w=m.w; sprite.h=m.h;
			sprite.x = rnd(0, Math.max(0, vw - sprite.w));
			sprite.y = rnd(0, Math.max(0, vh - sprite.h));
			sprite.vx = rnd(sprite.speedRange.vx[0], sprite.speedRange.vx[1]) * rndSign();
			sprite.vy = rnd(sprite.speedRange.vy[0], sprite.speedRange.vy[1]) * rndSign();
			sprite.el.style.transform = `translate3d(${sprite.x}px, ${sprite.y}px, 0)`;
			sprite.active = true;
		};
		const vanish = (e)=>{
			if(e){ e.stopPropagation(); if(e.type==='touchend') e.preventDefault(); }
			sprite.el.style.display='none';
			sprite.active=false;
			setTimeout(()=>{ sprite.el.style.display=''; respawn(); }, delayMs);
		};
		sprite.el.addEventListener('click', vanish);
		sprite.el.addEventListener('touchend', vanish, { passive:false });
	}
	// Groovy: open Instagram on click/tap instead of vanishing
	if(groovySprite){
		const openInsta = (e)=>{
			if(e){ e.stopPropagation(); if(e.type==='touchend') e.preventDefault(); }
			window.open('https://www.instagram.com/malenkoste', '_blank', 'noopener');
		};
		groovySprite.el.addEventListener('click', openInsta);
		groovySprite.el.addEventListener('touchend', openInsta, { passive:false });
	}

	// Poppies acts as a toggle for all icons pause/resume
	if(poppiesSprite){
		const reason='user-toggle';
		const toggle=(e)=>{
			if(e){ e.stopPropagation(); if(e.type==='touchend') e.preventDefault(); }
			if(!window.bounceController) return;
			if(window.bounceController.has && window.bounceController.has(reason)){
				window.bounceController.resume(reason);
			}else{
				window.bounceController.pause(reason);
			}
		};
		poppiesSprite.el.addEventListener('click', toggle);
		poppiesSprite.el.addEventListener('touchend', toggle, { passive:false });
	}

	let last = performance.now();
	let paused=false; let rafId=null; const pauseReasons=new Set();
	function step(now){
		const dt = (now - last) / 1000; last = now;
		if(paused){ rafId = requestAnimationFrame(step); return; }
		const { w:vw, h:vh } = getViewport();
		// Sample overlay rect once per frame for collision
		const overlayR = getOverlayRect();
		for(const s of sprites){
			if(!s || !s.active) continue;
			// tiny random jitter so paths diverge
			s.vx += (Math.random()*2-1) * s.jitter * dt;
			s.vy += (Math.random()*2-1) * s.jitter * dt;
			// move
			const tdt = dt * s.timeScale;
			s.x += s.vx * tdt; s.y += s.vy * tdt;
			// size is cached; updated on resize/reclamp and on respawn
			// collisions with viewport edges
			let hit=false;
			if(s.x <= 0){ s.x=0; s.vx=Math.abs(s.vx); hit=true; }
			if(s.x + s.w >= vw){ s.x=Math.max(0, vw - s.w); s.vx=-Math.abs(s.vx); hit=true; }
			if(s.y <= 0){ s.y=0; s.vy=Math.abs(s.vy); hit=true; }
			if(s.y + s.h >= vh){ s.y=Math.max(0, vh - s.h); s.vy=-Math.abs(s.vy); hit=true; }
			// collision with cursor overlay text (if visible)
			if(overlayR){
				const rL = s.x, rT = s.y, rR = s.x + s.w, rB = s.y + s.h;
				const overlap = !(rR < overlayR.l || rL > overlayR.r || rB < overlayR.t || rT > overlayR.b);
				if(overlap){
					const dxLeft = rR - overlayR.l;   // move left by this
					const dxRight = overlayR.r - rL;   // move right by this
					const dyUp = rB - overlayR.t;      // move up by this
					const dyDown = overlayR.b - rT;    // move down by this
					// pick minimal penetration axis
					const minPen = Math.min(dxLeft, dxRight, dyUp, dyDown);
					const eps = 1;
					if(minPen === dxLeft){ s.x -= (dxLeft + eps); s.vx = -Math.abs(s.vx); hit = true; }
					else if(minPen === dxRight){ s.x += (dxRight + eps); s.vx = Math.abs(s.vx); hit = true; }
					else if(minPen === dyUp){ s.y -= (dyUp + eps); s.vy = -Math.abs(s.vy); hit = true; }
					else { s.y += (dyDown + eps); s.vy = Math.abs(s.vy); hit = true; }
					// Re-clamp to viewport after resolution
					s.x = clamp(s.x, 0, Math.max(0, vw - s.w));
					s.y = clamp(s.y, 0, Math.max(0, vh - s.h));
				}
			}
			s.el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
			if(hit && s.wrap){ s.wrap.classList.add('squash'); setTimeout(()=>s.wrap.classList.remove('squash'), 160); }
		}
		rafId = requestAnimationFrame(step);
	}

	function reclampAll(){
		const { w:vw, h:vh } = getViewport();
		for(const s of sprites){ if(!s) continue; const m=measure(s.el); s.w=m.w; s.h=m.h; s.x=clamp(s.x,0,Math.max(0,vw-s.w)); s.y=clamp(s.y,0,Math.max(0,vh-s.h)); s.el.style.transform=`translate3d(${s.x}px, ${s.y}px, 0)`; }
	}
	if(window.visualViewport){ visualViewport.addEventListener('resize',reclampAll); visualViewport.addEventListener('scroll',reclampAll); }
	window.addEventListener('resize',reclampAll);
	window.addEventListener('orientationchange',reclampAll);

	if(sprites.length){ requestAnimationFrame((t)=>{ last=t; rafId=requestAnimationFrame(step); }); }

	// expose pause/resume controls with reasons
	function applyPaused(){ const was=paused; paused = pauseReasons.size>0; if(paused!==was){ if(paused) document.body.classList.add('icons-paused'); else document.body.classList.remove('icons-paused'); } }
	window.bounceController = {
		pause(reason='generic'){ pauseReasons.add(reason); applyPaused(); },
		resume(reason='generic'){ pauseReasons.delete(reason); applyPaused(); },
		isPaused(){ return paused; },
		has(reason){ return pauseReasons.has(reason); }
	};
})();

// Mosaic renderer removed

// Ensure background fills mobile screens fully by forcing cover on resize/orientation
(function(){
	// Ping-pong sprite animation for groovy-bouncer (6 frames)
	const el = document.getElementById('groovy-bouncer'); if(!el) return;
	const img = el.querySelector('img'); if(!img) return;
	const framesAttr = el.getAttribute('data-frames')||'';
	const frames = framesAttr.split(',').map(s=>s.trim()).filter(Boolean);
	if(frames.length < 2) return;
	// Preload frames
	let loaded=0; const pre=[]; frames.forEach((u,i)=>{ const im=new Image(); im.onload=done; im.onerror=done; im.src=u; pre[i]=im; });
	function done(){ if(++loaded===frames.length){ start(); } }
	let i=0, dir=1; let timer=null; let paused=false; const interval=90; // ~11 fps
	function step(){
		if(paused) return;
		img.src = frames[i];
		i += dir;
		if(i===frames.length-1 || i===0) dir *= -1; // ping-pong at ends
		timer = setTimeout(step, interval);
	}
	function start(){ if(timer) return; step(); }
	function setPaused(p){ paused=p; if(paused){ if(timer){ clearTimeout(timer); timer=null; } } else { if(!timer) step(); } }
	const applyPauseFromControllers=()=>{
		const landscapePaused = !!(window.landscapeController && window.landscapeController.isPaused);
		const iconsPaused = !!(window.bounceController && window.bounceController.isPaused && window.bounceController.isPaused());
		setPaused(landscapePaused || iconsPaused);
	};
	window.addEventListener('resize',applyPauseFromControllers);
	window.addEventListener('orientationchange',applyPauseFromControllers);
	setTimeout(applyPauseFromControllers,0);
})();

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

// (fun-bouncer movement handled by unified manager; vanish/respawn wired there)

// Third bouncing icon popover and "watch it" action (movement via unified manager)
(function(){
	const btn=document.getElementById('watch-button');
	const pop=document.getElementById('watch-popover');
	const watchBtn=document.getElementById('watch-video-button');
	if(!btn||!pop||!watchBtn) return;
	const mobileOverlay=document.getElementById('mobile-touch-area');
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
	watchBtn.addEventListener('click',()=>{ const url=pop.getAttribute('data-vimeo'); if(url) window.open(url,'_blank','noopener'); });
	// Escape closes (and restores mobile overlay)
	document.addEventListener('keydown',e=>{ if(e.key==='Escape' && pop.style.display==='block'){ hide(); } });
})();

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
