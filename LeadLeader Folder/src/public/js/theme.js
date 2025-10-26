(function(){
  const root=document.documentElement, btn=document.getElementById('theme-toggle'), icon=document.getElementById('theme-icon');
  const prefersDark=()=>window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  const get=()=>localStorage.getItem('theme'); const set=t=>localStorage.setItem('theme',t);
  function apply(t){root.dataset.theme=t; if(icon){icon.innerHTML=t==='dark'
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-label="Dark"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-label="Light"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.8L6.76 4.84zM1 13h3v-2H1v2zm10-9h2V1h-2v3zm7.66 2.46l1.79-1.8-1.41-1.41-1.8 1.79 1.42 1.42zM17 13h3v-2h-3v2zM12 23h2v-3h-2v3zM4.24 19.16l-1.79 1.8 1.41 1.41 1.8-1.79-1.42-1.42zM7 13H4v-2h3v2zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>';} }
  apply(get() || (prefersDark()?'dark':'light'));
  if(btn) btn.addEventListener('click', ()=>{const next=(root.dataset.theme==='dark'?'light':'dark'); set(next); apply(next);});
})();
