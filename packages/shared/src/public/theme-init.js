// AUTO-GENERATED from lib/theme.ts THEME_INIT_SCRIPT — do not edit by hand.
// Loaded synchronously (render-blocking) by app-src/layout to avoid theme flash.
(()=> {var t="auto";try{var s=localStorage.getItem("pi-theme");if(["light","dark","mist","rose","pine","auto"].includes(s))t=s}catch(e){}if(t==="auto")t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var r=document.documentElement;r.dataset.theme=t;r.classList.toggle("dark",t==="dark"||t==="pine")})();
