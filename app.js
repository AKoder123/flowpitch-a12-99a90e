(() => {
  const qs = (s, el=document) => el.querySelector(s);
  const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));

  let slidesData = [];
  let currentIndex = 0;
  let deckEl, slidesEl, sideDotsEl, progressBarEl, topBarEl, navTitleEl;
  let isWheelLocked = false;
  let io;
  let prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', init);

  async function init(){
    deckEl = qs('#deck');
    slidesEl = qs('#slides');
    sideDotsEl = qs('#sideDots');
    progressBarEl = qs('#topProgressBar');
    topBarEl = qs('#topBar');
    navTitleEl = qs('#navTitle');

    applyPRMClass();
    await loadContent();
    setupNav();
    setupObserver();
    setupWheelNav();
    computeTopOffset();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    setupPdfExport();

    // Activate first slide
    setTimeout(() => {
      goTo(0, false);
      fitTypography(currentSlide());
    }, 0);
  }

  function applyPRMClass(){
    if(prefersReduced){ document.body.classList.add('prefers-reduced-motion'); }
  }

  async function loadContent(){
    try{
      const res = await fetch('./content.json?ts=' + Date.now(), { cache:'no-store' });
      if(!res.ok) throw new Error('Failed to load content.json');
      const data = await res.json();
      slidesData = data.slides || [];
      if(navTitleEl) navTitleEl.textContent = data.meta?.title || 'Presentation';
      buildSlides(slidesData);
      buildDots(slidesData);
      updateProgress();
    }catch(err){
      console.error(err);
      if(navTitleEl) navTitleEl.textContent = 'Failed to load deck';
    }
  }

  function buildSlides(arr){
    if(!slidesEl) return;
    slidesEl.innerHTML = '';
    arr.forEach((s, i) => {
      const sec = document.createElement('section');
      sec.className = `slide type-${s.type||'content'}`;
      sec.setAttribute('role','listitem');
      sec.dataset.index = String(i);
      sec.style.setProperty('--textScale','1');

      const inner = document.createElement('div');
      inner.className = 'inner panel';

      // content structure
      if(s.type === 'title'){
        const h1 = el('h1','headline grad', s.headline); h1.setAttribute('data-animate','');
        const sub = s.subheadline ? el('div','subhead', s.subheadline) : null; if(sub) sub.setAttribute('data-animate','');
        inner.appendChild(h1);
        if(sub) inner.appendChild(sub);
      } else if(s.type === 'section'){
        const kicker = el('div','kicker', 'Section'); kicker.setAttribute('data-animate','');
        const h2 = el('h2','headline grad', s.headline); h2.setAttribute('data-animate','');
        inner.appendChild(kicker);
        inner.appendChild(h2);
        inner.appendChild(hr());
      } else if(s.type === 'closing'){
        const h1 = el('h1','headline grad', s.headline); h1.setAttribute('data-animate','');
        inner.appendChild(h1);
        if(s.subheadline){ const sh = el('div','subhead', s.subheadline); sh.setAttribute('data-animate',''); inner.appendChild(sh); }
        if(s.bullets && s.bullets.length){
          const ul = el('ul','bullets');
          s.bullets.forEach((b, bi)=>{ const li = el('li','', accentify(b, bi===0)); li.setAttribute('data-animate',''); ul.appendChild(li); });
          inner.appendChild(ul);
        }
      } else {
        // generic content
        const h2 = el('h2','headline', s.headline); h2.setAttribute('data-animate','');
        if(s.subheadline){ const sh = el('div','subhead', s.subheadline); sh.setAttribute('data-animate',''); inner.appendChild(sh); }
        inner.appendChild(h2);
        const wrap = el('div','contentWrap');

        if(s.left || s.right){
          const grid = el('div','contentGrid twoCol');
          if(s.left){ grid.appendChild(buildCol(s.left)); }
          if(s.right){ grid.appendChild(buildCol(s.right)); }
          wrap.appendChild(grid);
        }
        if(s.bullets && s.bullets.length){
          const ul = el('ul','bullets');
          s.bullets.slice(0,6).forEach((b, bi) => {
            const li = el('li','', accentify(b, bi===0));
            li.setAttribute('data-animate','');
            ul.appendChild(li);
          });
          wrap.appendChild(ul);
        }
        inner.appendChild(wrap);
      }

      // Stagger animate on children
      setStagger(inner);

      sec.appendChild(inner);
      slidesEl.appendChild(sec);
    });
  }

  function buildCol(obj){
    const col = el('div','column');
    if(obj.title){ const t = el('div','colTitle', obj.title); t.setAttribute('data-animate',''); col.appendChild(t); }
    if(obj.bullets && obj.bullets.length){
      const ul = el('ul','bullets');
      obj.bullets.slice(0,6).forEach((b, bi)=>{ const li = el('li','', accentify(b, bi===0)); li.setAttribute('data-animate',''); ul.appendChild(li); });
      col.appendChild(ul);
    }
    return col;
  }

  function el(tag, cls, html){ const x=document.createElement(tag); if(cls) x.className=cls; if(html!==undefined){ x.innerHTML=html; } return x; }
  function hr(){ const r=document.createElement('hr'); r.className='sep'; r.setAttribute('aria-hidden','true'); return r; }

  // Apply gradient accent to a key phrase on content slides (first label before ":")
  function accentify(text, allow){
    if(!allow) return escapeHtml(text);
    const idx = text.indexOf(':');
    if(idx>0 && idx < 40){
      const a = escapeHtml(text.slice(0, idx));
      const b = escapeHtml(text.slice(idx+1));
      return `<span class="grad">${a}:</span>${b}`;
    }
    return `<span class="grad">${escapeHtml(text)}</span>`;
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>\"]/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s]));
  }

  function setStagger(scope){
    const items = qsa('[data-animate]', scope);
    items.forEach((n, i)=>{
      if(prefersReduced) return;
      n.style.transitionDelay = (i*60) + 'ms';
    });
  }

  function buildDots(arr){
    if(!sideDotsEl) return;
    sideDotsEl.innerHTML = '';
    arr.forEach((s, i)=>{
      const btn = document.createElement('button');
      btn.type='button';
      btn.setAttribute('aria-label', `Slide ${i+1}: ${s.headline || s.type}`);
      const inner = document.createElement('span'); inner.className='inner'; btn.appendChild(inner);
      btn.addEventListener('click', ()=> goTo(i));
      sideDotsEl.appendChild(btn);
    });
    updateDots();
  }

  function updateDots(){
    if(!sideDotsEl) return;
    const btns = qsa('button', sideDotsEl);
    btns.forEach((b, i)=>{
      if(i===currentIndex){ b.setAttribute('aria-current','true'); }
      else { b.removeAttribute('aria-current'); }
    });
  }

  function setupNav(){
    const prev = qs('#prevBtn');
    const next = qs('#nextBtn');
    prev && prev.addEventListener('click', ()=> goTo(currentIndex-1));
    next && next.addEventListener('click', ()=> goTo(currentIndex+1));

    document.addEventListener('keydown', (e)=>{
      if(['INPUT','TEXTAREA','SELECT'].includes((e.target||{}).tagName)) return;
      if(e.code==='Space'){ e.preventDefault(); if(e.shiftKey) goTo(currentIndex-1); else goTo(currentIndex+1); }
      if(e.code==='ArrowRight' || e.code==='ArrowDown'){ e.preventDefault(); goTo(currentIndex+1); }
      if(e.code==='ArrowLeft' || e.code==='ArrowUp'){ e.preventDefault(); goTo(currentIndex-1); }
      if(e.code==='Home'){ goTo(0); }
      if(e.code==='End'){ goTo(slidesData.length-1); }
    });
  }

  function setupObserver(){
    if(!deckEl) return;
    io = new IntersectionObserver(entries =>{
      let best = null; let bestRatio = 0;
      entries.forEach(en=>{
        if(en.intersectionRatio > bestRatio){ bestRatio = en.intersectionRatio; best = en.target; }
      });
      if(best && bestRatio > 0.55){
        const idx = Number(best.dataset.index||0);
        if(idx !== currentIndex){
          currentIndex = idx;
          activateSlide(idx);
        }
      }
    }, { root: deckEl, threshold: buildThresholds() });

    qsa('.slide', slidesEl).forEach(sl => io.observe(sl));
  }

  function buildThresholds(){
    const arr = [];
    for(let i=0;i<=1;i+=0.05) arr.push(Number(i.toFixed(2)));
    return arr;
  }

  function setupWheelNav(){
    if(!deckEl) return;
    deckEl.addEventListener('wheel', (e)=>{
      // Allow inner scrollable areas to function normally
      const scrollable = e.target.closest('.scrollable');
      if(scrollable){ return; }
      if(isWheelLocked) return;
      const dy = e.deltaY;
      if(Math.abs(dy) < 8) return; // ignore tiny
      isWheelLocked = true;
      if(dy > 0) goTo(currentIndex+1); else goTo(currentIndex-1);
      setTimeout(()=>{ isWheelLocked = false; }, 420);
      e.preventDefault();
    }, { passive:false });
  }

  function computeTopOffset(){
    const h = topBarEl ? Math.ceil(topBarEl.getBoundingClientRect().height) : 64;
    document.documentElement.style.setProperty('--topOffset', h + 'px');
    // Compact mode toggle for short heights
    const short = window.innerHeight < 720;
    document.body.classList.toggle('compact', short);
  }

  function onResize(){
    computeTopOffset();
    fitTypography(currentSlide());
  }

  function currentSlide(){ return qsa('.slide', slidesEl)[currentIndex]; }

  function goTo(idx, smooth=true){
    if(!slidesEl || !deckEl) return;
    const total = slidesData.length;
    idx = Math.max(0, Math.min(total-1, idx));
    const target = qsa('.slide', slidesEl)[idx];
    if(!target) return;
    target.scrollIntoView({ behavior: smooth? 'smooth':'instant', block:'start' });
    // activate via observer fallback
    activateSlide(idx);
  }

  function activateSlide(idx){
    const list = qsa('.slide', slidesEl);
    list.forEach((sl, i)=>{
      sl.classList.toggle('is-active', i===idx);
      if(i===idx) fitTypography(sl);
    });
    currentIndex = idx;
    updateDots();
    updateProgress();
  }

  function updateProgress(){
    const total = Math.max(1, slidesData.length-1);
    const pct = (currentIndex/total)*100;
    if(progressBarEl) progressBarEl.style.width = pct + '%';
  }

  // Auto-fit typography per slide by adjusting --textScale
  function fitTypography(slide){
    if(!slide) return;
    const inner = qs('.inner', slide) || slide;
    // Reset
    slide.style.setProperty('--textScale','1');
    const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
    let scale = 1;
    const max = 1.08; const min = 0.85;

    const fits = ()=> inner.scrollHeight <= (slide.clientHeight - 8);

    // If overflowing, decrease
    let guard=0;
    while(!fits() && scale>min && guard<30){ scale -= 0.02; slide.style.setProperty('--textScale', String(scale)); guard++; }

    // If ample headroom, nudge up
    guard=0;
    while(fits() && scale<max && guard<10){
      const prev = scale;
      scale += 0.01; slide.style.setProperty('--textScale', String(scale)); guard++;
      if(!fits()){ scale = prev; slide.style.setProperty('--textScale', String(scale)); break; }
    }

    // Ensure practical floor sizes (approx)
    const baseBodyPx = pxValue(getComputedStyle(document.documentElement).getPropertyValue('--baseBody'));
    const approx = baseBodyPx * scale;
    if(approx < 14){ scale = clamp(14/baseBodyPx, min, 1); slide.style.setProperty('--textScale', String(scale)); }
  }

  function pxValue(val){
    // Best-effort parse of a CSS length value in px
    const d = document.createElement('div');
    d.style.position='absolute'; d.style.visibility='hidden'; d.style.width=val.trim(); document.body.appendChild(d);
    const px = d.getBoundingClientRect().width; d.remove(); return px||16;
  }

  // PDF Export
  function setupPdfExport(){
    const btn = qs('#exportPdfBtn');
    if(!btn) return;
    btn.addEventListener('click', async ()=>{
      try{
        btn.disabled = true; const old = btn.textContent; btn.textContent = 'Exporting…';
        document.body.classList.add('exportingPdf');
        // Ensure all slides marked active for full visibility
        qsa('.slide', slidesEl).forEach(sl => sl.classList.add('is-active'));

        const [h2c, jspdf] = await loadExportLibs();
        if(!h2c || !jspdf) throw new Error('Libraries not loaded');
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ orientation:'landscape', unit:'px', format:[1920,1080], compress:true });

        let stage = qs('#pdfStage');
        if(!stage){ stage = document.createElement('div'); stage.id='pdfStage'; document.body.appendChild(stage); }

        const dpr = Math.max(2, window.devicePixelRatio || 1);

        for(let i=0;i<slidesData.length;i++){
          // Prepare stage
          stage.innerHTML='';
          // Clone background layers to stage
          qsa('.bgLayer').forEach(bg=>{ stage.appendChild(bg.cloneNode(true)); });
          // Clone slide
          const src = qsa('.slide', slidesEl)[i];
          const clone = src.cloneNode(true);
          clone.classList.add('is-active');
          stage.appendChild(clone);

          // Capture
          const canvas = await h2c(stage, {
            backgroundColor: '#050611',
            scale: dpr,
            width: 1920,
            height: 1080,
            useCORS: true,
            allowTaint: true,
            logging: false
          });

          const img = canvas.toDataURL('image/png', 1.0);
          if(i>0) pdf.addPage([1920,1080], 'landscape');
          pdf.addImage(img, 'PNG', 0, 0, 1920, 1080, undefined, 'FAST');
        }

        pdf.save('FlowPitch.pdf');
        // cleanup
        document.body.classList.remove('exportingPdf');
        btn.disabled = false; btn.textContent = old;
      }catch(err){
        console.error(err);
        alert('PDF export failed. Please allow cdnjs.cloudflare.com or self-host html2canvas and jsPDF.');
        document.body.classList.remove('exportingPdf');
        const btn = qs('#exportPdfBtn'); if(btn){ btn.disabled=false; btn.textContent='Export PDF'; }
      }
    });
  }

  function loadExportLibs(){
    return new Promise(async (resolve) => {
      const needH2C = !('html2canvas' in window);
      const needPDF = !(window.jspdf && window.jspdf.jsPDF);
      const loaders = [];
      if(needH2C) loaders.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'));
      if(needPDF) loaders.push(loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'));
      try{ await Promise.all(loaders); }catch(e){ console.error('CDN load failed', e); return resolve([null,null]); }
      resolve([window.html2canvas, window.jspdf]);
    });
  }

  function loadScript(src){
    return new Promise((res, rej)=>{
      const s = document.createElement('script'); s.src = src; s.async = true; s.onload=()=>res(); s.onerror=()=>rej(new Error('Failed '+src)); document.head.appendChild(s);
    });
  }
})();
