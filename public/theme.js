(function(){
  var theme='dark';
  try{
    var stored=localStorage.getItem('autopsy.theme');
    if(stored==='light'||stored==='dark') theme=stored;
    else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches) theme='light';
  }catch(e){}
  document.documentElement.dataset.theme=theme;
})();
