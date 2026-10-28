/* Appearance preferences are isolated from calendar, feedback, and detector state. */
(function(){
 const THEMES=[
  {id:'original',name:'Original Sage',note:'The current warm-white and sage design.',mood:'Familiar · calm · light',colors:['#f6f7f2','#347a60','#dfefad'],decal:'No decorative overlay'},
  {id:'midnight',name:'Midnight Circuit',note:'Deep ink-blue surfaces with electric cyan signals.',mood:'Technical · crisp · deepest dark',colors:['#050913','#70ddff','#b4a6ff'],decal:'Circuit traces and connected nodes'},
  {id:'graphite',name:'Graphite',note:'A softer neutral dark mode with a restrained mint accent.',mood:'Understated · comfortable · dark',colors:['#22262d','#8bd5b1','#b1bbc8'],decal:'Subtle contour lines and a signal trace'},
  {id:'aurora',name:'Aurora Lab',note:'Plum surfaces, violet controls, and sea-glass charts.',mood:'Expressive · rounded · dark',colors:['#1d1932','#c6a8ff','#73e2d1'],decal:'Orbital rings and a small constellation'},
  {id:'daybreak',name:'Daybreak',note:'Fresh ivory panels with cobalt signals and copper details.',mood:'Bright · architectural · light',colors:['#f0f4fa','#285fc3','#b3643b'],decal:'A building-and-solar blueprint'}
 ];
 const KEY='meterwise-appearance-v1',params=new URLSearchParams(location.search),isPreview=params.get('preview')==='1';
 let saved={theme:'aurora',decals:true};
 try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x&&THEMES.some(t=>t.id===x.theme))saved={theme:x.theme,decals:typeof x.decals==='boolean'?x.decals:true};}catch(e){}
 let active=THEMES.some(t=>t.id===params.get('theme'))?params.get('theme'):saved.theme;
 let decals=params.has('decals')?params.get('decals')!=='off':saved.decals;
 const root=document.documentElement,sheet=document.querySelector('#theme-sheet');
 function apply(){root.dataset.theme=active;root.dataset.decals=decals?'on':'off';root.dataset.preview=isPreview?'true':'false';const file='themes/'+active+'.css';if(sheet&&sheet.getAttribute('href')!==file)sheet.setAttribute('href',file);}
 function remember(theme,enabled){try{localStorage.setItem(KEY,JSON.stringify({theme,decals:enabled}));return true;}catch(e){return false;}}
 apply();
 function setupDashboard(){
  if(isPreview)return;
  const header=document.querySelector('.app>header');if(!header)return;
  header.insertAdjacentHTML('afterend',`<div class="appearance-bar" aria-label="Dashboard appearance"><span class="appearance-caption">Visual style</span><label for="theme-select">Theme <select id="theme-select">${THEMES.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select></label><label><input type="checkbox" id="theme-decals"> Decorative decals</label><a class="appearance-compare" href="themes.html">Compare all five styles ↗</a><p class="appearance-status" id="appearance-status" role="status"></p></div>`);
  const select=document.querySelector('#theme-select'),toggle=document.querySelector('#theme-decals');select.value=active;toggle.checked=decals;
  function change(){active=select.value;decals=toggle.checked;apply();const ok=remember(active,decals);document.querySelector('#appearance-status').textContent=ok?'':'Theme applies for this visit; browser storage is unavailable.';const url=new URL(location.href);url.searchParams.delete('theme');url.searchParams.delete('decals');history.replaceState(null,'',url);}
  select.addEventListener('change',change);toggle.addEventListener('change',change);
 }
 function setupGallery(){
  const grid=document.querySelector('#theme-gallery');if(!grid)return;
  const toggle=document.querySelector('#gallery-decals');toggle.checked=decals;
  grid.innerHTML=THEMES.map((t,i)=>`<article class="style-card" data-style="${t.id}" aria-labelledby="style-name-${t.id}"><div class="style-card-heading"><span class="style-number">0${i+1}</span><div><h2 id="style-name-${t.id}">${t.name}</h2><p>${t.mood}</p></div><div class="palette" aria-label="Palette colors">${t.colors.map(c=>`<i style="background:${c}"></i>`).join('')}</div></div><div class="theme-thumbnail"><iframe title="${t.name} live dashboard preview" loading="${i<2?'eager':'lazy'}" tabindex="-1"></iframe></div><div class="style-card-info"><p>${t.note}</p><small>Decal: ${t.decal}</small><div class="style-card-actions"><a class="preview-link" aria-label="Open ${t.name} full preview" target="_blank" rel="noopener">Open full preview ↗</a><button type="button" aria-label="Use ${t.name}" data-use="${t.id}">Use this style</button></div></div></article>`).join('');
  function refresh(){decals=toggle.checked;for(const card of grid.querySelectorAll('.style-card')){const id=card.dataset.style,url=`index.html?theme=${id}&decals=${decals?'on':'off'}`;card.querySelector('iframe').src=url+'&preview=1';card.querySelector('.preview-link').href=url+'#overview';}}
  function size(){for(const wrapper of grid.querySelectorAll('.theme-thumbnail')){const scale=wrapper.clientWidth/1440;wrapper.style.height=(1000*scale)+'px';wrapper.querySelector('iframe').style.transform=`scale(${scale})`;}}
  refresh();size();new ResizeObserver(size).observe(grid);toggle.addEventListener('change',refresh);
  grid.querySelectorAll('[data-use]').forEach(button=>button.addEventListener('click',()=>{const ok=remember(button.dataset.use,toggle.checked);location.href=ok?'index.html#overview':`index.html?theme=${button.dataset.use}&decals=${toggle.checked?'on':'off'}#overview`;}));
 }
 document.addEventListener('DOMContentLoaded',()=>{setupDashboard();setupGallery();});
})();
