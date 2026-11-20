(function(){
  /* Project Autopsy defaults to its light workspace; no dark theme is exposed in this release. */
  try{localStorage.setItem('autopsy.theme','light')}catch(e){}
  document.documentElement.dataset.theme='light';
})();
