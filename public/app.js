(function(){
  'use strict';
  function defaultApiBase(){
    if(location.protocol!=='http:'&&location.protocol!=='https:')return 'http://localhost:5100';
    var host=location.hostname.toLowerCase();
    if(host.endsWith('.onrender.com')){
      var label=host.slice(0,-'.onrender.com'.length);
      if(label.endsWith('-ui'))return location.origin.replace(host,label.slice(0,-3)+'.onrender.com');
    }
    return location.origin;
  }
  function initialApiBase(){
    var fallback=defaultApiBase(),stored=storageGet('autopsy.api');
    if(!stored)return fallback;
    try{
      var storedUrl=new URL(stored);
      var storedHost=storedUrl.hostname.toLowerCase();
      if(storedUrl.protocol!=='https:'&&storedUrl.protocol!=='http:')return fallback;
      if(storedHost.endsWith('-ui.onrender.com')){
        var apiHost=storedHost.slice(0,-'-ui.onrender.com'.length)+'.onrender.com';
        var normalized=storedUrl.protocol+'//'+apiHost+(storedUrl.port?':'+storedUrl.port:'');
        if(location.hostname.toLowerCase().endsWith('.onrender.com')||storedUrl.origin===location.origin){
          storageSet('autopsy.api',normalized);
          return normalized;
        }
      }
      if(location.hostname.toLowerCase().endsWith('.onrender.com')&&storedHost.endsWith('.onrender.com')&&storedHost!==location.hostname.toLowerCase()){
        storageSet('autopsy.api',fallback);
        return fallback;
      }
    }catch(e){}
    if(fallback!==location.origin&&stored===location.origin){
      storageSet('autopsy.api',fallback);
      return fallback;
    }
    return stored;
  }
  var S={
    api:initialApiBase(),
    user:null,
    csrfToken:'',
    legacyMigrationKey:'',
    repoId:storageGet('autopsy.repoId'),
    runId:storageGet('autopsy.runId'),
    authMode:'login',authSubmitting:false,authToken:'',repo:null,analysis:null,data:{},dataErrors:[],view:'overview',timer:null,evidence:[],evidenceSeq:0,importing:false,workspaceToken:0,commitLoading:false,commitLoadToken:0,runtimeLoading:false,runtimeFilter:{from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''},runtimeEvents:[],runtimePagination:null,analysisRunsLoading:false,analysisRunsLoadToken:0,timelineLoading:false,timelineLoadToken:0,historicalLoading:false,confirmResolver:null,confirmFocus:null,historicalLoadToken:0,historicalFilter:{windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''},connectionState:'unknown',authInterrupt:false,dataRunId:'',viewScroll:{},viewFilter:{},tableSort:{},viewLoading:{},settingsFocus:null,commandPaletteFocus:null,commandPaletteIndex:0,commandPaletteQuery:'',evidenceFamily:'all',focusReturn:null,currentEvidence:null,reportLoading:false,interviewLoading:false,interpretationLoading:false,refreshLoading:false,connectionTesting:false,provenanceLoading:false,operationalLoading:false,operationalLoadToken:0,operationalTimer:null,operationalPollMs:30_000
  };
  function $(id){return document.getElementById(id)}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  function safeApiBase(value){
    var raw=String(value==null?'':value).trim().replace(/\/$/,'');
    if(!raw)throw new Error('API base URL is required.');
    var u;
    try{u=new URL(raw)}catch(e){throw new Error('API base URL is invalid.')}
    var local=['localhost','127.0.0.1','[::1]'].indexOf(u.hostname.toLowerCase())>=0;
    if(u.protocol!=='https:'&&!local)throw new Error('API base URL must use HTTPS outside localhost.');
    if(u.username||u.password||u.search||u.hash)throw new Error('API base URL must not contain credentials, query parameters or fragments.');
    return u.toString().replace(/\/$/,'');
  }
  function arr(v,k){return Array.isArray(v)?v:(v&&k&&Array.isArray(v[k])?v[k]:[])}
  function n(v){return v==null||isNaN(Number(v))?'—':new Intl.NumberFormat('en-IN').format(Number(v))}
  function date(v){if(!v)return'—';var d=new Date(v);return isNaN(d)?String(v):d.toLocaleString([],{dateStyle:'medium',timeStyle:'short'})}
  function sha(v){return v?String(v).slice(0,12):'—'}
  function pct(v){return v==null||isNaN(Number(v))?'—':(Number(v)*100).toFixed(Number(v)<.1?2:1)+'%'}
  function ms(v){return v==null?'—':n(Math.round(Number(v)))+' ms'}
  function elapsed(start,end){if(!start)return'—';var a=new Date(start),b=end?new Date(end):new Date();if(isNaN(a)||isNaN(b))return'—';var d=Math.max(0,b-a);if(d<1000)return n(d)+' ms';if(d<60000)return (d/1000).toFixed(1)+' s';return Math.floor(d/60000)+'m '+Math.floor((d%60000)/1000)+'s'}
  function cls(status){return ['completed','up_to_date','succeeded'].indexOf(status)>=0?'good':['failed','cancelled','canceled'].indexOf(status)>=0?'bad':'warn'}
  function sameRevision(a,b){return !!a&&!!b&&String(a).toLowerCase()===String(b).toLowerCase()}
  function safeExternalUrl(value){try{var u=new URL(String(value||''));return['https:','http:'].indexOf(u.protocol)>=0?u.toString():''}catch(e){return''}}
  function currentAnalysisSnapshot(){var r=S.repo||{},a=S.analysis||{};return !!(a.status==='completed'&&r.head_sha&&a.targetHeadSha&&sameRevision(r.head_sha,a.targetHeadSha))}
  function snapshotState(){
    var r=S.repo||{},a=S.analysis||{};
    if(!a.id)return{label:'No analysis snapshot',tone:'warn'};
    if(['queued','running'].indexOf(a.status)>=0)return{label:'Analysis updating',tone:'warn'};
    if(a.status==='completed'&&r.head_sha&&a.targetHeadSha&&sameRevision(r.head_sha,a.targetHeadSha))return{label:'Snapshot current',tone:'good'};
    if(a.status==='completed')return{label:'Snapshot stale',tone:'warn'};
    if(['failed','cancelled','canceled'].indexOf(a.status)>=0)return{label:'Analysis '+a.status,tone:'bad'};
    return{label:'Snapshot '+(a.status||'unknown'),tone:'warn'};
  }
  function storageGet(key){try{return sessionStorage.getItem(key)||''}catch(e){return''}}
  function themeStorageGet(){
    try{
      var value=localStorage.getItem('autopsy.theme')||'';
      return value==='light'||value==='dark'?value:'';
    }catch(e){return''}
  }
  function themeStorageSet(value){try{localStorage.setItem('autopsy.theme',value);return true}catch(e){return false}}
  function syncThemeButton(){
    var button=$('themeToggle');
    if(!button)return;
    var light=document.documentElement.dataset.theme==='light';
    button.setAttribute('aria-pressed',String(!light));
    button.setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');
    button.setAttribute('title',light?'Switch to dark theme':'Switch to light theme');
    var label=button.querySelector('.theme-toggle-label'),icon=button.querySelector('.theme-toggle-icon');
    if(label)label.textContent=light?'Dark':'Light';
    if(icon)icon.textContent=light?'☾':'☀';
  }
  function applyTheme(theme,announce,persistPreference){
    var mode=theme==='light'?'light':'dark';
    document.documentElement.dataset.theme=mode;
    if(persistPreference!==false)themeStorageSet(mode);
    var meta=$('themeColor');
    if(meta)meta.setAttribute('content',mode==='light'?'#f4f7fb':'#0a0f17');
    syncThemeButton();
    if(announce)toast((mode==='light'?'Light':'Dark')+' theme enabled.','good');
  }
  function storageSet(key,value){try{sessionStorage.setItem(key,value);return true}catch(e){return false}}
  function storageRemove(key){try{sessionStorage.removeItem(key);return true}catch(e){return false}}
  function readCookie(name){var prefix=encodeURIComponent(name)+'=';return document.cookie.split(';').map(function(x){return x.trim()}).find(function(x){return x.indexOf(prefix)===0})?.slice(prefix.length)||''}
  function toast(msg,tone){var x=$('toast');x.textContent=msg;x.style.borderColor=tone==='bad'?'#5b302c':tone==='good'?'#35523d':'#303028';x.hidden=false;clearTimeout(x._t);x._t=setTimeout(function(){x.hidden=true},3200)}
  function actionIdleLabel(action){
    if(action==='reload-view')return 'Refresh data';
    if(action==='report'){
      var rep=S.data.report,a=S.analysis||{};
      var current=!!(rep&&currentAnalysisSnapshot()&&rep.analysis&&rep.analysis.runId===S.runId&&sameRevision(rep.analysis.targetHeadSha,a.targetHeadSha));
      return current?'Generate / refresh':'Generate current report';
    }
    if(action==='interview'){
      var stories=S.data.interview,a=S.analysis||{};
      var current=!!(stories&&currentAnalysisSnapshot()&&stories.analysisRunId===S.runId&&a.status==='completed');
      return current?'Refresh stories':'Load stories';
    }
    if(action==='interpretation'){
      var i=S.data.interpretation,rep=S.data.report,a=S.analysis||{};
      var current=!!(rep&&currentAnalysisSnapshot()&&rep.analysis&&rep.analysis.runId===S.runId&&sameRevision(rep.analysis.targetHeadSha,a.targetHeadSha)&&i&&i.result&&i.result.reportFingerprint===rep.fingerprint);
      return current?'Refresh insights':'Generate insights';
    }
    if(action==='more-commits')return 'Load next 50 commits';
    if(action==='more-timeline')return 'Load next 50 timeline events';
    if(action==='analysis-runs-more')return 'Load older analysis runs';
    if(action==='runtime-filter')return 'Apply filters';
    if(action==='runtime-clear-filter')return 'Clear';
    if(action==='runtime-more')return 'Load next 40 runtime events';
    if(action==='historical-filter')return 'Apply';
    if(action==='historical-clear-filter')return 'Reset';
    if(action==='reload-data')return 'Retry evidence load';
    if(action==='reload-view')return 'Refresh data';
    return '';
  }
  function actionBusy(action,busy,busyLabel){document.querySelectorAll('#root [data-action="'+action+'"]').forEach(function(el){if(busy){if(el._autopsyBusy)return;el._autopsyBusy=true;el._autopsyIdleText=el.textContent;el.disabled=true;el.setAttribute('aria-busy','true');if(busyLabel)el.textContent=busyLabel}else{var idle=actionIdleLabel(action)||el._autopsyIdleText;el._autopsyBusy=false;el.disabled=false;el.removeAttribute('aria-busy');if(idle)el.textContent=idle;delete el._autopsyIdleText}})}
  function persist(){storageSet('autopsy.api',S.api);storageSet('autopsy.repoId',S.repoId||'');storageSet('autopsy.runId',S.runId||'')}
  function connected(state){
    var button=$('settings');
    var verified=state==='verified';
    var rejected=state==='rejected';
    if(button){
      button.textContent=verified?'Account':rejected?'Access rejected':'Sign in';
      button.setAttribute('data-auth-state',verified?'signed-in':rejected?'rejected':'signed-out');
      button.setAttribute('aria-label',verified?'Open account settings':'Sign in to your private workspace');
      button.title=verified?'Account & security settings':'Sign in to your private workspace';
    }
  }
  function banner(show,title,subtitle,status){
    var box=$('banner');
    if(!box)return;
    box.hidden=!show;
    if(!show){
      box.removeAttribute('data-analysis-state');
      box.setAttribute('aria-busy','false');
      return;
    }
    var state=status||'queued';
    var normalized=['queued','running','completed','failed'].indexOf(state)>=0?state:'queued';
    box.setAttribute('data-analysis-state',normalized);
    box.setAttribute('aria-busy',normalized==='queued'||normalized==='running'?'true':'false');
    var titleNode=$('btitle'),subNode=$('bsub'),statusNode=$('bstatus');
    if(titleNode)titleNode.textContent=title||'Analysis in progress';
    if(subNode)subNode.textContent=subtitle||'Working through the current analysis…';
    if(statusNode){
      var tone=normalized==='completed'?'good':normalized==='failed'?'bad':'warn';
      statusNode.className='pill '+tone;
      statusNode.textContent=normalized;
    }
    document.querySelectorAll('#banner .analysis-stage').forEach(function(stage){
      var stageState=stage.getAttribute('data-stage');
      var active=(normalized==='queued'&&stageState==='queued')||(normalized==='running'&&stageState==='running')||(normalized==='completed'&&stageState==='snapshot');
      stage.classList.toggle('current',active);
      stage.classList.toggle('complete',
        (normalized==='running'&&stageState==='queued')||
        (normalized==='completed'&&(stageState==='queued'||stageState==='running'||stageState==='snapshot'))||
        (normalized==='failed'&&stageState==='queued')
      );
    });
  }

  function syncAnalysisRefreshControl(){
    var b=$('refresh'),running=!!(S.analysis&&['queued','running'].indexOf(S.analysis.status)>=0);
    if(b){b.disabled=running||S.refreshLoading;b.setAttribute('aria-busy',running||S.refreshLoading?'true':'false');b.textContent=S.refreshLoading?'Refreshing…':running?'Analysis running…':'Refresh analysis'}
    syncWorkspaceMeta();
  }
  function trapFocus(container,event){if(!container||event.key!=='Tab'||container.hidden)return;var focusable=Array.prototype.slice.call(container.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(function(el){return !el.hidden&&el.getClientRects().length>0});if(!focusable.length){event.preventDefault();return}var first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
  function resetEvidence(){S.evidence=[];S.evidenceSeq=0}
  function addEvidence(label,basis,payload){var id=++S.evidenceSeq;S.evidence.push({id:id,label:label,basis:basis,payload:payload});return id}
  function inspectButton(label,basis,payload){return '<button class="inspect" data-evidence-id="'+addEvidence(label,basis,payload)+'">Inspect</button>'}
  function evidenceSummary(payload){
    var p=payload&&typeof payload==='object'?payload:{},preferred=[
      ['subject','Commit'],['path','Path'],['eventType','Event'],['event_type','Event'],['change_type','Change'],
      ['package_name','Package'],['scope','Scope'],['environment','Environment'],['operationName','Operation'],
      ['serviceName','Service'],['signalType','Signal'],['status','Status'],['analysisStatus','Analysis status'],
      ['deploymentId','Deployment'],['revisionSha','Revision'],['sha','Revision'],['committed_at','Committed'],
      ['observedAt','Observed'],['files_changed','Files changed'],['filesChanged','Files changed'],
      ['additions','Additions'],['deletions','Deletions'],['total_churn','Total churn'],['co_change_count','Co-changes']
    ],rows=[],seen={};
    preferred.forEach(function(item){
      var key=item[0],label=item[1];
      if(seen[key]||p[key]==null||p[key]==='')return;
      seen[key]=true;
      var value=p[key];
      if(key==='committed_at'||key==='observedAt')value=date(value);
      else if(typeof value==='object')value=JSON.stringify(value);
      rows.push('<div class="evidence-detail"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>');
    });
    return rows.length?rows.join(''):'<div class="evidence-detail"><span>Record</span><strong>Structured evidence available</strong></div>';
  }
  function openEvidence(id,trigger){
    var x=S.evidence.find(function(e){return e.id===Number(id)});
    if(!x)return;
    S.currentEvidence=x;S.focusReturn=trigger||document.activeElement;
    $('drawerTitle').textContent=x.label;
    $('drawerBasis').textContent=x.basis;
    if($('drawerSummary'))$('drawerSummary').innerHTML=evidenceSummary(x.payload);
    $('drawerJson').textContent=JSON.stringify(x.payload,null,2);
    if($('drawerRaw'))$('drawerRaw').open=false;
    $('drawer').hidden=false;
    requestAnimationFrame(function(){$('drawerClose').focus()});
  }
  function closeEvidence(restoreFocus){$('drawer').hidden=true;var focus=S.focusReturn;S.focusReturn=null;S.currentEvidence=null;if(restoreFocus!==false&&focus&&typeof focus.focus==='function')requestAnimationFrame(function(){try{focus.focus()}catch(e){}})}
  function closeTransientOverlays(){
    if($('commandPalette'))$('commandPalette').hidden=true;
    if($('drawer'))$('drawer').hidden=true;
    if($('modal'))$('modal').hidden=true;
    if($('confirmModal'))$('confirmModal').hidden=true;
    S.currentEvidence=null;S.focusReturn=null;S.confirmResolver=null;S.confirmFocus=null;
  }
  async function copyEvidence(){var x=S.currentEvidence;if(!x){toast('No evidence record is open','bad');return}try{await navigator.clipboard.writeText(JSON.stringify(x.payload,null,2));toast('Evidence JSON copied','good')}catch(e){toast('Clipboard access is unavailable in this browser','bad')}}
  async function copyInterviewStory(storyId){
    var payload=S.data.interview||{},stories=payload.result&&payload.result.stories||payload.stories||payload.result||[];
    if(!Array.isArray(stories))stories=Object.keys(stories||{}).map(function(k){return Object.assign({title:k},stories[k]||{})});
    var story=stories.find(function(item){return String(item.id||'')===String(storyId||'')});
    if(!story){toast('Interview story is no longer available','bad');return}
    var a=story.draftAnswer||{},v=story.verification||{},evidence=Array.isArray(story.evidence)?story.evidence:[];
    var lines=[
      'Interview question: '+(story.interviewQuestion||''),
      '',
      'Context: '+(story.context||'—'),
      '',
      'Situation: '+(a.situation||'—'),
      '',
      'Approach / evidence: '+(a.approach||'—'),
      '',
      'Evidence-backed result: '+(a.evidenceBackedResult||'—'),
      '',
      'Verification: '+(v.ownership||'Ownership verification required.')+' '+(v.runtimeImpact||'Runtime impact verification required.')
    ];
    if(evidence.length)lines.push('','Evidence references: '+evidence.map(function(item){return (item.source||'evidence')+':'+(item.key||'')}).join(' | '));
    try{await navigator.clipboard.writeText(lines.join('\n'));toast('Interview draft copied','good')}catch(e){toast('Clipboard access is unavailable in this browser','bad')}
  }
  function architectureMap(ar){
    var groups={};
    ar.forEach(function(x){var k=x.root_path||x.rootPath||x.path||'(root)';groups[k]=(groups[k]||0)+1});
    var keys=Object.keys(groups).sort(function(a,b){return groups[b]-groups[a]||a.localeCompare(b)}).slice(0,12);
    return '<div class="archmap section"><div class="arch-title"><div><h3>Observed structure map</h3><div class="sub">A visual index of directory surfaces seen in persisted architecture events; it is not a runtime dependency graph.</div></div><span class="tag">'+n(keys.length)+' surfaces</span></div><div class="archcore"><strong>'+esc((S.repo&&S.repo.name)||'Repository')+'</strong><small>persisted Git tree evidence</small></div><div class="archnodes">'+keys.map(function(k){var count=groups[k],sample=ar.filter(function(x){return (x.root_path||x.rootPath||x.path||'(root)')===k}).slice(-3);return '<div class="archnode"><b title="'+esc(k)+'">'+esc(k)+'</b><small>'+n(count)+' structural events</small>'+inspectButton('Architecture surface: '+k,'Observed directory/root-path evidence from the architecture endpoint.',{surface:k,eventCount:count,recentEvents:sample})+'</div>'}).join('')+'</div></div></div>';
  }
  async function boundedFetch(url,options,timeoutMs){var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},timeoutMs||10000),request=Object.assign({},options||{},{signal:controller.signal});try{return await fetch(url,request)}catch(e){if(e&&e.name==='AbortError')throw new Error('Connection test timed out.');throw e}finally{clearTimeout(timer)}}
  async function testConnection(){
    if(S.connectionTesting)return;
    S.connectionTesting=true;
    var verifyButton=$('testConnection');
    var verifyLabel=verifyButton&&verifyButton.textContent;
    if(verifyButton){
      verifyButton.disabled=true;
      verifyButton.setAttribute('aria-busy','true');
      verifyButton.textContent='Verifying…';
    }
    try{
      var base=safeApiBase($('api').value);
      S.api=base;
      var h=new Headers({'Accept':'application/json'});
      var health=await boundedFetch(base+'/health',{headers:h},10000);
      if(!health.ok)throw new Error('Health check returned HTTP '+health.status);
      var ready=await boundedFetch(base+'/ready',{headers:h},10000);
      if(!ready.ok)throw new Error('Backend is not ready (HTTP '+ready.status+'). Database or Redis may be unavailable.');
      var me=await boundedFetch(base+'/api/auth/me',{headers:h,credentials:'include'},10000);
      if(me.status===401){
        S.user=null;
        S.csrfToken='';
        S.connectionState='unknown';
        connected('unknown');
        throw new Error('You are not signed in.');
      }
      if(!me.ok)throw new Error('Session check returned HTTP '+me.status);
      var body=await me.json();
      if(!body||!body.user)throw new Error('The account session response is invalid.');
      S.user=body.user;
      S.connectionState='verified';
      connected('verified');
      persist();
      toast('Account session, API, database and Redis are working','good');
    }catch(e){
      var message=e&&e.message?e.message:'Connection verification failed';
      if(message==='You are not signed in.'){
        openAuth('login');
        toast(message,'warn');
      }else{
        S.connectionState='rejected';
        connected('rejected');
        toast(message,'bad');
      }
    }finally{
      S.connectionTesting=false;
      if(verifyButton){
        verifyButton.disabled=false;
        verifyButton.removeAttribute('aria-busy');
        if(verifyLabel)verifyButton.textContent=verifyLabel;
      }
    }
  }
  async function api(path,opt){
    var h=new Headers(opt&&opt.headers||{});
    h.set('Accept','application/json');
    if(opt&&opt.body)h.set('Content-Type','application/json');
    var method=(opt&&opt.method?opt.method:'GET').toUpperCase();
    if(method!=='GET'&&method!=='HEAD'&&method!=='OPTIONS'){
      var csrf=S.csrfToken||readCookie('autopsy_csrf');
      if(csrf)h.set('x-autopsy-csrf-token',csrf);
    }
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},20000);
    var requestOptions=Object.assign({},opt||{},{
      credentials:'include',
      headers:h,
      signal:controller.signal
    });
    delete requestOptions.acceptStatuses;
    try{
      var base=safeApiBase(S.api);
      var r=await fetch(base+path,requestOptions);
      var t=await r.text(),b=null,isJson=true;
      try{b=t?JSON.parse(t):null}catch(e){isJson=false}
      if(!r.ok){
        var acceptedStatuses=opt&&Array.isArray(opt.acceptStatuses)?opt.acceptStatuses:[];
        if(acceptedStatuses.indexOf(r.status)<0){
          if(r.status===401){
            if(b&&b.error&&b.error.code==='AUTH_REQUIRED'){
              S.user=null;
              S.csrfToken='';
              S.connectionState='unknown';
              connected('unknown');
              if(path!=='/api/auth/me'&&!S.authInterrupt){
                S.authInterrupt=true;
                openAuth('login');
              }
              throw new Error('Your session has expired. Sign in again.');
            }
            S.connectionState='rejected';
            connected('rejected');
            throw new Error((b&&b.error&&b.error.message)||'Authentication was rejected.');
          }
          if(r.status===403){
            throw new Error((b&&b.error&&b.error.message)||'Access to this API operation was denied.');
          }
          if(r.status===429){
            var retryAfter=r.headers.get('retry-after'),retrySeconds=Number(retryAfter||0);
            var rateLimitMessage=(b&&b.error&&b.error.message)||'Too many requests. Please retry after the current rate-limit window.';
            throw new Error(rateLimitMessage+(retrySeconds>0?' Retry after '+retrySeconds+' seconds.':''));
          }
          throw new Error((b&&b.error&&b.error.message)||'Request failed ('+r.status+').');
        }
      }
      if(!isJson)throw new Error('API returned an invalid JSON response ('+r.status+').');
      if(!b||typeof b!=='object'||Array.isArray(b))throw new Error('API returned an invalid response body ('+r.status+').');
      if(typeof b.csrfToken==='string'&&b.csrfToken)S.csrfToken=b.csrfToken;
      return b;
    }catch(e){
      if(e&&e.name==='AbortError')throw new Error('Request timed out after 20 seconds.');
      throw e;
    }finally{clearTimeout(timer)}
  }
  async function importRepo(){
    if(S.importing)return;var u=$('url').value.trim(),b=$('branch').value.trim(),payload={url:u};if(b)payload.branch=b;
    var accessToken=$('repoAccessToken')&&$('repoAccessToken').value.trim();
    if(accessToken)payload.accessToken=accessToken;
    var token=S.workspaceToken;
    try{
      $('formerr').hidden=true;$('importButton').disabled=true;S.importing=true;
      if(!S.user){
        $('formerr').textContent='Sign in is required before an analysis can start.';
        $('formerr').hidden=false;
        openAuth('login');
        return;
      }
      var r=await api('/api/repositories/import',{method:'POST',body:JSON.stringify(payload)});
      if(token!==S.workspaceToken)return;
      S.workspaceToken+=1;S.commitLoadToken+=1;S.commitLoading=false;S.runtimeLoading=false;S.analysisRunsLoading=false;S.analysisRunsLoadToken+=1;S.historicalLoading=false;S.historicalLoadToken+=1;clearInterval(S.timer);S.timer=null;
      S.repoId=r.repository.id;S.runId=r.analysis.id;S.analysis=r.analysis;S.repo={id:r.repository.id,name:r.repository.name,source_url:r.repository.source,tracked_branch:r.repository.trackedBranch,accessConfigured:!!r.repository.accessConfigured};if($('repoAccessToken'))$('repoAccessToken').value='';S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''};S.historicalFilter={windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''};S.viewFilter={};S.tableSort={};S.viewLoading={};persist();await loadRecentRepositories();workspace();setView('overview');poll();
    }catch(e){
      if(token===S.workspaceToken){$('formerr').textContent=e.message;$('formerr').hidden=false}
    }finally{
      if(token===S.workspaceToken){S.importing=false;$('importButton').disabled=false}
    }
  }
  async function getRepo(repoId){return (await api('/api/repositories/'+repoId)).repository}
  async function getRun(repoId,runId){return (await api('/api/repositories/'+repoId+'/analysis/'+runId)).analysis}
  function poll(){
    clearInterval(S.timer);var token=S.workspaceToken,repoId=S.repoId,runId=S.runId;
    banner(true,'Analysis in progress','Walking commits, source structure and evolution signals…','queued');
    var tick=async function(){
      if(token!==S.workspaceToken||repoId!==S.repoId||runId!==S.runId)return;
      try{
        var analysis=await getRun(repoId,runId);
        if(token!==S.workspaceToken||repoId!==S.repoId||runId!==S.runId)return;
        S.analysis=analysis;syncAnalysisRefreshControl();var st=analysis.status;
        if(st==='completed'){
          clearInterval(S.timer);S.timer=null;banner(false);syncAnalysisRefreshControl();
          try{
            var latestRepo=await getRepo(repoId);
            if(token===S.workspaceToken&&repoId===S.repoId&&runId===S.runId)S.repo=latestRepo;
          }catch(e){
            if(token===S.workspaceToken&&repoId===S.repoId&&runId===S.runId){
              toast('Analysis completed, but repository metadata could not be refreshed.','warn');
            }
          }
          banner(true,'Analysis complete','Loading the current workspace evidence…','completed');
          await loadViewData(S.view,{force:true});
          if(token===S.workspaceToken&&repoId===S.repoId&&runId===S.runId){banner(false);toast('Analysis complete','good')}
          return
        }
        if(st==='failed'){
          clearInterval(S.timer);S.timer=null;syncAnalysisRefreshControl();banner(true,'Analysis failed',analysis.errorMessage||'The worker reported a failure; inspect the analysis run for more detail.','failed');toast('Analysis failed','bad');return
        }
        banner(true,st==='running'?'Analysis running':'Analysis queued',st==='running'?'Persisting engineering evidence…':'Waiting for the analysis worker…',st)
      }catch(e){
        if(token!==S.workspaceToken||repoId!==S.repoId||runId!==S.runId)return;
        var message=e&&e.message?String(e.message):'Analysis status could not be checked.';
        if(/^Your session has expired\./.test(message)){
          clearInterval(S.timer);S.timer=null;S.user=null;connected('rejected');banner(true,'Session expired','Your account session has expired. Sign in again to continue.','failed');toast('Session expired. Sign in again.','warn');openAuth('login');return
        }
        if(/^Access to this API operation was denied\./.test(message)){
          clearInterval(S.timer);S.timer=null;banner(true,'Access denied','This analysis run is not accessible with the current API credentials.','failed');toast('Analysis access was denied','bad');return
        }
        if(/^Request failed \(404\)\./.test(message)){
          clearInterval(S.timer);S.timer=null;banner(true,'Analysis run unavailable','The saved analysis run no longer exists. Start a fresh analysis from this repository.','failed');toast('Saved analysis run was not found','bad');return
        }
        banner(true,'Checking analysis status','Temporary connection problem; retrying status request…','queued')
      }
    };
    tick();S.timer=setInterval(tick,2200)
  }
  async function mapLimited(items,limit,worker){var out=new Array(items.length),next=0;async function run(){while(true){var i=next++;if(i>=items.length)return;out[i]=await worker(items[i],i)}}var count=Math.min(limit||1,items.length);await Promise.all(Array.from({length:count},run));return out}
  async function loadData(){
    var token=S.workspaceToken,id=S.repoId,runId=S.runId,eps={
      commits:'/api/repositories/'+id+'/commits?page=1&limit=50',
      analysisRuns:'/api/repositories/'+id+'/analysis-runs?page=1&limit=20',
      timeline:'/api/repositories/'+id+'/timeline?page=1&limit=50',
      hotspots:'/api/repositories/'+id+'/hotspots?limit=20',
      repeated:'/api/repositories/'+id+'/repeatedly-modified-files?minTouches=3&limit=20',
      bugs:'/api/repositories/'+id+'/repeated-bug-areas?limit=20',
      coupling:'/api/repositories/'+id+'/coupling?minCoChanges=2&limit=50',
      refactors:'/api/repositories/'+id+'/refactors?limit=20',
      dependencies:'/api/repositories/'+id+'/dependencies?limit=100',
      architecture:'/api/repositories/'+id+'/architecture?limit=100',
      migrations:'/api/repositories/'+id+'/database-migrations?limit=100',
      tests:'/api/repositories/'+id+'/test-evolution?limit=100',
      testSummary:'/api/repositories/'+id+'/test-evolution/summary',
      complexity:'/api/repositories/'+id+'/complexity?limit=100',
      contributors:'/api/repositories/'+id+'/contributors?limit=25',
      runtime:'/api/repositories/'+id+'/runtime/telemetry/summary',
      runtimeEvents:'/api/repositories/'+id+'/runtime/telemetry?page=1&limit=40',
      deployments:'/api/repositories/'+id+'/deployments?limit=50',
      historicalSummary:'/api/repositories/'+id+'/runtime/historical-correlation/summary?limit=25',
      historicalCorrelation:'/api/repositories/'+id+'/runtime/historical-correlation?limit=25',
      historicalSourceContext:'/api/repositories/'+id+'/runtime/historical-correlation/source-context?limit=25'
    };
    var previousData=S.data||{},sameSnapshot=S.dataRunId===runId,keys=Object.keys(eps),out={},errs=[];
    await mapLimited(keys,6,async function(k){try{out[k]=await api(eps[k])}catch(e){out[k]=sameSnapshot?(previousData[k]??null):null;errs.push({key:k,path:eps[k],message:e.message})}});
    if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId)return;
    S.data=out;S.dataRunId=runId;S.runtimeEvents=arr(out.runtimeEvents,'events');S.runtimePagination=out.runtimeEvents&&out.runtimeEvents.pagination||null;S.dataErrors=errs;
    if(errs.length){toast(errs.length+' evidence source'+(errs.length===1?'':'s')+' unavailable; showing the remaining persisted data.','warn')}
  }
  function viewFilterMarkup(){
    var labels={history:'Filter commits, messages and timeline events…',structure:'Filter paths, packages and change surfaces…',quality:'Filter quality, test and migration evidence…',contributors:'Filter authors, paths and contribution metrics…'};
    if(!labels[S.view])return'';
    var value=S.viewFilter[S.view]||'';
    return '<div class="view-filter card"><div><label class="field"><span>Filter current view</span><input id="viewSearch" class="search" value="'+esc(value)+'" placeholder="'+esc(labels[S.view])+'" autocomplete="off" spellcheck="false" ></label><small class="view-filter-hint">Filters the already-loaded evidence locally. It does not issue new API requests.</small></div><div class="view-filter-tools"><span id="viewSearchCount" class="tag" aria-live="polite"></span><button id="viewSearchClear" class="btn" type="button">Clear</button></div></div>';
  }
  function sortableValue(text){
    var v=String(text||'').trim();
    if(!v)return{type:'text',value:''};
    var numeric=v.replace(/,/g,'').match(/^-?\d+(?:\.\d+)?(?:\s*(?:ms|s|m|d))?$/i);
    if(numeric){
      var unit=(v.match(/(ms|s|m|d)$/i)||[])[1]||'';
      var num=parseFloat(v.replace(/,/g,''));
      var factors={ms:1,s:1000,m:60000,d:86400000};
      return{type:'number',value:num*(factors[unit.toLowerCase()]||1)};
    }
    var parsed=Date.parse(v);
    if(!isNaN(parsed)&&/[0-9]{2,4}[\/-][0-9]{1,2}|[A-Za-z]{3,9}\s+\d{1,2}/.test(v))return{type:'number',value:parsed};
    return{type:'text',value:v.toLowerCase()};
  }
  function sortTable(table,index,direction){
    var body=table.tBodies&&table.tBodies[0],rows=body?Array.prototype.slice.call(body.rows):[];
    if(!rows.length)return;
    rows=rows.filter(function(row){return row.getAttribute('data-empty-state')!=='true'});
    rows.forEach(function(row,pos){row.__autopsySortPosition=pos});
    rows.sort(function(a,b){
      var av=sortableValue(a.cells[index]&&a.cells[index].textContent),bv=sortableValue(b.cells[index]&&b.cells[index].textContent);
      if(av.type==='number'&&bv.type==='number')return (av.value-bv.value)*direction||a.__autopsySortPosition-b.__autopsySortPosition;
      var ax=String(av.value),bx=String(bv.value);
      return (ax<bx?-1:ax>bx?1:0)*direction||a.__autopsySortPosition-b.__autopsySortPosition;
    });
    rows.forEach(function(row){body.appendChild(row);delete row.__autopsySortPosition});
  }
  function bindTableSorts(){
    var tables=Array.prototype.slice.call(document.querySelectorAll('#root .table table'));
    tables.forEach(function(table,tableIndex){
      var heads=table.tHead&&table.tHead.rows[0]?Array.prototype.slice.call(table.tHead.rows[0].cells):[];
      heads.forEach(function(th,column){
        if(!String(th.textContent||'').trim())return;
        th.classList.add('sortable-head');th.setAttribute('tabindex','0');th.setAttribute('role','button');th.setAttribute('title','Sort this column');
        var key=S.view+':'+tableIndex+':'+column,stored=S.tableSort[key],direction=stored&&stored.direction||1;
        th.setAttribute('aria-sort',stored?(direction===1?'ascending':'descending'):'none');
        th.onclick=function(){
          var current=S.tableSort[key],next=current?-current.direction:1;
          S.tableSort[key]={direction:next};sortTable(table,column,next);
          heads.forEach(function(other){if(other!==th)other.setAttribute('aria-sort','none')});
          th.setAttribute('aria-sort',next===1?'ascending':'descending');
        };
        th.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();th.click()}};
        if(stored)sortTable(table,column,direction);
      });
    });
  }
  function ensureTableEmptyStates(){
    document.querySelectorAll('#root .table table').forEach(function(table){
      var body=table.tBodies&&table.tBodies[0];
      if(!body||body.rows.length)return;
      var row=document.createElement('tr');
      row.setAttribute('data-empty-state','true');
      var cell=document.createElement('td');
      cell.colSpan=Math.max(1,table.tHead&&table.tHead.rows.length?table.tHead.rows[0].cells.length:1);
      cell.className='dim';
      cell.textContent='No evidence is available in this table.';
      row.appendChild(cell);body.appendChild(row);
    });
  }
  function applyViewFilter(){
    var input=$('viewSearch'),term=input?input.value.trim().toLowerCase():'';
    if(input)S.viewFilter[S.view]=input.value;
    var rows=Array.prototype.slice.call(document.querySelectorAll('#root tbody tr,#root .timeline .item'));
    var shown=0;
    rows.forEach(function(row){
      if(row.getAttribute('data-empty-state')==='true'){row.hidden=true;return}
      var text=String(row.textContent||'').toLowerCase();
      var match=!term||text.indexOf(term)>=0;
      row.hidden=!match;
      if(match)shown++;
    });
    var count=$('viewSearchCount');
    if(count)count.textContent=term?(shown+' match'+(shown===1?'':'es')):shown+' visible rows';
    var empty=$('viewSearchEmpty');
    if(empty)empty.hidden=shown!==0||!term;
  }
  function bindViewSearch(){
    var input=$('viewSearch'),clear=$('viewSearchClear');
    if(!input)return;
    input.oninput=applyViewFilter;
    if(clear)clear.onclick=function(){input.value='';S.viewFilter[S.view]='';applyViewFilter();input.focus()};
    var wrap=input.closest('.view-filter');
    if(wrap&&!$('viewSearchEmpty')){
      var empty=document.createElement('div');
      empty.id='viewSearchEmpty';
      empty.className='empty view-search-empty';
      empty.hidden=true;
      empty.textContent='No loaded rows match this filter.';
      wrap.parentNode.insertBefore(empty,wrap.nextSibling);
    }
    applyViewFilter();
  }
  function viewSourceStatusMarkup(){
    var keys=VIEW_DATA[S.view]||[];
    if(!keys.length||S.dataRunId!==S.runId)return '';
    var errors=S.dataErrors.filter(function(error){return keys.indexOf(error.key)>=0;});
    var loaded=keys.length-errors.length;
    var tone=errors.length?'warn':'good';
    var label=errors.length?loaded+' / '+keys.length+' sources loaded':'All '+keys.length+' evidence sources loaded';
    var detail=errors.length?' · '+errors.length+' source'+(errors.length===1?'':'s')+' unavailable':' · snapshot aligned';
    return '<div class="view-source-status '+tone+'" role="status"><span class="view-source-dot" aria-hidden="true"></span><div><span class="kicker">SOURCE HEALTH</span><strong>'+esc(label)+'</strong></div><small>'+esc(detail)+'</small></div>';
  }
    const VIEW_WORKFLOW={
    overview:['Read snapshot','Trace history','Choose output'],
    history:['Trace commits','Inspect event','Map structure'],
    structure:['Map shape','Inspect change','Validate quality'],
    quality:['Find signal','Inspect evidence','Compare runtime'],
    runtime:['Filter observations','Inspect provenance','Build report'],
    report:['Read claims','Inspect evidence','Prepare story'],
    interview:['Review story','Verify refs','Use as scaffold'],
    interpretation:['Generate from report','Inspect grounding','Test uncertainty'],
    evidence:['Filter family','Inspect record','Return to context'],
    contributors:['Read contribution','Inspect Git evidence','Add context'],
    operations:['Check service','Inspect dependencies','Return to snapshot']
  };

function shell(title,desc,actions){
    var snap=snapshotState();
    var loading=!!S.viewLoading[S.view];
    var reload=RELOADABLE_VIEWS.indexOf(S.view)>=0?'<button class="btn" data-action="reload-view"'+(loading?' disabled aria-busy="true"':'')+'>'+(loading?'Refreshing…':'Refresh data')+'</button>':'';
    var source=safeExternalUrl(S.repo&&(S.repo.source_url||S.repo.sourceUrl));
    var sourceAction=source?'<a class="btn link" href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Source repository ↗</a>':'';
    var stepIndex=WORKFLOW_STEPS.findIndex(function(step){return step.id===S.view});
    return '<div class="page-header"><div class="page-header-copy"><div class="kicker">WORKSPACE / '+esc((VIEW_TITLES[S.view]||title).toUpperCase())+'</div><div class="page-header-title"><h2>'+esc(title)+'</h2><span class="snapshot-pill '+esc(snap.tone)+'">'+esc(snap.label)+'</span></div><p>'+esc(desc)+'</p></div><div class="actions">'+(actions||'')+reload+sourceAction+'</div></div>'+
      viewFlowMarkup()+
      (stepIndex<0||!S.repoId?'':viewSourceStatusMarkup());
  }
  const WORKFLOW_STEPS=[
    {number:'01',id:'overview',label:'Overview',detail:'Start from the current analysis snapshot and run boundary.'},
    {number:'02',id:'history',label:'History',detail:'Trace chronological commits and timeline evidence.'},
    {number:'03',id:'structure',label:'Structure',detail:'Understand architecture, dependency and complexity changes.'},
    {number:'04',id:'quality',label:'Quality',detail:'Investigate tests, repeated changes, refactors and bug-area signals.'},
    {number:'05',id:'runtime',label:'Runtime',detail:'Inspect telemetry, deployment and historical provenance evidence.'},
    {number:'06',id:'report',label:'Report',detail:'Read the bounded evidence-backed engineering report.'},
    {number:'07',id:'interview',label:'Interview',detail:'Turn evidence into verifiable talking-point scaffolds.'},
    {number:'08',id:'interpretation',label:'Insights',detail:'Ground interpretation in current report claims and uncertainty.'},
    {number:'09',id:'evidence',label:'Evidence',detail:'Search and inspect the exact persisted records.'},
    {number:'10',id:'contributors',label:'Contributors',detail:'Use literal author history as additional evidence context.'},
    {number:'11',id:'operations',label:'Operations',detail:'Check live service health separately from repository evidence.'}
  ];

  const VIEW_FLOW={
    overview:{previous:null,next:"history",nextLabel:"Open History",nextWhy:"Trace the commit timeline behind this snapshot."},
    history:{previous:"overview",next:"structure",nextLabel:"Open Structure",nextWhy:"See how the codebase shape changed."},
    structure:{previous:"history",next:"quality",nextLabel:"Validate Quality",nextWhy:"Check tests, repeated changes and refactor signals."},
    quality:{previous:"structure",next:"runtime",nextLabel:"Open Runtime",nextWhy:"Connect engineering signals to runtime and deployment evidence."},
    runtime:{previous:"quality",next:"report",nextLabel:"Build Report",nextWhy:"Turn the current evidence snapshot into a readable output."},
    report:{previous:"runtime",next:"interview",nextLabel:"Open Interview",nextWhy:"Turn evidence-backed findings into verifiable talking points."},
    interview:{previous:"report",next:"interpretation",nextLabel:"Open Insights",nextWhy:"Ground the current report into themes, questions and uncertainties."},
    interpretation:{previous:"interview",next:"evidence",nextLabel:"Inspect Evidence",nextWhy:"Verify the exact records behind the current insights."},
    evidence:{previous:"interpretation",next:"contributors",nextLabel:"Open Contributors",nextWhy:"Add contributor history as context for the evidence."},
    contributors:{previous:"evidence",next:"operations",nextLabel:"Check Operations",nextWhy:"Separate live service health from repository evidence."},
    operations:{previous:"contributors",next:"overview",nextLabel:"Return to Overview",nextWhy:"Start another inspection pass from the current snapshot."}
  };
  function viewFlowMarkup(){
    var steps=Array.isArray(WORKFLOW_STEPS)?WORKFLOW_STEPS:[];
    var idx=steps.findIndex(function(step){return step.id===S.view});
    if(idx<0)idx=0;
    var previous=idx>0?steps[idx-1]:null,next=idx<steps.length-1?steps[idx+1]:null;
    var rail=steps.map(function(step,i){
      var state=i===idx?' current':i<idx?' past':'';
      return '<a class="workspace-flow-step'+state+'" href="#'+esc(step.id)+'"'+(i===idx?' aria-current="step"':'')+'><span class="workspace-flow-index">'+esc(step.number)+'</span><span class="workspace-flow-label">'+esc(step.label)+'</span></a>';
    }).join('<span class="workspace-flow-connector" aria-hidden="true">→</span>');
    return '<section class="view-flow" aria-label="Workspace navigation">'+
      '<div class="view-flow-head"><div class="view-flow-copy"><span class="kicker">WORKSPACE NAVIGATION</span><strong>'+esc(VIEW_TITLES[S.view]||S.view)+'</strong><small>Move through the same repository snapshot. Navigation does not create a new analysis.</small></div><div class="view-flow-meta"><span>STEP '+(idx+1)+' / '+steps.length+'</span><span>'+esc(S.view)+'</span></div></div>'+
      '<div class="workspace-flow-rail">'+rail+'</div>'+
      '<div class="view-flow-actions">'+(previous?'<a class="btn link view-flow-link" href="#'+esc(previous.id)+'">← '+esc(previous.label)+'</a>':'')+(next?'<a class="btn primary view-flow-link" href="#'+esc(next.id)+'">'+esc(next.label)+' →</a>':'')+'</div>'+
    '</section>';
  }
  const VIEW_GUIDANCE={
    overview:{answer:'Start here. Read the current snapshot, run boundary and recent changes before opening derived outputs.',next:'Next: open History for chronology, Structure for codebase shape, or Report when you need a shareable output.'},
    history:{answer:'Trace what changed and when. Open Inspect on a commit or timeline event to see the exact persisted record.',next:'Next: use Structure to understand what those changes did to the codebase shape.'},
    structure:{answer:'Understand the repository shape: architecture events, dependencies, complexity and coupled changes.',next:'Next: open Inspect on a surface or signal when you need the supporting evidence.'},
    quality:{answer:'Validate engineering signals across tests, repeated changes, bug areas, refactors and migrations.',next:'Next: treat signals as evidence to investigate, not as a score. Inspect rows before drawing conclusions.'},
    runtime:{answer:'Connect runtime telemetry and deployment records to explicit revisions without inventing causality.',next:'Next: apply filters, inspect a deployment or event, then compare it with the relevant Git evidence.'},
    report:{answer:'Read the current evidence-backed report as a structured engineering summary.',next:'Next: use the section actions to jump around, then inspect evidence for any claim you want to verify.'},
    interview:{answer:'Use evidence-linked story scaffolds to prepare truthful explanations of engineering work.',next:'Next: open story evidence and verify ownership and runtime impact before reusing a draft.'},
    interpretation:{answer:'Generate insights only from a current report and keep cited claims and uncertainties visible.',next:'Next: generate or refresh insights after the current report is ready, then inspect cited evidence.'},
    evidence:{answer:'Search the loaded evidence index and inspect the exact record behind a signal, claim or timeline event.',next:'Next: narrow locally with search, then use Inspect. This view does not mutate the analysis.'},
    contributors:{answer:'Understand who contributed and how their changes appear across the persisted history.',next:'Next: use the contributor evidence as context, then follow the linked repository history for detail.'},
    operations:{answer:'Monitor the running API, PostgreSQL, Redis and analysis queue separately from repository evidence.',next:'Next: refresh live status when needed; operational telemetry never rewrites repository evidence.'}
  };
  const VIEW_DATA={overview:['commits','analysisRuns','hotspots','contributors'],history:['commits','timeline'],structure:['architecture','dependencies','complexity','coupling'],quality:['bugs','repeated','refactors','migrations','tests','testSummary'],runtime:['runtime','runtimeEvents','deployments','historicalSummary','historicalCorrelation','historicalSourceContext'],evidence:['commits','timeline','hotspots','architecture','dependencies','complexity','coupling','bugs','repeated','refactors','migrations','tests','testSummary','runtime','runtimeEvents','deployments','historicalSummary','historicalCorrelation','historicalSourceContext'],contributors:['contributors']};
  const RELOADABLE_VIEWS=['overview','history','structure','quality','evidence','contributors'];
  const VIEW_LABELS={overview:['Engineering overview','Loading the workspace evidence needed for the overview…'],history:['History','Loading chronological repository evidence…'],structure:['Structure','Loading architecture and codebase-structure evidence…'],quality:['Quality evidence','Loading historical quality signals…'],runtime:['Runtime & provenance','Loading runtime and deployment evidence…'],evidence:['Evidence explorer','Loading the evidence index…'],contributors:['Contributors','Loading contributor history…'],operations:['Operations','Checking live service health and queue telemetry…']};
  function viewEndpoints(id){return {commits:'/api/repositories/'+id+'/commits?page=1&limit=50',analysisRuns:'/api/repositories/'+id+'/analysis-runs?page=1&limit=20',timeline:'/api/repositories/'+id+'/timeline?page=1&limit=50',hotspots:'/api/repositories/'+id+'/hotspots?limit=20',repeated:'/api/repositories/'+id+'/repeatedly-modified-files?minTouches=3&limit=20',bugs:'/api/repositories/'+id+'/repeated-bug-areas?limit=20',coupling:'/api/repositories/'+id+'/coupling?minCoChanges=2&limit=50',refactors:'/api/repositories/'+id+'/refactors?limit=20',dependencies:'/api/repositories/'+id+'/dependencies?limit=100',architecture:'/api/repositories/'+id+'/architecture?limit=100',migrations:'/api/repositories/'+id+'/database-migrations?limit=100',tests:'/api/repositories/'+id+'/test-evolution?limit=100',testSummary:'/api/repositories/'+id+'/test-evolution/summary',complexity:'/api/repositories/'+id+'/complexity?limit=100',contributors:'/api/repositories/'+id+'/contributors?limit=25',runtime:'/api/repositories/'+id+'/runtime/telemetry/summary',runtimeEvents:'/api/repositories/'+id+'/runtime/telemetry?page=1&limit=40',deployments:'/api/repositories/'+id+'/deployments?limit=50',historicalSummary:'/api/repositories/'+id+'/runtime/historical-correlation/summary?limit=25',historicalCorrelation:'/api/repositories/'+id+'/runtime/historical-correlation?limit=25',historicalSourceContext:'/api/repositories/'+id+'/runtime/historical-correlation/source-context?limit=25'};}
  function hasViewData(view){var keys=VIEW_DATA[view]||[];return !!keys.length&&S.dataRunId===S.runId&&!keys.some(function(k){return S.data[k]===undefined||S.data[k]===null})}
  async function loadViewData(view,options){options=options||{};var keys=VIEW_DATA[view]||[];if(!keys.length||(!options.force&&hasViewData(view))||!S.repoId||S.viewLoading[view])return;var token=S.workspaceToken,id=S.repoId,runId=S.runId;S.viewLoadToken=(S.viewLoadToken||0)+1;var loadToken=S.viewLoadToken;var hadExisting=hasViewData(view);var presentationTimer=null;S.viewLoading[view]=loadToken;actionBusy('reload-view',true,'Refreshing…');try{var label=VIEW_LABELS[view]||[view,'Loading evidence…'];presentationTimer=window.setTimeout(function(){if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId||loadToken!==S.viewLoadToken||S.view!==view)return;if(view==='overview'){if(hadExisting)showViewRefreshState(label[0],label[1]);else $('root').innerHTML=overviewLoadingPage();}else $('root').innerHTML=loadingPage(label[0],label[1]);},180);var eps=viewEndpoints(id),out={},errs=[];await mapLimited(keys,6,async function(k){try{out[k]=await api(eps[k])}catch(e){out[k]=S.data[k]??null;errs.push({key:k,path:eps[k],message:e.message})}});if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId||loadToken!==S.viewLoadToken||S.view!==view)return;Object.keys(out).forEach(function(k){S.data[k]=out[k]});S.dataRunId=runId;S.dataErrors=S.dataErrors.filter(function(e){return keys.indexOf(e.key)<0}).concat(errs);if(view==='runtime'){S.runtimeEvents=arr(S.data.runtimeEvents,'events');S.runtimePagination=S.data.runtimeEvents&&S.data.runtimeEvents.pagination||null}if(errs.length===keys.length&&!hadExisting){$('root').innerHTML=errorPage(label[0],'The evidence needed for this view could not be loaded. No new analysis was started.','Retry evidence load','reload-view');toast('Evidence load failed; retry the current view.','bad');return}if(S.viewLoading[view]===loadToken)delete S.viewLoading[view];setView(view,{skipLoad:true});if(errs.length)toast(errs.length+' evidence source'+(errs.length===1?'':'s')+' unavailable; showing the remaining persisted data.','warn')}finally{if(presentationTimer)window.clearTimeout(presentationTimer);if(S.viewLoading[view]===loadToken)delete S.viewLoading[view];if(S.view===view)actionBusy('reload-view',false)}}

  function metric(label,val,sub){return '<div class="card"><div class="metric">'+esc(val)+'</div><div class="metric-label">'+esc(label)+'</div>'+(sub?'<div class="sub">'+esc(sub)+'</div>':'')+'</div>'}
  function loadingPage(title,message){
    return shell(title,message,'')+'<div class="card loading-state"><div class="loading-orb"><span></span></div><div><strong>Working through the current evidence</strong><p>Nothing new is being inferred while this loads. Your existing snapshot stays intact.</p></div></div>';
  }
  function showViewRefreshState(title,message){
    var root=$('root');
    if(!root)return;
    root.setAttribute('aria-busy','true');
    root.setAttribute('data-refreshing-view','true');
    var current=document.getElementById('viewRefreshState');
    if(current)current.remove();
    var node=document.createElement('div');
    node.id='viewRefreshState';
    node.className='view-refresh-state';
    node.setAttribute('role','status');
    node.innerHTML='<span class="view-refresh-spinner" aria-hidden="true"></span><div><strong>'+esc(title||'Refreshing evidence')+'</strong><small>'+esc(message||'Keeping the current snapshot visible while fresh evidence loads.')+'</small></div>';
    root.insertBefore(node,root.firstChild);
  }
  function overviewLoadingPage(){
    return shell('Overview','Loading the current repository snapshot and its evidence index.')+
      '<div class="loading-state" aria-busy="true"><div class="loading-orb" aria-hidden="true"></div><div><strong>Preparing the command center</strong><p>Loading persisted repository evidence for this analysis run. No new analysis is started.</p></div></div>'+
      '<div class="grid g4"><div class="card"><div class="metric">—</div><div class="metric-label">Commits</div></div><div class="card"><div class="metric">—</div><div class="metric-label">Hotspots</div></div><div class="card"><div class="metric">—</div><div class="metric-label">Contributors</div></div><div class="card"><div class="metric">—</div><div class="metric-label">Snapshot</div></div></div>';
  }
  function errorPage(title,message,actionLabel,action){
    return shell(title,'The workspace could not complete this action. The existing evidence snapshot is unchanged.','')+'<div class="card error-state"><div class="error-mark">!</div><div><strong>'+esc(message)+'</strong><p>Retry the operation without starting a new repository analysis.</p><button class="btn primary" data-action="'+esc(action)+'">'+esc(actionLabel||'Try again')+'</button></div></div>';
  }
  function overview(){
    var r=S.repo||{},a=S.analysis||{},d=S.data||{};
    var commits=arr(d.commits,'commits'),hotspots=arr(d.hotspots,'hotspots'),contributors=arr(d.contributors,'contributors'),runs=arr(d.analysisRuns,'runs');
    var snapshot=snapshotState(),current=currentAnalysisSnapshot();
    var repoName=r.name||'Repository',branchName=r.tracked_branch||r.trackedBranch||r.default_branch||r.defaultBranch||'branch unavailable';
    var head=r.head_sha||r.headSha||'',target=a.targetHeadSha||'',analysisStatus=a.status||'unknown',analysisMode=a.mode||'full';
    var totalCommits=d.commits&&d.commits.pagination&&d.commits.pagination.total,totalHotspots=d.hotspots&&d.hotspots.pagination&&d.hotspots.pagination.total,totalContributors=d.contributors&&d.contributors.pagination&&d.contributors.pagination.total;
    function readinessRow(index,label,detail,ok,warning){
      var state=ok?'<span class="readiness-state good">available</span>':warning?'<span class="readiness-state warn">attention</span>':'<span class="readiness-state">not loaded</span>';
      return '<div class="readiness-row"><span class="readiness-index">'+index+'</span><div><strong>'+esc(label)+'</strong><small>'+esc(detail)+'</small></div>'+state+'</div>';
    }
    function stat(label,value,detail){return '<div class="overview-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></div>'}
    function commitRow(x){
      var subject=x.subject||x.message||'Repository change',author=x.author_name||x.authorName||x.author||'Unknown author';
      return '<div class="commit-row"><div class="commit-sha">'+esc(sha(x.sha))+'</div><div><strong>'+esc(subject)+'</strong><small>'+esc(author)+'</small></div><div class="commit-time">'+esc(date(x.committed_at||x.committedAt||x.timestamp))+'</div></div>';
    }
    function hotspotRow(x){
      var touched=x.commits_touched??x.commitsTouched??x.commits??x.count??null;
      return '<div class="signal-row"><span class="signal-dot"></span><div><strong>'+esc(x.path||x.file||'Hotspot')+'</strong><small>'+esc(touched==null?'Historical file-activity signal':'Touched in '+n(touched)+' loaded commits')+'</small></div><span class="signal-value">'+(touched==null?'—':n(touched))+'</span></div>';
    }
    var readiness=
      readinessRow('01','Analysis snapshot',current?'Current repository head is aligned with the completed analysis.':'The stored analysis is not aligned with the current repository head.',current,!current&&analysisStatus==='completed')+
      readinessRow('02','Git history',commits.length?'Commit evidence is loaded for this snapshot.':'No commit rows are loaded.',commits.length,false)+
      readinessRow('03','Structure',d.architecture!=null?'Structure evidence is loaded.':'Open Structure to load architecture evidence.',d.architecture!=null,false)+
      readinessRow('04','Quality',d.bugs!=null||d.tests!=null?'Quality evidence is loaded.':'Open Quality to load quality evidence.',d.bugs!=null||d.tests!=null,false)+
      readinessRow('05','Runtime',d.runtime!=null||d.runtimeEvents!=null?'Runtime evidence is available.':'Runtime evidence has not been loaded yet.',d.runtime!=null||d.runtimeEvents!=null,false);

    var sourceUrl=safeExternalUrl(r.source_url||r.sourceUrl);
    return shell('Overview','Start from the current snapshot, understand its boundary, then choose the evidence surface that answers the next engineering question.',
      '<button class="btn primary" data-action="report">Build report</button><button class="btn" data-action="refresh">Refresh analysis</button>')+
      '<section class="overview-hero">'+
        '<div class="overview-command"><div class="kicker">CURRENT ENGINEERING CONTEXT</div><div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:6px"><h3 style="margin:0;font-size:20px">'+esc(repoName)+'</h3><span class="tag">'+esc(analysisMode)+' analysis</span></div>'+
        '<p>'+esc(current?'This workspace is aligned to the repository head and can be used as the current evidence snapshot.':'The repository has moved or the analysis is not complete. Treat downstream outputs as snapshot-bound until the current revision is analyzed.')+'</p>'+
        '<div class="overview-identity">'+
          '<div class="identity-row"><span>Branch</span><strong class="mono">'+esc(branchName)+'</strong></div>'+
          '<div class="identity-row"><span>Repository head</span><strong class="mono">'+esc(head||'unavailable')+'</strong></div>'+
          '<div class="identity-row"><span>Analysis target</span><strong class="mono">'+esc(target||'unavailable')+'</strong></div>'+
          '<div class="identity-row"><span>Revision relation</span><strong>'+esc(current?'same revision':'different revision')+'</strong></div>'+
          '<div class="identity-row"><span>Analysis state</span><strong>'+esc(analysisStatus)+'</strong></div>'+
          '<div class="identity-row"><span>Analysis run</span><strong class="mono">'+esc(a.id||S.runId||'unavailable')+'</strong></div>'+
        '</div>'+(sourceUrl?'<div style="margin-top:12px"><a class="btn link" href="'+esc(sourceUrl)+'" target="_blank" rel="noopener noreferrer">Open source repository ↗</a></div>':'')+
        '</div>'+
        '<aside class="overview-side"><div class="side-heading"><div><h3>Workspace readiness</h3><small>Loaded evidence surfaces</small></div><span class="tag">'+esc(snapshot.label)+'</span></div><div class="readiness-list">'+readiness+'</div></aside>'+
      '</section>'+
      '<section class="overview-stat-strip">'+
        stat('COMMITS',n(totalCommits??commits.length),totalCommits!=null?'persisted total':'loaded sample')+
        stat('HOTSPOTS',n(totalHotspots??hotspots.length),totalHotspots!=null?'persisted total':'loaded sample')+
        stat('CONTRIBUTORS',n(totalContributors??contributors.length),totalContributors!=null?'persisted total':'loaded sample')+
        stat('ANALYSIS RUNS',n(runs.length),runs.length?'loaded runs':'current run context')+
      '</section>'+
      '<section class="overview-grid section">'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">SIGNALS TO INVESTIGATE</div><h3>Where the snapshot deserves attention</h3></div><small>Signals are not conclusions.</small></div><div class="signal-list">'+
          (hotspots.slice(0,8).map(hotspotRow).join('')||'<div class="empty"><strong>No hotspot rows are loaded.</strong>Open Structure or refresh this view to load more evidence.</div>')+
        '</div></div>'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">NEXT INSPECTION</div><h3>Choose the evidence surface</h3></div></div><div class="next-actions">'+
          '<a class="next-action" href="#history"><span>02</span><strong>Trace history</strong><small>See when important changes occurred.</small></a>'+
          '<a class="next-action" href="#structure"><span>03</span><strong>Map structure</strong><small>Understand architecture, dependencies and coupling.</small></a>'+
          '<a class="next-action" href="#quality"><span>04</span><strong>Validate quality</strong><small>Inspect tests, refactors and repeated-change signals.</small></a>'+
          '<a class="next-action" href="#runtime"><span>05</span><strong>Check runtime</strong><small>Compare observed telemetry with explicit revisions.</small></a>'+
          '<a class="next-action" href="#evidence"><span>09</span><strong>Inspect evidence</strong><small>Open the underlying persisted records.</small></a>'+
          '<a class="next-action" href="#operations"><span>11</span><strong>Check operations</strong><small>Separate live service health from repository evidence.</small></a>'+
        '</div></div>'+
      '</section>'+
      '<section class="card section"><div class="panel-head"><div><div class="kicker">RECENT HISTORY</div><h3>Latest repository changes</h3></div><small>'+esc(commits.length?(totalCommits!=null?n(totalCommits)+' persisted commits · showing loaded page':n(commits.length)+' loaded commits'):'No commit evidence loaded')+'</small></div><div class="commit-list">'+
        (commits.slice(0,8).map(commitRow).join('')||'<div class="empty"><strong>No commit evidence is loaded.</strong> Open History to inspect the repository timeline.</div>')+
      '</div></section>';
  }
  function historyView(){
    var d=S.data||{},c=arr(d.commits,'commits'),t=arr(d.timeline,'events');
    var commitPagination=d.commits&&d.commits.pagination||{},timelinePagination=d.timeline&&d.timeline.pagination||{};
    var actions=[];
    if(commitPagination.totalPages&&commitPagination.page<commitPagination.totalPages)actions.push('<button class="btn" data-action="more-commits">'+(S.commitLoading?'Loading…':'Load next 50 commits')+'</button>');
    if(timelinePagination.totalPages&&timelinePagination.page<timelinePagination.totalPages)actions.push('<button class="btn" data-action="more-timeline">'+(S.timelineLoading?'Loading…':'Load next 50 timeline events')+'</button>');
    var counts={};
    t.forEach(function(x){var key=x.eventType||'change';counts[key]=(counts[key]||0)+1});
    var signalTypes=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]||a.localeCompare(b)}).slice(0,7);
    var signalMax=Math.max(1,...signalTypes.map(function(k){return counts[k]}));
    var newest=c[0],oldest=c[c.length-1];
    function commitFootprint(x){
      return '<div class="footprint-row"><span class="mono">'+esc(sha(x.sha))+'</span><strong>'+esc(x.subject||'Repository change')+'</strong><small>'+n(x.files_changed??x.filesChanged??0)+' files · +'+n(x.additions??0)+' / −'+n(x.deletions??0)+'</small></div>';
    }
    function timelineItem(x){
      return '<div class="item"><i></i><strong>'+esc(x.subject||'Timeline event')+'</strong><p><span class="tag">'+esc(x.eventType||'change')+'</span> · <span class="mono">'+esc(sha(x.sha))+'</span> · '+esc(date(x.committed_at||x.committedAt))+'</p>'+inspectButton('Inspect timeline '+sha(x.sha),'Descriptive timeline classification attached to persisted commit evidence.',x)+'</div>';
    }
    return shell('History','Trace the repository chronologically. This page separates the raw commit ledger from descriptive timeline signals so neither is mistaken for developer intent.',actions.join(''))+
      '<section class="history-signalbar">'+
        '<div class="history-stat"><span>LOADED COMMITS</span><b>'+n(c.length)+'</b><small>'+(commitPagination.total!=null?n(commitPagination.total)+' persisted':'current page')+'</small></div>'+
        '<div class="history-stat"><span>LOADED EVENTS</span><b>'+n(t.length)+'</b><small>'+(timelinePagination.total!=null?n(timelinePagination.total)+' persisted':'current page')+'</small></div>'+
        '<div class="history-stat"><span>NEWEST COMMIT</span><b>'+esc(newest?date(newest.committed_at||newest.committedAt):'—')+'</b><small>Newest loaded repository event</small></div>'+
        '<div class="history-stat"><span>OLDEST LOADED</span><b>'+esc(oldest?date(oldest.committed_at||oldest.committedAt):'—')+'</b><small>Oldest commit currently in the ledger</small></div>'+
      '</section>'+
      '<section class="history-overview section">'+
        '<div class="card"><div class="overview-card-head"><div><div class="kicker">TIMELINE SIGNALS</div><h3>How the change history is being classified</h3><div class="sub">These labels come from persisted commit-subject classification. They are useful navigation signals, not proof of intent.</div></div><span class="tag">'+n(signalTypes.length)+' visible classes</span></div>'+
          '<div class="signal-bars section">'+(signalTypes.map(function(k){return '<div class="signal-bar"><div class="signal-label"><span>'+esc(k)+'</span><span>'+n(counts[k])+'</span></div><div class="track"><div class="fill" style="width:'+((counts[k]/signalMax)*100).toFixed(1)+'%"></div></div></div>'}).join('')||'<div class="empty"><strong>No timeline classifications loaded.</strong> The raw commit ledger can still be inspected below.</div>')+'</div>'+
          '<div class="callout section">Interpretation boundary: a subject can be classified as a refactor, bug fix or similar signal, but that classification does not establish why the developer made the change.</div>'+
        '</div>'+
        '<div class="card"><div class="overview-card-head"><div><div class="kicker">CHANGE FOOTPRINT</div><h3>Recent commits at a glance</h3><div class="sub">Files and churn make the chronological ledger easier to scan before opening individual records.</div></div></div><div class="commit-footprint">'+(c.slice(0,8).map(commitFootprint).join('')||'<div class="empty"><strong>No commit evidence.</strong> Refresh History to load the current ledger.</div>')+'</div></div>'+
      '</section>'+
      '<section class="grid g2 section">'+
        '<div class="card"><div class="overview-card-head"><div><div class="kicker">CHRONOLOGY</div><h3>Timeline projection</h3><div class="sub">One row per loaded classified event. Use Inspect to open the structured record.</div></div><span class="tag">'+n(t.length)+' loaded</span></div><div class="timeline history-timeline">'+(t.map(timelineItem).join('')||'<div class="empty"><strong>No timeline evidence loaded.</strong> Use Refresh data to retry the source.</div>')+'</div></div>'+
        '<div class="card"><div class="overview-card-head"><div><div class="kicker">RAW CHANGE LEDGER</div><h3>Persisted commit history</h3><div class="sub">Git commit metadata and numstat evidence. This is the source ledger for the page.</div></div><span class="tag">'+(commitPagination.totalPages?'Page '+n(commitPagination.page)+' / '+n(commitPagination.totalPages):'Current page')+'</span></div><div class="table section"><table><thead><tr><th>Commit</th><th>Subject</th><th>Files</th><th>+</th><th>−</th><th>When</th><th></th></tr></thead><tbody>'+(c.map(function(x){return '<tr><td class="mono">'+esc(sha(x.sha))+'</td><td>'+esc(x.subject||'—')+'</td><td>'+n(x.files_changed??x.filesChanged??0)+'</td><td>'+n(x.additions??0)+'</td><td>'+n(x.deletions??0)+'</td><td>'+esc(date(x.committed_at||x.committedAt))+'</td><td>'+inspectButton('Inspect '+sha(x.sha),'Persisted commit metadata and Git numstat evidence.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="7" class="dim">No commit evidence.</td></tr>')+'</tbody></table></div></div>'+
      '</section>';
  }
  function structure(){
    var d=S.data||{},ar=arr(d.architecture,'events'),de=arr(d.dependencies,'changes'),cx=arr(d.complexity,'events'),co=arr(d.coupling,'pairs');
    var dependencyKinds={},complexityDelta=0;
    de.forEach(function(x){var key=x.change_type||'change';dependencyKinds[key]=(dependencyKinds[key]||0)+1});
    cx.forEach(function(x){complexityDelta+=Number(x.delta&&x.delta.cyclomaticComplexity||0)});
    var depTypes=Object.keys(dependencyKinds).sort(function(a,b){return dependencyKinds[b]-dependencyKinds[a]||a.localeCompare(b)}).slice(0,7);
    var depMax=Math.max(1,...depTypes.map(function(k){return dependencyKinds[k]}));
    var maxComplexity=cx.reduce(function(m,x){return Math.max(m,Math.abs(Number(x.delta&&x.delta.cyclomaticComplexity||0)));},0);
    function structureStat(label,value,detail){return '<div class="structure-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></div>'}
    function deltaLabel(x){
      var delta=Number(x.delta&&x.delta.cyclomaticComplexity);
      return Number.isFinite(delta)?(delta>0?'+'+n(delta):n(delta)):'—';
    }
    return shell('Structure','Understand the codebase shape before drawing quality or runtime conclusions. Architecture, dependency, complexity and co-change records stay separately inspectable.')+
      '<section class="structure-stat-strip">'+
        structureStat('ARCHITECTURE',n(ar.length),'loaded structural events')+
        structureStat('DEPENDENCIES',n(de.length),'package manifest changes')+
        structureStat('COMPLEXITY',n(cx.length),'AST-derived events')+
        structureStat('COUPLING',n(co.length),'observed co-change pairs')+
      '</section>'+
      '<section class="structure-model">'+
        '<div class="card structure-summary-panel">'+
          '<div class="panel-head"><div><div class="kicker">ARCHITECTURE MODEL</div><h3>Repository shape</h3><div class="sub">A structural map of persisted directory/root-path evidence. It describes historical shape; it is not a runtime dependency graph.</div></div><span class="tag">'+n(ar.length)+' events</span></div>'+
          '<div class="structure-map-wrap">'+architectureMap(ar)+'</div>'+
        '</div>'+
        '<aside class="card structure-pulse">'+
          '<div class="structure-side-block"><div class="kicker">DEPENDENCY CHANGE</div><h3>Package movement</h3><p>Observed package.json changes grouped by change type.</p><div class="dep-pulse">'+(depTypes.map(function(k){return '<div class="dep-pulse-row"><div><b>'+esc(k)+'</b><span>'+n(dependencyKinds[k])+'</span></div><div class="track"><div class="fill" style="width:'+(dependencyKinds[k]/depMax*100).toFixed(1)+'%"></div></div></div>'}).join('')||'<div class="empty"><strong>No dependency events.</strong>No package changes were loaded for this snapshot.</div>')+'</div></div>'+
          '<div class="structure-side-block"><div class="kicker">COMPLEXITY DELTA</div><h3>Observed cyclomatic movement</h3><p>The aggregate below is a sum across loaded file-level deltas. Inspect individual records before interpreting it.</p><div class="metric">'+esc(n(complexityDelta))+'</div><div class="metric-label">aggregate Δ cyclomatic</div></div>'+
          '<div class="structure-side-block"><div class="kicker">READING RULE</div><h3>Evidence boundary</h3><p>Co-change indicates files moved together in commits. It does not prove architectural dependency or causation.</p></div>'+
        '</aside>'+
      '</section>'+
      '<section class="grid g2 section">'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">STRUCTURAL EVENTS</div><h3>Architecture evolution</h3><div class="sub">Directory/root-path evidence with source commit references.</div></div><span class="tag">'+n(ar.length)+' loaded</span></div><div class="table section"><table><thead><tr><th>Event</th><th>Path</th><th>Root</th><th>Commit</th><th></th></tr></thead><tbody>'+(ar.slice(0,80).map(function(x){return '<tr><td>'+esc(x.event_type||'event')+'</td><td class="path">'+esc(x.path||'—')+'</td><td class="path">'+esc(x.root_path||'—')+'</td><td class="mono">'+esc(sha(x.sha))+'</td><td>'+inspectButton('Inspect '+(x.path||'architecture'),'Observed directory/root-path change evidence.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No architecture evidence.</td></tr>')+'</tbody></table></div></div>'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">DEPENDENCIES</div><h3>Dependency evolution</h3><div class="sub">Version/spec movement captured from historical package manifests.</div></div><span class="tag">'+n(de.length)+' loaded</span></div><div class="table section"><table><thead><tr><th>Package</th><th>Scope</th><th>Change</th><th>From</th><th>To</th><th></th></tr></thead><tbody>'+(de.slice(0,80).map(function(x){return '<tr><td class="path">'+esc(x.package_name||'—')+'</td><td>'+esc(x.scope||'—')+'</td><td>'+esc(x.change_type||'change')+'</td><td class="mono">'+esc(x.previous_spec||'—')+'</td><td class="mono">'+esc(x.current_spec||'—')+'</td><td>'+inspectButton('Inspect '+(x.package_name||'package'),'Historical package.json dependency evidence.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="6" class="dim">No dependency evidence.</td></tr>')+'</tbody></table></div></div>'+
      '</section>'+
      '<section class="grid g2 section">'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">SOURCE COMPLEXITY</div><h3>Complexity change events</h3><div class="sub">AST-derived file metrics are tied to changed source files.</div></div><span class="tag">max |Δ| '+n(maxComplexity)+'</span></div><div class="table section"><table><thead><tr><th>Path</th><th>Before</th><th>After</th><th>Δ</th><th></th></tr></thead><tbody>'+(cx.slice(0,80).map(function(x){return '<tr><td class="path">'+esc(x.path||'—')+'</td><td>'+n(x.before&&x.before.cyclomaticComplexity)+'</td><td>'+n(x.after&&x.after.cyclomaticComplexity)+'</td><td>'+esc(deltaLabel(x))+'</td><td>'+inspectButton('Inspect '+(x.path||'complexity'),'AST-derived source metrics for a changed file.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No complexity evidence.</td></tr>')+'</tbody></table></div></div>'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">CO-CHANGE</div><h3>Files that changed together</h3><div class="sub">Same-commit co-change evidence can help identify surfaces worth investigating.</div></div><span class="tag">'+n(co.length)+' pairs</span></div><div class="table section"><table><thead><tr><th>Path A</th><th>Path B</th><th>Co-changes</th><th></th></tr></thead><tbody>'+(co.slice(0,80).map(function(x){return '<tr><td class="path">'+esc(x.path_a||'—')+'</td><td class="path">'+esc(x.path_b||'—')+'</td><td>'+n(x.co_change_count)+'</td><td>'+inspectButton('Inspect coupling','Files observed changing together in persisted commits.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="4" class="dim">No coupling evidence.</td></tr>')+'</tbody></table></div></div>'+
      '</section>';
  }
  function quality(){
    var d=S.data||{},b=arr(d.bugs,'areas'),rep=arr(d.repeated,'files'),rf=arr(d.refactors,'signals'),m=arr(d.migrations,'events'),t=arr(d.tests,'events'),ts=d.testSummary||{};
    var testDelta=Number(ts.testCaseDelta||0),migrationOps=m.reduce(function(sum,x){return sum+Number(x.operationCount||0)},0),signalTotal=b.length+rep.length+rf.length;
    function stat(label,value,detail){return '<div class="quality-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></div>'}
    return shell('Quality','Validate the historical signals that deserve investigation. Quality evidence is intentionally presented without collapsing different evidence families into a misleading health score.')+
      '<section class="quality-stat-strip">'+stat('BUG / FIX SIGNALS',n(b.length),'subject-based historical signals')+stat('REPEATED FILES',n(rep.length),'files with repeated change')+stat('REFACTOR SIGNALS',n(rf.length),'commit-subject heuristics')+stat('TEST / MIGRATION',n(t.length+m.length),n(t.length)+' test events · '+n(m.length)+' migration events')+'</section>'+
      '<section class="quality-intro section">'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">READING THE SIGNALS</div><h3>Change pressure is not a quality score</h3><div class="sub">Repeated edits, bug/fix subjects and refactor labels point to places worth opening. They do not prove defects, ownership or poor engineering.</div></div><span class="tag">investigate, do not rank</span></div>'+
          '<div class="quality-mini-list"><span><b>Signal records</b><b>'+n(signalTotal)+'</b></span><span><b>Test cases observed</b><b>'+n(ts.testCaseCount)+'</b></span><span><b>Test-case delta</b><b>'+n(testDelta)+'</b></span><span><b>Migration operations</b><b>'+n(migrationOps)+'</b></span></div>'+
          '<div class="quality-boundary"><strong>Boundary:</strong> source-level test evolution is not runtime pass/fail evidence. Migration analysis reads source files and does not execute them.</div></div>'+
        '<div class="card"><div class="kicker">EVIDENCE FAMILIES</div><h3 style="margin-top:5px">What each family can prove</h3><div class="quality-signal-grid" style="margin-top:12px;grid-template-columns:1fr">'+
          '<div class="quality-signal"><div class="kicker">BUG / FIX</div><strong>Subject signal</strong><p>Commit text contains a historical bug/fix indicator.</p></div>'+
          '<div class="quality-signal"><div class="kicker">REPEATED</div><strong>Touch frequency</strong><p>Files were changed repeatedly in the analyzed history.</p></div>'+
          '<div class="quality-signal"><div class="kicker">TESTS</div><strong>Source evolution</strong><p>Tests changed; that does not mean they passed or failed.</p></div>'+
          '<div class="quality-signal"><div class="kicker">MIGRATIONS</div><strong>Schema source</strong><p>Migration files were classified without executing them.</p></div>'+
        '</div></div>'+
      '</section>'+
      '<section class="grid g2 section">'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">BUG / FIX AREAS</div><h3>Historical signal areas</h3><div class="sub">Inspect the source record before treating a path as a defect hotspot.</div></div><span class="tag">'+n(b.length)+' areas</span></div><div class="table section"><table><thead><tr><th>Path</th><th>Signals</th><th>Touches</th><th>Ratio</th><th></th></tr></thead><tbody>'+(b.slice(0,80).map(function(x){return '<tr><td class="path">'+esc(x.path||'—')+'</td><td>'+n(x.signal_commits)+'</td><td>'+n(x.total_commits_touched)+'</td><td>'+pct(x.signal_ratio)+'</td><td>'+inspectButton('Inspect signal','Subject-based historical bug/fix signal; not defect proof.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No bug-area signal evidence.</td></tr>')+'</tbody></table></div></div>'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">TEST EVOLUTION</div><h3>Changed test surface</h3><div class="sub">Use this to find where verification code evolved. It is not a test-result feed.</div></div><span class="tag">'+n(t.length)+' events</span></div><div class="table section"><table><thead><tr><th>Path</th><th>Framework</th><th>Type</th><th>Δ cases</th><th></th></tr></thead><tbody>'+(t.slice(0,80).map(function(x){return '<tr><td class="path">'+esc(x.path||'—')+'</td><td>'+esc(x.framework||'—')+'</td><td>'+esc(x.testType||'—')+'</td><td>'+n(x.testCaseDelta)+'</td><td>'+inspectButton('Inspect test evolution','Changed-test source evidence; not runtime pass/fail evidence.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No test-change evidence.</td></tr>')+'</tbody></table></div></div>'+
      '</section>'+
      '<section class="grid g2 section">'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">REPEATED CHANGE</div><h3>Files repeatedly modified</h3><div class="sub">A high touch count makes a file interesting to inspect; it is not a quality ranking.</div></div><span class="tag">'+n(rep.length)+' files</span></div><div class="table section"><table><thead><tr><th>Path</th><th>Touches</th><th>Churn</th><th>Span</th><th></th></tr></thead><tbody>'+(rep.slice(0,80).map(function(x){return '<tr><td class="path">'+esc(x.path||'—')+'</td><td>'+n(x.commits_touched)+'</td><td>'+n(x.total_churn)+'</td><td>'+n(x.change_span_days)+'d</td><td>'+inspectButton('Inspect repeated change','Historical repeated-modification evidence.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No repeated-change evidence.</td></tr>')+'</tbody></table></div></div>'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">REFACTOR SIGNALS</div><h3>Refactor candidates</h3><div class="sub">Commit-subject heuristics that identify changes worth inspecting.</div></div><span class="tag">'+n(rf.length)+' signals</span></div><div class="table section"><table><thead><tr><th>Commit</th><th>Subject</th><th>Files</th><th>When</th><th></th></tr></thead><tbody>'+(rf.slice(0,80).map(function(x){return '<tr><td class="mono">'+esc(sha(x.sha))+'</td><td>'+esc(x.subject||'—')+'</td><td>'+n(x.files_changed)+'</td><td>'+esc(date(x.committed_at||x.committedAt))+'</td><td>'+inspectButton('Inspect refactor','Commit-subject refactor signal evidence.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No refactor signal evidence.</td></tr>')+'</tbody></table></div></div>'+
      '</section>'+
      '<section class="card section"><div class="panel-head"><div><div class="kicker">SCHEMA EVOLUTION</div><h3>Database migration evidence</h3><div class="sub">Migration files are source evidence only; Autopsy does not execute target migrations.</div></div><span class="tag">'+n(migrationOps)+' operations</span></div><div class="table section"><table><thead><tr><th>Path</th><th>Framework</th><th>Kind</th><th>Ops</th><th>Status</th><th></th></tr></thead><tbody>'+(m.slice(0,80).map(function(x){return '<tr><td class="path">'+esc(x.path||'—')+'</td><td>'+esc(x.framework||'—')+'</td><td>'+esc(x.migrationKind||'—')+'</td><td>'+n(x.operationCount)+'</td><td>'+esc(x.analysisStatus||'—')+'</td><td>'+inspectButton('Inspect migration','Database migration source evidence; migrations are not executed by Autopsy.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="6" class="dim">No migration evidence.</td></tr>')+'</tbody></table></div></section>';
  }
  function runtimeFilterDate(value){if(!value)return'';var d=new Date(value);return isNaN(d)?'':d.toISOString()}
  function runtimeInputDate(value){if(!value)return'';var d=new Date(value);if(isNaN(d))return'';function pad(x){return String(x).padStart(2,'0')}return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())}
  function runtimeEventsPathWithFilter(page,limit,filter){var f=filter||S.runtimeFilter,q=['page='+encodeURIComponent(page),'limit='+encodeURIComponent(limit||40)];[['from',runtimeFilterDate(f.from)],['to',runtimeFilterDate(f.to)],['deploymentId',f.deploymentId],['revisionSha',f.revisionSha],['environment',f.environment],['operationName',f.operationName],['signalType',f.signalType]].forEach(function(x){if(x[1])q.push(x[0]+'='+encodeURIComponent(x[1]))});return '/api/repositories/'+S.repoId+'/runtime/telemetry?'+q.join('&')}
  function runtimeEventsPath(page,limit){return runtimeEventsPathWithFilter(page,limit,S.runtimeFilter)}
  function runtime(){
    var d=S.data||{},overall=d.runtime&&d.runtime.overall||{},groups=arr(d.runtime,'groups'),deployments=arr(d.deployments,'events');
    var events=S.runtimeEvents&&S.runtimeEvents.length?S.runtimeEvents:arr(d.runtimeEvents,'events');
    var pagination=S.runtimePagination||d.runtimeEvents&&d.runtimeEvents.pagination||{};
    var hs=d.historicalSummary&&d.historicalSummary.result||{},hc=arr(d.historicalCorrelation,'events');
    var source=d.historicalSourceContext&&d.historicalSourceContext.coverage||{},sourceItems=arr(d.historicalSourceContext,'events');
    var snap=currentAnalysisSnapshot(),a=S.analysis||{},target=a.targetHeadSha||snap&&snap.targetHeadSha||'';
    function stat(label,value,detail){return '<div class="runtime-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></div>'}
    function selectSignal(id,value){
      return '<select id="'+id+'" aria-label="Signal type"><option value="">All signals</option><option value="http"'+(value==='http'?' selected':'')+'>http</option><option value="job"'+(value==='job'?' selected':'')+'>job</option><option value="db"'+(value==='db'?' selected':'')+'>db</option><option value="external"'+(value==='external'?' selected':'')+'>external</option><option value="custom"'+(value==='custom'?' selected':'')+'>custom</option></select>';
    }
    function eventRow(x){
      return '<tr><td>'+esc(date(x.observedAt||x.observed_at))+'</td><td>'+esc(x.signalType||'—')+'</td><td><strong>'+esc(x.serviceName||'—')+'</strong><div class="sub">'+esc(x.operationName||'—')+'</div></td><td>'+esc(x.environment||'—')+'</td><td class="mono">'+esc(sha(x.revisionSha))+'</td><td>'+esc(ms(x.durationMs))+'</td><td>'+esc(x.status||'—')+(x.errorType?'<div class="sub">'+esc(x.errorType)+'</div>':'')+'</td><td>'+inspectButton('Inspect event','Observed runtime telemetry event.',x)+'</td></tr>';
    }
    function deploymentRow(x){
      return '<tr><td>'+esc(x.provider||'—')+'</td><td class="mono">'+esc(x.deploymentId||'—')+'</td><td>'+esc(x.environment||'—')+'</td><td>'+esc(x.state||'—')+'</td><td class="mono">'+esc(sha(x.revisionSha))+'</td><td>'+inspectButton('Inspect deployment','Observed deployment evidence record.',x)+(x.deploymentId?'<button class="inspect" type="button" data-deployment-id="'+esc(x.deploymentId)+'">Provenance</button>':'')+'</td></tr>';
    }
    function historicalRow(x){
      var commit=x.commit||{},cor=x.correlation||{},assessment=cor.assessment||{},comparison=assessment.sampleComparison||{};
      return '<tr><td class="mono">'+esc(sha(commit.sha||x.sha))+'</td><td>'+esc(commit.subject||x.subject||'—')+'</td><td>'+n(comparison.targetSampleCount)+'</td><td>'+esc(cor.status||'—')+'</td><td>'+inspectButton('Inspect correlation','Historical runtime reconstruction record.',x)+'</td></tr>';
    }
    var stats=
      stat('RUNTIME SAMPLES',n(overall.sampleCount),'persisted telemetry observations')+
      stat('P95 DURATION',ms(overall.p95DurationMs),'observed runtime latency')+
      stat('ERROR RATE',pct(overall.errorRate),'observed sample ratio')+
      stat('DEPLOYMENTS',n(deployments.length),'externally supplied records');

    var lineage=[
      ['OBSERVED','Telemetry',overall.sampleCount,'Direct runtime observations.'],
      ['EXTERNAL','Deployments',deployments.length,'Deployment records supplied by integrations.'],
      ['CORRELATED','History links',hs.pageCoverage&&hs.pageCoverage.ready,'Historical comparisons with usable evidence.'],
      ['CONTEXT','Source files',source.sourceContextAvailable,'Correlations with changed-file context.']
    ].map(function(x){return '<div class="runtime-lineage-step"><span class="runtime-lineage-kicker">'+x[0]+'</span><strong>'+esc(x[1])+'</strong><b>'+esc(n(x[2]))+'</b><small>'+esc(x[3])+'</small></div>'}).join('');

    return shell('Runtime','Inspect what the system actually observed, then follow explicit revision and deployment links. Runtime evidence remains separate from Git history and correlation stays visibly non-causal.')+
      '<section class="runtime-stat-strip">'+stats+'</section>'+
      '<section class="runtime-context section">'+
        '<div class="card"><div class="panel-head"><div><div class="kicker">PROVENANCE CHAIN</div><h3>Telemetry → deployment → history → source context</h3><div class="sub">Each step has a different evidentiary meaning. The chain is a navigation model, not a claim that one layer caused another.</div></div><span class="tag">explicit boundaries</span></div><div class="runtime-lineage-grid">'+lineage+'</div><div class="runtime-boundary"><strong>Boundary:</strong> historical correlation narrows a time window around a commit and checks observed telemetry in that window. It does not prove that the commit caused a runtime change.</div><div class="callout section"><span>ANALYSIS TARGET</span> <strong class="mono">'+esc(sha(target))+'</strong> · <span>RUN</span> <strong class="mono">'+esc(S.runId||'—')+'</strong></div></div>'+
        '<div class="card"><div class="kicker">RUNTIME GROUPS</div><h3 style="margin-top:5px">Observed performance by group</h3><div class="sub">Summary groupings are useful for navigation into telemetry, not a replacement for individual observations.</div><div class="table section"><table><thead><tr><th>Group</th><th>Samples</th><th>Average</th><th>Error</th></tr></thead><tbody>'+(groups.slice(0,40).map(function(x){return '<tr><td class="path">'+esc(x.key||'—')+'</td><td>'+n(x.sampleCount)+'</td><td>'+ms(x.avgDurationMs)+'</td><td>'+pct(x.errorRate)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="4" class="dim">No runtime groups loaded.</td></tr>')+'</tbody></table></div></div>'+
      '</section>'+
      '<section class="card section runtime-table"><div class="panel-head"><div><div class="kicker">LIVE OBSERVATION EXPLORER</div><h3>Runtime telemetry</h3><div class="sub">These rows are direct observations. Filters change the view over already available server-side evidence.</div></div><span class="tag">'+n(pagination.total??events.length)+' events</span></div>'+
        '<div class="runtime-filters"><div class="runtime-filter-actions"><button class="btn primary" data-action="runtime-filter"'+(S.runtimeLoading?' disabled aria-busy="true"':'')+'>'+(S.runtimeLoading?'Applying…':'Apply filters')+'</button><button class="btn" data-action="runtime-clear-filter">Clear</button></div>'+
        '<div class="grid g3"><label class="field"><span>Environment</span><input id="rtEnvironment" value="'+esc(S.runtimeFilter.environment)+'" placeholder="production"></label><label class="field"><span>Operation</span><input id="rtOperation" value="'+esc(S.runtimeFilter.operationName)+'" placeholder="api.request"></label><label class="field"><span>Signal type</span>'+selectSignal('rtSignal',S.runtimeFilter.signalType)+'</label></div>'+
        '<details class="runtime-advanced"><summary>Advanced identity filters</summary><div class="grid g3"><label class="field"><span>From</span><input id="rtFrom" type="datetime-local" value="'+esc(runtimeInputDate(S.runtimeFilter.from))+'"></label><label class="field"><span>To</span><input id="rtTo" type="datetime-local" value="'+esc(runtimeInputDate(S.runtimeFilter.to))+'"></label><label class="field"><span>Deployment ID</span><input id="rtDeployment" value="'+esc(S.runtimeFilter.deploymentId)+'" placeholder="deployment-id"></label><label class="field"><span>Revision SHA</span><input id="rtRevision" value="'+esc(S.runtimeFilter.revisionSha)+'" placeholder="40/64-character SHA"></label></div></details></div>'+
        '<div class="table section"><table><thead><tr><th>Observed</th><th>Signal</th><th>Service / operation</th><th>Env</th><th>Revision</th><th>Duration</th><th>Status</th><th></th></tr></thead><tbody>'+(events.map(eventRow).join('')||'<tr data-empty-state="true"><td colspan="8" class="dim">No runtime telemetry events match the current filters.</td></tr>')+'</tbody></table></div>'+
        ((pagination.totalPages&&pagination.page<pagination.totalPages)?'<div style="margin-top:10px"><button class="btn" data-action="runtime-more">Load next 40 events</button></div>':'')+
      '</section>'+
      '<section class="card section"><div class="panel-head"><div><div class="kicker">DEPLOYMENT EVIDENCE</div><h3>What deployments say about revisions</h3><div class="sub">Deployment records are external evidence. Use Provenance for the revision-level chain when available.</div></div><span class="tag">'+n(deployments.length)+' records</span></div><div class="table section"><table><thead><tr><th>Provider</th><th>Deployment</th><th>Environment</th><th>State</th><th>Revision</th><th></th></tr></thead><tbody>'+(deployments.map(deploymentRow).join('')||'<tr data-empty-state="true"><td colspan="6" class="dim">No deployment evidence loaded.</td></tr>')+'</tbody></table></div></section>'+
      '<section class="card section"><div class="panel-head"><div><div class="kicker">HISTORICAL RECONSTRUCTION</div><h3>Runtime around repository changes</h3><div class="sub">Compare observed runtime windows around persisted commits. Gaps remain visible instead of being filled with inferred behaviour.</div></div><span class="tag">'+n(hs.totalCommits||hc.length)+' commit context</span></div><div class="table section"><table><thead><tr><th>Commit</th><th>Subject</th><th>Samples</th><th>Assessment</th><th></th></tr></thead><tbody>'+(hc.slice(0,40).map(historicalRow).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No historical correlation records loaded.</td></tr>')+'</tbody></table></div><div class="runtime-correlation-note"><strong>Coverage</strong><small>'+esc(n(hs.pageCoverage&&hs.pageCoverage.ready))+' ready comparisons · '+esc(n(hs.pageCoverage&&hs.pageCoverage.evidenceGaps))+' evidence gaps · source context '+esc(n(source.sourceContextAvailable))+' available.</small></div></section>'+
      '<section class="card section"><div class="panel-head"><div><div class="kicker">SOURCE-CHANGE CONTEXT</div><h3>Changed files attached to historical comparisons</h3><div class="sub">This context identifies the files changed by the commit as a whole. It is not proof that any individual file caused a runtime outcome.</div></div><span class="tag">'+n(source.totalChangedFilesReported)+' files reported</span></div><div class="table section"><table><thead><tr><th>Commit</th><th>Context status</th><th>Files</th><th>Coverage</th><th></th></tr></thead><tbody>'+(sourceItems.slice(0,30).map(function(x){var c=x.commit||{},s=x.sourceContext||{};return '<tr><td class="mono">'+esc(sha(c.sha||x.sha))+'</td><td>'+esc(s.status||'—')+'</td><td>'+n(s.fileCount||s.filesReported)+'</td><td>'+esc(s.complete?'complete':s.truncated?'truncated':'partial')+'</td><td>'+inspectButton('Inspect source context','Changed-file evidence attached to the historical correlation.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No source-change context loaded.</td></tr>')+'</tbody></table></div></section>';
  }
  function reportPage(){
    var rep=S.data.report,a=S.analysis||{};
    var current=!!(rep&&currentAnalysisSnapshot()&&rep.analysis&&rep.analysis.runId===S.runId&&sameRevision(rep.analysis.targetHeadSha,a.targetHeadSha));
    var actions='<button class="btn primary" data-action="report"'+(S.reportLoading?' disabled aria-busy="true"':'')+'>'+(S.reportLoading?'Generating…':(current?'Refresh report':'Generate current report'))+'</button>';
    if(current)actions+='<button class="btn" data-action="download">Download JSON</button><button class="btn" data-action="interpretation">Generate insights</button>';
    return shell('Report','Read a bounded engineering summary generated from one completed analysis snapshot. Claims, evidence references and limitations remain visible.')+
      (current?reportHtml(rep):'<section class="empty section"><strong>A current report is not available.</strong><span>Generate the report only after the analysis snapshot is complete and aligned with the repository head.</span><div><button class="btn primary" data-action="report">Generate current report</button></div></section>');
  }
  function reportHtml(rep){
    var sections=Array.isArray(rep.sections)?rep.sections:[],claims=0,refs=0,limited=0;
    sections.forEach(function(s){var cs=Array.isArray(s.claims)?s.claims:[];claims+=cs.length;cs.forEach(function(c){refs+=Array.isArray(c.evidence)?c.evidence.length:0;if(c.limitation)limited++})});
    function stat(label,value,detail){return '<div class="report-posture-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></div>'}
    var index=sections.map(function(s){var id='report-section-'+String(s.id||'section').replace(/[^a-zA-Z0-9_-]/g,'-');return '<button class="report-index-row" type="button" data-action="report-jump" data-report-section="'+esc(id)+'"><span>'+esc(s.title||'Untitled section')+'</span><b>'+n((s.claims||[]).length)+'</b><small>'+esc(s.evidenceBasis||'Evidence basis unavailable')+'</small></button>'}).join('');
    var bodies=sections.map(function(s){var id='report-section-'+String(s.id||'section').replace(/[^a-zA-Z0-9_-]/g,'-');var cs=Array.isArray(s.claims)?s.claims:[];return '<section class="report-section-block" id="'+esc(id)+'"><div class="report-section-head"><div><h3>'+esc(s.title||'Untitled section')+'</h3><p>'+esc(s.evidenceBasis||'Evidence basis unavailable')+' · '+n(cs.length)+' claims</p></div><span class="tag">'+n(cs.length)+' claims</span></div>'+ (cs.map(function(c){return '<div class="report-claim"><p>'+esc(c.statement||'Claim statement unavailable.')+'</p><div class="tags" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">'+(Array.isArray(c.evidence)?c.evidence.slice(0,10).map(function(e){return '<span class="tag">'+esc(e.source)+':'+esc(e.key)+'</span>'}).join(''):'')+'</div><div class="report-claim-limit">'+esc(c.limitation||'No additional limitation supplied.')+'</div><div class="report-actions">'+inspectButton('Inspect supporting evidence','Claim statement with its cited evidence references and stated limitation.',c)+'</div></div>'}).join('')||'<div class="empty">No claims were returned for this section.</div>')+'</section>'}).join('');
    return '<section class="report-posture-strip">'+stat('REPORT VERSION',rep.reportVersion||'—','persisted report contract')+stat('CLAIMS',n(claims),'generated statements')+stat('EVIDENCE REFERENCES',n(refs),'references attached to claims')+stat('LIMITATIONS',n(limited),'claims carrying explicit limits')+'</section>'+
      '<section class="report-reading section"><div class="card"><div class="panel-head"><div><div class="kicker">REPORT MAP</div><h3>Navigate the current evidence summary</h3><div class="sub">Jump to a section before reading its claims. The map shows how many claims are in each section.</div></div><span class="tag">'+n(sections.length)+' sections</span></div><div class="report-index-list">'+(index||'<div class="empty">No report sections were returned.</div>')+'</div><div class="callout section">Generated '+esc(date(rep.generatedAt))+' · fingerprint <span class="mono">'+esc(rep.fingerprint||'—')+'</span></div></div>'+
      '<div class="card"><div class="kicker">EVIDENCE CONTRACT</div><h3 style="margin-top:5px">What this report can support</h3><div class="sub">The report is a projection of the completed analysis snapshot. It is not a claim of developer intent, business impact or runtime causality.</div><div class="quality-mini-list"><span><b>Snapshot run</b><b class="mono">'+esc(rep.analysis&&rep.analysis.runId||S.runId||'—')+'</b></span><span><b>Target revision</b><b class="mono">'+esc(sha(rep.analysis&&rep.analysis.targetHeadSha))+'</b></span><span><b>Evidence sections</b><b>'+n(rep.coverage&&rep.coverage.sectionsWithEvidence)+'</b></span><span><b>Persisted commits</b><b>'+n(rep.coverage&&rep.coverage.persistedCommits)+'</b></span></div></div></section>'+
      '<section class="section">'+(bodies||'<div class="empty">No report content returned.</div>')+'</section>';
  }
  function interpretation(){
    var rep=S.data.report,i=S.data.interpretation,a=S.analysis||{};
    var ready=!!(rep&&currentAnalysisSnapshot()&&rep.analysis&&rep.analysis.runId===S.runId&&sameRevision(rep.analysis.targetHeadSha,a.targetHeadSha));
    var current=!!(ready&&i&&i.result&&i.result.reportFingerprint===rep.fingerprint);
    var actions=ready?'<button class="btn primary" data-action="interpretation"'+(S.interpretationLoading?' disabled aria-busy="true"':'')+'>'+(S.interpretationLoading?'Generating…':(current?'Refresh insights':'Generate insights'))+'</button>':'';
    var result=i&&i.result||{},ir=result.interpretation||{},themes=Array.isArray(ir.themes)?ir.themes:[],questions=Array.isArray(ir.investigationQuestions)?ir.investigationQuestions:[],uncertainties=Array.isArray(ir.uncertainties)?ir.uncertainties:[];
    var themeRefs=themes.reduce(function(n,x){return n+(Array.isArray(x.evidenceKeys)?x.evidenceKeys.length:0)},0),questionRefs=questions.reduce(function(n,x){return n+(Array.isArray(x.evidenceKeys)?x.evidenceKeys.length:0)},0);
    return shell('Insights','Generate interpretation only from the current report. Themes, investigation questions and uncertainties remain linked to the claims that support them.',actions)+
      (current?'<section class="insight-stat-strip"><div class="insight-stat"><span>GROUNDING CLAIMS</span><strong>'+n(result.groundingClaimCount)+'</strong><small>claims available to interpretation</small></div><div class="insight-stat"><span>THEMES</span><strong>'+n(themes.length)+'</strong><small>'+n(themeRefs)+' evidence keys</small></div><div class="insight-stat"><span>QUESTIONS</span><strong>'+n(questions.length)+'</strong><small>'+n(questionRefs)+' evidence keys</small></div><div class="insight-stat"><span>UNCERTAINTIES</span><strong>'+n(uncertainties.length)+'</strong><small>explicit limitations kept visible</small></div></section>'+interpretationHtml(i):'<section class="empty section"><strong>Insights need the current report.</strong><span>Generate or refresh the current report first. Interpretation from an older snapshot is intentionally not reused.</span><div>'+(ready?'<button class="btn primary" data-action="interpretation">Generate insights</button>':'<button class="btn" data-action="report">Refresh report</button>')+'</div></section>');
  }
  function interpretationHtml(x){
    var r=x&&x.result||x||{},i=r.interpretation||{},rep=S.data.report||{},sections=Array.isArray(rep.sections)?rep.sections:[];
    function grounding(keys){var out=[];(Array.isArray(keys)?keys:[]).forEach(function(k){var p=String(k).split('/'),sec=sections.find(function(s){return s.id===p[0]}),claim=sec&&Array.isArray(sec.claims)?sec.claims.find(function(c){return c.id===p.slice(1).join('/')||c.id===p[1]}):null;if(sec&&claim)out.push({evidenceKey:k,sectionTitle:sec.title,claim:claim})});return out}
    function inspectGrounding(keys,basis){var rows=grounding(keys);return rows.length?inspectButton('Inspect supporting evidence',basis,rows):'<span class="dim">No matching grounding claim is available.</span>'}
    var themes=Array.isArray(i.themes)?i.themes:[],questions=Array.isArray(i.investigationQuestions)?i.investigationQuestions:[],uncertainties=Array.isArray(i.uncertainties)?i.uncertainties:[];
    return '<section class="insight-layout">'+
      '<div class="card"><div class="kicker">EXECUTIVE INTERPRETATION</div><h3 style="margin-top:5px">What the current evidence suggests</h3><div class="insight-summary"><p>'+esc(i.executiveSummary||'No executive summary was returned.')+'</p></div><div class="callout section">This is interpretation, not a new evidence source. Every supported theme and question should resolve back to a current report claim.</div></div>'+
      '<aside class="card"><div class="kicker">INTERPRETATION CONTRACT</div><h3 style="margin-top:5px">How to read this page</h3><div class="quality-mini-list"><span><b>Report fingerprint</b><b class="mono">'+esc(r.reportFingerprint||rep.fingerprint||'—')+'</b></span><span><b>Result</b><b>'+esc(r.cacheHit?'cached':'fresh')+'</b></span><span><b>Grounding claims</b><b>'+n(r.groundingClaimCount)+'</b></span><span><b>Provider status</b><b>'+esc(r.provider||'server-side')+'</b></span></div></aside>'+
    '</section>'+
    '<section class="grid g2 section"><div class="card"><div class="panel-head"><div><div class="kicker">THEMES</div><h3>Recurring engineering patterns</h3><div class="sub">Each theme keeps its evidence keys visible instead of turning interpretation into a fact.</div></div><span class="tag">'+n(themes.length)+' themes</span></div><div class="insight-list">'+(themes.map(function(t){return '<article class="insight-item"><div class="insight-item-head"><h3>'+esc(t.title||'Theme')+'</h3><span class="tag">'+n(Array.isArray(t.evidenceKeys)?t.evidenceKeys.length:0)+' refs</span></div><p>'+esc(t.analysis||'No analysis supplied.')+'</p><div class="insight-evidence">'+(Array.isArray(t.evidenceKeys)?t.evidenceKeys.map(function(k){return '<span class="tag">'+esc(k)+'</span>'}).join(''):'')+'</div><div style="margin-top:8px">'+inspectGrounding(t.evidenceKeys,'Validated report claims supporting this theme.')+'</div></article>'}).join('')||'<div class="empty">No themes returned.</div>')+'</div></div>'+
      '<div class="card"><div class="panel-head"><div><div class="kicker">INVESTIGATION QUESTIONS</div><h3>What to verify next</h3><div class="sub">Questions are deliberately presented as questions, not conclusions.</div></div><span class="tag">'+n(questions.length)+' questions</span></div><div class="insight-list">'+(questions.map(function(q){return '<article class="insight-item"><div class="insight-item-head"><h3>'+esc(q.question||'Investigation question')+'</h3><span class="tag">'+n(Array.isArray(q.evidenceKeys)?q.evidenceKeys.length:0)+' refs</span></div><div class="insight-evidence">'+(Array.isArray(q.evidenceKeys)?q.evidenceKeys.map(function(k){return '<span class="tag">'+esc(k)+'</span>'}).join(''):'')+'</div><div style="margin-top:8px">'+inspectGrounding(q.evidenceKeys,'Validated report claims that motivated this investigation question.')+'</div></article>'}).join('')||'<div class="empty">No investigation questions returned.</div>')+'</div></div></section>'+
      '<section class="card section"><div class="panel-head"><div><div class="kicker">UNCERTAINTIES</div><h3>What remains unproven</h3><div class="sub">Uncertainty is part of the result. Missing evidence is not silently converted into confidence.</div></div><span class="tag">'+n(uncertainties.length)+' items</span></div><div class="insight-list">'+(uncertainties.map(function(u){return '<div class="insight-item"><div class="insight-uncertainty">'+esc(u)+'</div></div>'}).join('')||'<div class="empty">No uncertainties returned.</div>')+'</div></section>';
  }
  function contributors(){
    var d=S.data||{},items=arr(d.contributors,'contributors'),shown=items.slice(0,100);
    var total=d.contributors&&d.contributors.totalContributors!=null?d.contributors.totalContributors:items.length;
    var pulse=shown.slice().sort(function(a,b){return Number(b.commitCount||0)-Number(a.commitCount||0)||String(a.authorName||'').localeCompare(String(b.authorName||''))}).slice(0,10);
    var max=Math.max(1,...pulse.map(function(x){return Number(x.commitCount||0)}));
    var pulseHtml=pulse.map(function(x){var count=Number(x.commitCount||0);return '<div class="contrib-pulse-row"><div class="contrib-pulse-head"><b>'+esc(x.authorName||'Unknown author')+'</b><span>'+n(count)+' commits</span></div><div class="contrib-track"><span style="width:'+Math.max(4,count/max*100).toFixed(1)+'%"></span></div><div class="contrib-pulse-meta">'+n(x.pathsTouched||0)+' paths · last '+esc(date(x.lastCommittedAt))+'</div></div>'}).join('');
    return shell('Contributors','Understand who appears in the Git history without turning commit counts into assumptions about ownership, effort, seniority or impact.')+
      '<section class="contributor-topology"><div class="contributor-stat"><span>AUTHOR TUPLES</span><strong>'+n(total)+'</strong><small>persisted Git author identities</small></div><div class="contributor-stat"><span>DISPLAYED</span><strong>'+n(shown.length)+'</strong><small>bounded result set</small></div><div class="contributor-stat"><span>IDENTITY RULE</span><strong>Literal</strong><small>name/email tuples are not merged by inference</small></div></section>'+
      '<section class="contributor-overview section"><div class="card"><div class="panel-head"><div><div class="kicker">ACTIVITY PULSE</div><h3>Most active author tuples in this snapshot</h3><div class="sub">Commit count is a descriptive Git-history measure. It is not a measure of individual effort or code quality.</div></div><span class="tag">top '+n(pulse.length)+'</span></div><div class="contrib-pulse">'+(pulseHtml||'<div class="empty"><strong>No contributor activity loaded.</strong> Refresh Contributors to retry the source.</div>')+'</div></div>'+
      '<div class="card"><div class="kicker">ATTRIBUTION BOUNDARY</div><h3 style="margin-top:5px">What Autopsy does not infer</h3><div class="sub">The product keeps authorship literal to avoid manufacturing identity or ownership claims.</div><div class="contrib-boundary"><div><span>Measured</span><b>Git author name + email tuple</b></div><div><span>Not measured</span><b>Ownership of a feature</b></div><div><span>Not measured</span><b>Individual effort or seniority</b></div><div><span>Not measured</span><b>Business or runtime impact</b></div></div></div></section>'+
      '<section class="card section"><div class="panel-head"><div><div class="kicker">CONTRIBUTOR LEDGER</div><h3>Complete loaded attribution table</h3><div class="sub">Use Inspect to open the exact aggregated contributor record.</div></div><span class="tag">'+n(shown.length)+' rows</span></div><div class="table section"><table><thead><tr><th>Author</th><th>Commits</th><th>Additions</th><th>Deletions</th><th>Churn</th><th>Paths</th><th>First</th><th>Last</th><th></th></tr></thead><tbody>'+(shown.map(function(x){return '<tr><td><strong>'+esc(x.authorName||'Unknown author')+'</strong><div class="sub mono">'+esc(x.authorEmail||'email unavailable')+'</div></td><td>'+n(x.commitCount)+'</td><td>'+n(x.additions)+'</td><td>'+n(x.deletions)+'</td><td>'+n(x.totalChurn)+'</td><td>'+n(x.pathsTouched)+'</td><td>'+esc(date(x.firstCommittedAt))+'</td><td>'+esc(date(x.lastCommittedAt))+'</td><td>'+inspectButton('Inspect contributor','Persisted Git author tuple and activity aggregation.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="9" class="dim">No contributor evidence loaded.</td></tr>')+'</tbody></table></div></section>';
  }
  function evidencePage(){
    var d=S.data||{},items=[];
    function add(family,label,basis,payload,search){items.push({family:family,label:label,basis:basis,payload:payload,search:String(search||label).toLowerCase()})}
    var sourceDefs=[
      {id:'git',label:'Git history',detail:'commits + numstat',items:arr(d.commits,'commits')},
      {id:'timeline',label:'Timeline',detail:'classified commit events',items:arr(d.timeline,'events')},
      {id:'structure',label:'Structure',detail:'architecture + dependency changes',items:arr(d.architecture,'events').concat(arr(d.dependencies,'changes'))},
      {id:'quality',label:'Quality',detail:'historical quality signals',items:arr(d.bugs,'areas').concat(arr(d.repeated,'files')).concat(arr(d.refactors,'signals'))},
      {id:'schema',label:'Schema / tests',detail:'migration + test evolution',items:arr(d.migrations,'events').concat(arr(d.tests,'events'))},
      {id:'runtime',label:'Runtime / deploy',detail:'telemetry + deployment evidence',items:arr(d.runtimeEvents,'events').concat(arr(d.deployments,'events'))},
      {id:'contributors',label:'Contributors',detail:'Git author tuples',items:arr(d.contributors,'contributors')}
    ];
    arr(d.commits,'commits').slice(0,30).forEach(function(x){add('git','Commit '+sha(x.sha)+' · '+(x.subject||'change'),'Persisted Git commit metadata and numstat evidence.',x,(x.subject||'')+' '+x.sha)});
    arr(d.timeline,'events').slice(0,30).forEach(function(x){add('timeline','Timeline '+sha(x.sha)+' · '+(x.eventType||'change'),'Descriptive timeline classification attached to a persisted commit.',x,(x.subject||'')+' '+x.eventType)});
    arr(d.architecture,'events').slice(0,30).forEach(function(x){add('structure','Architecture '+(x.path||'event'),'Observed directory/root-path change evidence.',x,(x.path||'')+' '+(x.root_path||''))});
    arr(d.dependencies,'changes').slice(0,30).forEach(function(x){add('structure','Dependency '+(x.package_name||'package'),'Historical package manifest evidence.',x,(x.package_name||'')+' '+(x.change_type||''))});
    arr(d.complexity,'events').slice(0,30).forEach(function(x){add('structure','Complexity '+(x.path||'file'),'AST-derived source metrics for a changed file.',x,x.path||'' )});
    arr(d.coupling,'pairs').slice(0,30).forEach(function(x){add('structure','Coupling '+(x.path_a||'path')+' ↔ '+(x.path_b||'path'),'Files observed changing together in persisted commits.',x,(x.path_a||'')+' '+(x.path_b||''))});
    arr(d.bugs,'areas').slice(0,30).forEach(function(x){add('quality','Bug-area '+(x.path||'file'),'Subject-based historical bug/fix signal; not defect proof.',x,x.path||'' )});
    arr(d.repeated,'files').slice(0,30).forEach(function(x){add('quality','Repeated '+(x.path||'file'),'Historical repeated-modification evidence.',x,x.path||'' )});
    arr(d.refactors,'signals').slice(0,30).forEach(function(x){add('quality','Refactor '+sha(x.sha),'Commit-subject refactor signal evidence.',x,(x.subject||'')+' '+x.sha)});
    arr(d.migrations,'events').slice(0,30).forEach(function(x){add('schema','Migration '+(x.path||'file'),'Database migration source evidence; migrations are not executed by Autopsy.',x,x.path||'' )});
    arr(d.tests,'events').slice(0,30).forEach(function(x){add('schema','Test evolution '+(x.path||'file'),'Changed-test source evidence; not runtime pass/fail evidence.',x,(x.path||'')+' '+(x.framework||''))});
    arr(d.runtimeEvents,'events').slice(0,30).forEach(function(x){add('runtime','Runtime '+(x.eventId||x.id||'event'),'Observed runtime telemetry event.',x,(x.eventId||'')+' '+(x.signalType||''))});
    arr(d.deployments,'events').slice(0,30).forEach(function(x){add('runtime','Deployment '+(x.deploymentId||'deployment'),'Externally supplied deployment evidence record.',x,(x.deploymentId||'')+' '+(x.provider||''))});
    arr(d.contributors,'contributors').slice(0,30).forEach(function(x){add('contributors','Contributor '+(x.authorName||'Unknown'),'Persisted Git author tuple and activity aggregation.',x,(x.authorName||'')+' '+(x.authorEmail||''))});
    var total=items.length, max=Math.max(1,...sourceDefs.map(function(x){return x.items.length})),active=S.evidenceFamily||'all';
    var families='<button type="button" class="evidence-family '+(active==='all'?'active':'')+'" data-evidence-family="all"><div class="evidence-family-head"><div><b>All evidence</b><small>All indexed records from the loaded snapshot</small></div><strong>'+n(total)+'</strong></div><div class="evidence-track"><span style="width:100%"></span></div><div class="evidence-family-foot"><span>scope</span><span>all</span></div></button>'+sourceDefs.map(function(f){var count=f.items.length;return '<button type="button" class="evidence-family '+(active===f.id?'active':'')+'" data-evidence-family="'+esc(f.id)+'"><div class="evidence-family-head"><div><b>'+esc(f.label)+'</b><small>'+esc(f.detail)+'</small></div><strong>'+n(count)+'</strong></div><div class="evidence-track"><span style="width:'+Math.max(4,count/max*100).toFixed(1)+'%"></span></div><div class="evidence-family-foot"><span>loaded index</span><span>'+n(count)+' records</span></div></button>'}).join('');
    var rows=items.map(function(x){return '<div class="evidence-row" data-family="'+esc(x.family)+'" data-search="'+esc(x.search)+'"><div><strong>'+esc(x.label)+'</strong><small>'+esc(x.basis)+'</small></div>'+inspectButton('Inspect','Open the persisted evidence payload behind this index entry.',x.payload)+'</div>'}).join('');
    return shell('Evidence','Use one direct inspection layer for the whole product. Search and family filters only narrow records already indexed from the loaded snapshot.')+
      '<section class="evidence-overview card"><div class="evidence-headline"><div><div class="kicker">EVIDENCE INDEX</div><h3>Every visible signal should have a path back to a record</h3><div class="sub">Choose a family, search the loaded index, then open Inspect to examine the structured payload and its provenance note.</div></div><span id="evidenceScopeCount" class="tag">'+n(total)+' inspectable records</span></div>'+
      '<div class="evidence-family-grid">'+families+'</div>'+
      '<div class="evidence-search"><input id="evidenceSearch" class="search" value="" placeholder="Search loaded evidence by path, commit, author, event or signal…" autocomplete="off"><button id="evidenceSearchClear" class="btn" type="button">Clear</button></div>'+
      '<div class="evidence-result-meta"><span>LOCAL INDEX</span><span id="evidenceSearchCount">'+n(total)+' loaded</span></div><div id="evidenceEmpty" class="empty" hidden><strong>No loaded evidence matches.</strong><span>Clear the search or choose another evidence family.</span></div><div class="evidence-list">'+(rows||'<div class="empty"><strong>No evidence records are indexed.</strong><span>Load the Evidence sources for this snapshot, then return here.</span></div>')+'</div></section>';
  }
  function interview(){
    var stories=S.data.interview,a=S.analysis||{};
    var q=stories&&stories.result&&stories.result.stories||stories&&stories.stories||stories&&stories.result||[];
    if(!Array.isArray(q))q=Object.keys(q||{}).map(function(k){return Object.assign({title:k},q[k]||{})});
    var current=!!(stories&&currentAnalysisSnapshot()&&stories.analysisRunId===S.runId&&a.status==='completed');
    var ready=!!(currentAnalysisSnapshot()&&a.status==='completed');
    var actions=ready?'<button class="btn primary" data-action="interview"'+(S.interviewLoading?' disabled aria-busy="true"':'')+'>'+(S.interviewLoading?'Loading…':(current?'Refresh stories':'Load stories'))+'</button>':'';
    var linked=q.filter(function(s){return Array.isArray(s.evidence)&&s.evidence.length}).length;
    var verified=q.filter(function(s){return s.verification&&(s.verification.ownership||s.verification.runtimeImpact)}).length;
    var storyMarkup=q.map(function(s){
      var draft=s.draftAnswer||{},v=s.verification||{},ev=Array.isArray(s.evidence)?s.evidence:[];
      return '<article class="interview-story">'+
        '<div class="story-topline"><span class="tag">EVIDENCE-BACKED SCAFFOLD</span><span class="story-evidence-count">'+n(ev.length)+' refs</span></div>'+
        '<h3>'+esc(s.headline||s.title||s.name||'Interview story')+'</h3>'+
        '<div class="interview-question">'+esc(s.interviewQuestion||'Interview question unavailable.')+'</div>'+
        '<div class="interview-block"><label>Context</label><p>'+esc(s.context||'—')+'</p></div>'+
        '<div class="interview-block"><label>Situation</label><p>'+esc(draft.situation||s.situation||'—')+'</p></div>'+
        '<div class="interview-block"><label>Approach / evidence</label><p>'+esc(draft.approach||s.action||s.actions||'—')+'</p></div>'+
        '<div class="interview-block"><label>Evidence-backed result</label><p>'+esc(draft.evidenceBackedResult||s.result||s.outcome||'—')+'</p></div>'+
        '<div class="interview-verification"><strong>Verification</strong><br>'+esc(v.ownership||'Ownership verification required.')+' '+esc(v.runtimeImpact||'Runtime impact verification required.')+'</div>'+
        '<div class="interview-meta"><button class="btn" type="button" data-action="copy-story" data-story-id="'+esc(s.id||'')+'">Copy draft</button>'+(ev.length?inspectButton('Inspect story evidence','Evidence references selected for this interview scaffold.',ev):'<span class="dim">No direct evidence references.</span>')+'</div>'+
      '</article>';
    }).join('');
    return shell('Interview','Turn project evidence into truthful engineering stories. These are scaffolds for preparation, not proof of personal ownership.')+
      '<section class="interview-topology"><div class="interview-stat"><span>STORIES</span><strong>'+n(q.length)+'</strong><small>returned scaffolds</small></div><div class="interview-stat"><span>EVIDENCE-LINKED</span><strong>'+n(linked)+'</strong><small>stories with direct references</small></div><div class="interview-stat"><span>VERIFICATION</span><strong>'+n(verified)+'</strong><small>stories with verification notes</small></div></section>'+
      '<section class="interview-readme">'+
        '<div class="card"><div class="kicker">HOW TO USE THIS SURFACE</div><h3 style="margin-top:5px">Prepare from evidence, then verify ownership yourself.</h3><div class="interview-rule"><div><b>01</b><span>Read the generated scaffold as a starting structure, not a finished personal answer.</span></div><div><b>02</b><span>Open the cited evidence before describing what you personally changed.</span></div><div><b>03</b><span>Keep runtime impact separate from source-level history unless runtime evidence supports it.</span></div><div><b>04</b><span>Do not turn missing evidence into an invented result or business outcome.</span></div></div></div>'+
        '<div class="card"><div class="kicker">SOURCE BOUNDARY</div><h3 style="margin-top:5px">Current analysis snapshot</h3><div class="sub">Story generation is valid only for the completed analysis snapshot shown here.</div><div class="quality-mini-list"><span><b>Run</b><b class="mono">'+esc(S.runId||'—')+'</b></span><span><b>Target</b><b class="mono">'+esc(sha(a.targetHeadSha))+'</b></span><span><b>Status</b><b>'+esc(a.status||'unknown')+'</b></span></div></div>'+
      '</section>'+
      (current?'<section class="grid g2 section">'+storyMarkup+'</section>':'<section class="empty section"><strong>Current interview stories are not loaded.</strong><span>Generate the stories from the current completed analysis snapshot. Older story output is intentionally not reused.</span></section>');
  }
  function storiesHtml(x){
    var q=x&&x.result&&x.result.stories||x&&x.stories||x&&x.result||[];
    if(!Array.isArray(q))q=Object.keys(q||{}).map(function(k){return Object.assign({title:k},q[k]||{})});
    var evidenceLinked=0,verificationNotes=0;
    q.forEach(function(s){if(Array.isArray(s.evidence)&&s.evidence.length)evidenceLinked++;if(s.verification&&(s.verification.ownership||s.verification.runtimeImpact))verificationNotes++});
    var storyRows=q.map(function(s){
      var a=s.draftAnswer||{},v=s.verification||{},ev=Array.isArray(s.evidence)?s.evidence:[];
      return '<article class="story"><div class="story-topline"><span class="tag">evidence-backed scaffold</span><span class="story-evidence-count">'+n(ev.length)+' refs</span></div><h3>'+esc(s.headline||s.title||s.name||'Interview story')+'</h3><div class="sub">'+esc(s.interviewQuestion||'Interview question unavailable.')+'</div><block><label>Context</label><div>'+esc(s.context||'—')+'</div></block><block><label>Situation</label><div>'+esc(a.situation||s.situation||'—')+'</div></block><block><label>Approach / evidence</label><div>'+esc(a.approach||s.action||s.actions||'—')+'</div></block><block><label>Evidence-backed result</label><div>'+esc(a.evidenceBackedResult||s.result||s.outcome||'—')+'</div></block><block><label>Verification</label><div>'+esc(v.ownership||'Ownership verification required.')+' '+esc(v.runtimeImpact||'Runtime impact verification required.')+'</div></block><div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:11px"><button class="btn" type="button" data-action="copy-story" data-story-id="'+esc(s.id||'')+'">Copy draft</button>'+(ev.length?inspectButton("Inspect story evidence","Evidence references selected for this interview scaffold.",ev):'<span class="dim">No direct evidence references.</span>')+'</div></article>';
    }).join('');
    return '<div class="interview-posture card section"><div class="arch-title"><div><h3>Interview evidence map</h3><div class="sub">These are reusable scaffolds, not claims of personal ownership. Verify each story against the cited project evidence.</div></div><span class="tag">truth-first</span></div><div class="interview-posture-grid">'+
      '<div><span>Stories</span><b>'+n(q.length)+'</b><small>returned scaffolds</small></div>'+
      '<div><span>Evidence-linked</span><b>'+n(evidenceLinked)+'</b><small>stories with direct refs</small></div>'+
      '<div><span>Verification notes</span><b>'+n(verificationNotes)+'</b><small>ownership/runtime checks surfaced</small></div>'+
    '</div></div><div class="grid g2">'+(storyRows||'<div class="empty">No interview stories returned.</div>')+'</div>';
  }

  function operationalStatusPill(status){
    var tone=status==='healthy'||status==='ready'?'good':status==='unavailable'?'bad':status==='degraded'?'warn':'warn';
    return '<span class="pill '+tone+'">'+esc(status||'unknown')+'</span>';
  }
  function operationalUptime(seconds){
    var total=Math.max(0,Math.floor(Number(seconds)||0)),days=Math.floor(total/86400),hours=Math.floor((total%86400)/3600),minutes=Math.floor((total%3600)/60);
    if(days)return days+'d '+hours+'h '+minutes+'m';
    if(hours)return hours+'h '+minutes+'m';
    if(minutes)return minutes+'m '+(total%60)+'s';
    return total+'s';
  }
  function operationalFreshness(timestamp){
    var value=timestamp?new Date(timestamp).getTime():NaN;
    if(!Number.isFinite(value))return{label:'No timestamp',tone:'warn'};
    var age=Math.max(0,Date.now()-value);
    if(age<=90_000)return{label:'Live · '+elapsed(timestamp,new Date().toISOString()),tone:'good'};
    return{label:'Stale · '+elapsed(timestamp,new Date().toISOString()),tone:'warn'};
  }
  function operations(){
    var o=S.data.operational,fresh=operationalFreshness(o&&o.timestamp);
    if(!o)return shell('Operations','Inspect the live service separately from repository evidence. This view is safe to refresh without changing analysis state.','<button class="btn primary" data-action="operations-refresh">Check now</button>')+'<section class="empty section"><strong>No operational snapshot is loaded.</strong><span>Check the running API, database, Redis and queue posture.</span></section>';
    var q=o.analysisQueue||{},deps=o.dependencies||{},db=deps.database||{},redis=deps.redis||{},service=o.service||'project-autopsy-api',monitoring=S.operationalTimer?'auto refresh active':'on demand';
    var tone=o.status==='healthy'?'good':o.status==='degraded'?'warn':'bad';
    function healthCard(label,status,detail){return '<div class="card ops-health-card"><div class="ops-health-top"><span>'+esc(label)+'</span>'+operationalStatusPill(status)+'</div><div class="metric">'+esc(status||'unknown')+'</div><div class="metric-label">'+esc(label)+'</div><div class="sub">'+esc(detail||'No detail supplied.')+'</div></div>'}
    return shell('Operations','Monitor the running Autopsy service. Operational status is live telemetry and must never be confused with repository evidence or historical analysis.', '<span class="pill '+tone+'">'+esc(fresh.label)+'</span><button class="btn primary" data-action="operations-refresh"'+(S.operationalLoading?' disabled aria-busy="true"':'')+'>'+(S.operationalLoading?'Checking…':'Refresh status')+'</button>')+
      '<section class="ops-posture card"><div class="panel-head"><div><div class="kicker">LIVE OPERATIONAL POSTURE</div><h3>Current service state</h3><div class="sub">'+esc(service)+' · snapshot '+esc(date(o.timestamp))+'</div></div><span class="tag">'+esc(monitoring)+'</span></div><div class="ops-posture-grid"><div><span>OVERALL</span><b>'+esc(o.status||'unknown')+'</b><small>service-level status</small></div><div><span>DATABASE</span><b>'+esc(db.status||'unknown')+'</b><small>'+esc(ms(db.latencyMs))+' probe latency</small></div><div><span>REDIS</span><b>'+esc(redis.status||'unknown')+'</b><small>'+esc(ms(redis.latencyMs))+' probe latency</small></div><div><span>QUEUE</span><b>'+esc(q.waiting==null?'unavailable':n(q.waiting)+' waiting')+'</b><small>analysis queue telemetry</small></div></div><div class="ops-boundary"><span>BOUNDARY</span><strong>This snapshot describes the running service at capture time.</strong><small>Refreshing operations does not mutate or reinterpret repository evidence.</small></div></section>'+
      '<section class="grid g4 section">'+healthCard('API service',o.status,service)+healthCard('PostgreSQL',db.status,ms(db.latencyMs)+' latency probe')+healthCard('Redis',redis.status,ms(redis.latencyMs)+' latency probe')+healthCard('Queue',q.waiting==null?'unavailable':'ready',q.waiting==null?'queue counters unavailable':n(q.waiting)+' waiting jobs')+'</section>'+
      '<section class="grid g2 section"><div class="card"><div class="panel-head"><div><div class="kicker">ANALYSIS QUEUE</div><h3>BullMQ retention and backlog</h3><div class="sub">Live job counts are operational telemetry only.</div></div><span class="tag">queue scope</span></div><div class="grid g2 section">'+metric('Waiting',q.waiting==null?'—':n(q.waiting))+metric('Active',q.active==null?'—':n(q.active))+metric('Delayed',q.delayed==null?'—':n(q.delayed))+metric('Failed retained',q.failed==null?'—':n(q.failed))+metric('Completed retained',q.completed==null?'—':n(q.completed))+metric('Paused',q.paused==null?'—':n(q.paused))+'</div></div>'+
      '<div class="card"><div class="panel-head"><div><div class="kicker">PROCESS</div><h3>Current API process telemetry</h3><div class="sub">Measurements come from the live service process.</div></div><span class="tag">process scope</span></div><div class="grid g2 section">'+metric('Uptime',operationalUptime(o.process&&o.process.uptimeSeconds))+metric('Node.js',o.process&&o.process.nodeVersion||'—')+metric('RSS',o.process&&o.process.rssMb!=null?n(o.process.rssMb)+' MB':'—')+metric('Heap used',o.process&&o.process.heapUsedMb!=null?n(o.process.heapUsedMb)+' MB':'—')+'</div></div></section>'+
      (o.status==='healthy'?'':'<section class="callout section"><strong>Operational attention required.</strong><br>One or more live checks are not healthy. Repository evidence remains unchanged; retry this snapshot after the service recovers.</section>');
  }
  function stopOperationsMonitoring(){
    if(S.operationalTimer){clearInterval(S.operationalTimer);S.operationalTimer=null}
  }
  function scheduleOperationsMonitoring(){
    stopOperationsMonitoring();
    if(S.view!=='operations'||document.hidden)return;
    var token=S.workspaceToken;
    S.operationalTimer=setInterval(function(){
      if(token!==S.workspaceToken||S.view!=='operations'||document.hidden){stopOperationsMonitoring();return}
      loadOperations(true,true);
    },S.operationalPollMs);
  }
  function syncOperationsMonitoring(){
    if(S.view==='operations')scheduleOperationsMonitoring();else stopOperationsMonitoring();
  }
  async function loadOperations(force,silent){
    if(S.operationalLoading)return;
    if(!force&&S.data.operational!==undefined&&S.data.operational!==null)return;
    var token=S.workspaceToken,loadToken=++S.operationalLoadToken;
    S.operationalLoading=true;
    if(!silent)$('root').innerHTML=loadingPage('Operations','Checking live PostgreSQL, Redis and analysis queue health…');
    try{
      var r=await api('/api/observability/summary',{acceptStatuses:[503]});
      if(token!==S.workspaceToken||loadToken!==S.operationalLoadToken||S.view!=='operations')return;
      S.data.operational=r;
      S.operationalLoading=false;
      setView('operations',{skipLoad:true,preserveScroll:true});
      if(!silent)toast(r.status==='healthy'?'Operational status is healthy':'Operational status is degraded',r.status==='healthy'?'good':'warn');
    }catch(e){
      if(token===S.workspaceToken&&loadToken===S.operationalLoadToken&&S.view==='operations'){
        if(silent&&S.data.operational){
          S.operationalLoading=false;
          setView('operations',{skipLoad:true,preserveScroll:true});
          toast('Operational status refresh failed; showing the last known snapshot','warn');
        }else{
          $('root').innerHTML=errorPage('Operations',e.message||'Operational status could not be loaded.','Retry status','operations-retry');
          toast(e.message||'Operational status could not be loaded','bad');
        }
      }
    }finally{
      if(loadToken===S.operationalLoadToken)S.operationalLoading=false;
    }
  }

  const VALID_VIEWS=['overview','history','structure','quality','runtime','report','interview','interpretation','evidence','contributors','operations'];
  const VIEW_TITLES={overview:'Overview',history:'History',structure:'Structure',quality:'Quality',runtime:'Runtime & provenance',report:'Report',interview:'Interview',interpretation:'Insights',evidence:'Evidence explorer',contributors:'Contributors',operations:'Operations'};
  function viewFromHash(){var v=(location.hash||'').replace(/^#/,'').trim();return VALID_VIEWS.indexOf(v)>=0?v:'overview'}
  function setView(v,options){
    options=options||{};
    if($('drawer')&&!$('drawer').hidden)closeEvidence(false);
    var previous=S.view;
    if(previous)S.viewScroll[previous]=window.scrollY||0;
    S.view=v;
    document.body.dataset.view=v;
    if(!options.fromHash&&location.hash!=='#'+v)history.pushState(null,'','#'+v);
    resetEvidence();
    document.querySelectorAll('#nav button').forEach(function(b){var active=b.getAttribute('data-view')===v;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});document.title='Project Autopsy — '+(VIEW_TITLES[v]||'Workspace');
    var h=v==='history'?historyView():v==='structure'?structure():v==='quality'?quality():v==='runtime'?runtime():v==='report'?reportPage():v==='interview'?interview():v==='interpretation'?interpretation():v==='evidence'?evidencePage():v==='contributors'?contributors():v==='operations'?operations():overview();
    $('root').innerHTML=h;
    var restore=S.viewScroll[v]||0;
    requestAnimationFrame(function(){window.scrollTo(0,restore)});
    ensureTableEmptyStates();
    bindTableSorts();
    bindViewSearch();
    if(v==='evidence'){
      var q=$('evidenceSearch');
      if(q){
        var clear=$('evidenceSearchClear'),count=$('evidenceSearchCount'),scope=$('evidenceScopeCount'),apply=function(){
          var term=q.value.trim().toLowerCase(),family=S.evidenceFamily||'all',shown=0,total=0;
          document.querySelectorAll('.evidence-row').forEach(function(row){
            total++;
            var familyOk=family==='all'||row.getAttribute('data-family')===family;
            var textOk=!term||(row.getAttribute('data-search')||'').indexOf(term)>=0;
            var ok=familyOk&&textOk;row.hidden=!ok;if(ok)shown++;
          });
          document.querySelectorAll('[data-evidence-family]').forEach(function(button){button.classList.toggle('active',button.getAttribute('data-evidence-family')===family)});
          var empty=$('evidenceEmpty');if(empty)empty.hidden=shown!==0;
          if(count)count.textContent=term||family!=='all'?(shown+' matching'):(total+' loaded');
          if(scope)scope.textContent=shown+' inspectable records';
        };
        q.oninput=apply;
        if(clear)clear.onclick=function(){q.value='';S.evidenceFamily='all';apply();q.focus()};
        apply();
      }
    }
    if(v==='operations'&&!options.skipLoad&&S.data.operational===undefined)loadOperations();else if(!options.skipLoad&&VIEW_DATA[v]&&!hasViewData(v))loadViewData(v);
    syncOperationsMonitoring()
  }
  const COMMAND_DEFS=[
    {id:'overview',group:'NAVIGATE',label:'Open Overview',detail:'Current snapshot, analysis boundary and repository posture.'},
    {id:'history',group:'NAVIGATE',label:'Open History',detail:'Chronological commits and timeline evidence.'},
    {id:'structure',group:'NAVIGATE',label:'Open Structure',detail:'Architecture, dependencies and complexity evidence.'},
    {id:'quality',group:'NAVIGATE',label:'Open Quality',detail:'Tests, repeated change, refactor and bug-area signals.'},
    {id:'runtime',group:'NAVIGATE',label:'Open Runtime',detail:'Telemetry, deployments and revision provenance.'},
    {id:'report',group:'NAVIGATE',label:'Open Report',detail:'Evidence-backed engineering report.'},
    {id:'interview',group:'NAVIGATE',label:'Open Interview',detail:'Evidence-linked interview story scaffolds.'},
    {id:'interpretation',group:'NAVIGATE',label:'Open Insights',detail:'Current-report engineering interpretation with evidence boundaries.'},
    {id:'evidence',group:'NAVIGATE',label:'Open Evidence Explorer',detail:'Search and inspect the exact records behind workspace outputs.'},
    {id:'contributors',group:'NAVIGATE',label:'Open Contributors',detail:'Contributor history and change distribution.'},
    {id:'operations',group:'NAVIGATE',label:'Open Operations',detail:'Live API, database, Redis and queue posture.'}
  ];
  const SEARCHABLE_VIEWS=['history','structure','quality','evidence','contributors'];
  function commandPaletteCommands(){
    var commands=COMMAND_DEFS.slice().sort(function(a,b){
      return a.id===S.view?-1:b.id===S.view?1:0;
    });
    if(S.repoId){
      if(SEARCHABLE_VIEWS.indexOf(S.view)>=0){
        commands.push({id:'search',group:'ACTIONS',label:S.view==='evidence'?'Focus evidence search':'Focus page search',detail:S.view==='evidence'?'Search the loaded evidence records locally.':'Jump to the current workspace filter.',shortcut:'/'});
      }
      commands.push({id:'refresh-view',group:'ACTIONS',label:'Refresh current view',detail:'Reload the evidence or live data backing this page.',shortcut:'R'});
      commands.push({id:'settings',group:'ACTIONS',label:'Open account & workspace settings',detail:'Manage account, sessions, repository access and trusted connection.'});
      var source=safeExternalUrl(S.repo&&(S.repo.source_url||S.repo.sourceUrl));
      if(source)commands.push({id:'source',group:'ACTIONS',label:'Open source repository',detail:'Open the tracked repository in a new tab.'});
      commands.push({id:'landing',group:'ACTIONS',label:'Analyze another repository',detail:'Return to the repository import surface.'});
    }else{
      commands.push({id:'landing',group:'ACTIONS',label:'Analyze a repository',detail:'Return to the repository import surface.'});
      commands.push({id:'settings',group:'ACTIONS',label:'Open sign in',detail:'Authenticate to access a private workspace.'});
    }
    commands.push({id:'theme',group:'PREFERENCES',label:document.documentElement.dataset.theme==='light'?'Switch to dark theme':'Switch to light theme',detail:'Change the product theme. Your explicit choice is remembered.'});
    return commands;
  }
  function commandPaletteMatches(){
    var term=S.commandPaletteQuery.trim().toLowerCase(),all=commandPaletteCommands();
    if(!term)return all;
    return all.filter(function(command){
      return (command.label+' '+command.detail+' '+command.group).toLowerCase().indexOf(term)>=0;
    });
  }
  function refreshVisibleView(){
    if(!S.repoId)return;
    if(S.view==='runtime')return loadRuntimeEvents(true);
    if(S.view==='report')return loadReport();
    if(S.view==='interview')return loadInterview();
    if(S.view==='interpretation')return loadInterpretation();
    if(S.view==='operations')return loadOperations(true);
    return reloadCurrentView();
  }
  function commandPaletteRun(id){
    if(id&&id.indexOf('view:')===0){closeCommandPalette();setView(id.slice(5));return}
    if(id==='search'){var input=S.view==='evidence'?$('evidenceSearch'):$('viewSearch');if(input){closeCommandPalette(false);input.focus();input.select()}else toast('This view has no local search filter','warn');return}
    if(id==='refresh-view'){closeCommandPalette();refreshVisibleView();return}
    if(id==='settings'){closeCommandPalette();S.user?openSettings($('settings')):openAuth('login');return}
    if(id==='source'){var url=safeExternalUrl(S.repo&&(S.repo.source_url||S.repo.sourceUrl));if(url){closeCommandPalette();window.open(url,'_blank','noopener,noreferrer')}return}
    if(id==='landing'){closeCommandPalette();$('new').click();return}
    if(id==='theme'){var next=document.documentElement.dataset.theme==='light'?'dark':'light';closeCommandPalette();applyTheme(next,true,true);return}
    if(id&&VALID_VIEWS.indexOf(id)>=0){closeCommandPalette();setView(id);return}
  }
  function renderCommandPalette(){
    var list=$('commandList'),input=$('commandSearch');
    if(!list)return;
    var commands=commandPaletteMatches();
    if(!commands.length){
      S.commandPaletteIndex=0;
      list.innerHTML='<div class="command-empty"><strong>No matching commands</strong><span>Try a page name, action or filter.</span></div>';
      if(input)input.removeAttribute('aria-activedescendant');
      return;
    }
    S.commandPaletteIndex=Math.max(0,Math.min(S.commandPaletteIndex,commands.length-1));
    var html='',lastGroup='';
    commands.forEach(function(command,index){
      if(command.group!==lastGroup){html+='<div class="command-group">'+esc(command.group)+'</div>';lastGroup=command.group}
      var selected=index===S.commandPaletteIndex;
      html+='<button type="button" class="command-item'+(selected?' active':'')+'" role="option" aria-selected="'+selected+'" data-command-id="'+esc(command.id)+'" id="command-option-'+esc(command.id)+'"><span class="command-glyph">'+esc(command.group==='NAVIGATE'?'→':command.group==='ACTIONS'?'⌁':'◐')+'</span><span class="command-copy"><strong>'+esc(command.label)+'</strong><small>'+esc(command.detail)+'</small></span>'+(command.shortcut?'<kbd>'+esc(command.shortcut)+'</kbd>':'')+' </button>';
    });
    list.innerHTML=html;
    var selectedEl=list.querySelector('.command-item.active');
    if(selectedEl&&input)input.setAttribute('aria-activedescendant',selectedEl.id);
    selectedEl&&selectedEl.scrollIntoView({block:'nearest'});
  }
  function moveCommandSelection(delta){
    var commands=commandPaletteMatches();if(!commands.length)return;
    S.commandPaletteIndex=(S.commandPaletteIndex+delta+commands.length)%commands.length;
    renderCommandPalette();
  }
  function openCommandPalette(trigger){
    if(!$('commandPalette')||!$('commandPalette').hidden)return;
    if(!$('authModal').hidden||!$('modal').hidden||!$('confirmModal').hidden||!$('drawer').hidden)return;
    S.commandPaletteFocus=trigger||document.activeElement;
    S.commandPaletteQuery='';S.commandPaletteIndex=0;
    $('commandPalette').hidden=false;
    renderCommandPalette();
    requestAnimationFrame(function(){var input=$('commandSearch');if(input){input.focus();input.select()}});
  }
  function closeCommandPalette(restoreFocus){
    var palette=$('commandPalette');if(!palette||palette.hidden)return;
    palette.hidden=true;
    var focus=S.commandPaletteFocus;S.commandPaletteFocus=null;S.commandPaletteQuery='';S.commandPaletteIndex=0;
    if(restoreFocus!==false&&focus&&typeof focus.focus==='function')requestAnimationFrame(function(){try{focus.focus()}catch(e){}});
  }

  async function loadRuntimeEvents(reset){if(S.runtimeLoading)return;var token=S.workspaceToken,id=S.repoId,runId=S.runId;S.runtimeLoading=true;actionBusy(reset?'runtime-filter':'runtime-more',true,reset?'Applying…':'Loading…');actionBusy('runtime-clear-filter',true,'Clear');var previousEvents=S.runtimeEvents,previousPage=S.runtimePagination,previousFilter=S.runtimeFilter;try{var f={from:($('rtFrom')&&$('rtFrom').value)||S.runtimeFilter.from||'',to:($('rtTo')&&$('rtTo').value)||S.runtimeFilter.to||'',deploymentId:($('rtDeployment')&&$('rtDeployment').value.trim())||S.runtimeFilter.deploymentId||'',revisionSha:($('rtRevision')&&$('rtRevision').value.trim())||S.runtimeFilter.revisionSha||'',environment:($('rtEnvironment')&&$('rtEnvironment').value.trim())||S.runtimeFilter.environment||'',operationName:($('rtOperation')&&$('rtOperation').value.trim())||S.runtimeFilter.operationName||'',signalType:($('rtSignal')&&$('rtSignal').value)||S.runtimeFilter.signalType||''};var page=reset?1:Number(S.runtimePagination&&S.runtimePagination.page||1)+1;if(f.from&&f.to&&new Date(f.from).getTime()>=new Date(f.to).getTime())throw new Error('From must be earlier than To.');if(f.revisionSha&&!/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/.test(f.revisionSha))throw new Error('Revision SHA must be exactly 40 or 64 hexadecimal characters.');var r=await api(runtimeEventsPathWithFilter(page,40,f));if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId)return;var next=arr(r,'events');S.runtimeFilter=f;S.runtimeEvents=reset?next:previousEvents.concat(next);S.runtimePagination=r.pagination;S.data.runtimeEvents=r;S.dataErrors=S.dataErrors.filter(function(e){return e.key!=='runtimeEvents'});setView('runtime');toast(next.length?'Runtime evidence loaded':'No runtime events matched the filters','good')}catch(e){if(token===S.workspaceToken&&id===S.repoId&&runId===S.runId){S.runtimeEvents=previousEvents;S.runtimePagination=previousPage;S.runtimeFilter=previousFilter;toast(e.message||'Runtime evidence load failed','bad')}}finally{if(token===S.workspaceToken&&id===S.repoId)S.runtimeLoading=false;actionBusy('runtime-filter',false);actionBusy('runtime-more',false);actionBusy('runtime-clear-filter',false)}}
  async function reloadCurrentView(){
    var view=S.view;
    if(RELOADABLE_VIEWS.indexOf(view)<0||!S.repoId)return;
    await loadViewData(view,{force:true});
  }
  async function loadMoreAnalysisRuns(){
    if(S.analysisRunsLoading)return;
    var token=S.workspaceToken,id=S.repoId,runId=S.runId,loadToken=++S.analysisRunsLoadToken;
    var current=arr(S.data.analysisRuns,'runs'),pagination=S.data.analysisRuns&&S.data.analysisRuns.pagination||{},page=Number(pagination.page||1)+1;
    if(!pagination.totalPages||page>pagination.totalPages)return;
    S.analysisRunsLoading=true;actionBusy('analysis-runs-more',true,'Loading…');
    try{
      var r=await api('/api/repositories/'+id+'/analysis-runs?page='+page+'&limit='+(pagination.limit||20));
      if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId||loadToken!==S.analysisRunsLoadToken)return;
      S.data.analysisRuns={runs:current.concat(arr(r,'runs')),pagination:r.pagination};
      setView('overview');
      toast(arr(r,'runs').length?'Loaded older analysis runs':'No older analysis runs','good');
    }catch(e){
      if(token===S.workspaceToken&&id===S.repoId&&runId===S.runId&&loadToken===S.analysisRunsLoadToken){
        toast(e.message||'Analysis history could not be loaded','bad');
      }
    }finally{
      if(loadToken===S.analysisRunsLoadToken)S.analysisRunsLoading=false;actionBusy('analysis-runs-more',false);
    }
  }
  async function reloadData(){
    var token=S.workspaceToken,id=S.repoId,runId=S.runId,view=S.view;
    try{
      await loadData();
      if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId)return;
      setView(view,{skipLoad:true});
      toast(S.dataErrors.length?'Evidence load still has unavailable sources':'Evidence sources loaded',S.dataErrors.length?'warn':'good');
    }catch(e){toast(e.message,'bad')}
  }
  function historicalRuntimePath(kind,page,limit,filter){
    var f=filter||S.historicalFilter||{windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''};
    var q=['page='+encodeURIComponent(page||1),'limit='+encodeURIComponent(limit||25),'windowMinutes='+encodeURIComponent(f.windowMinutes||60),'minSamples='+encodeURIComponent(f.minSamples||10)];
    [['deploymentId',f.deploymentId],['environment',f.environment],['operationName',f.operationName],['signalType',f.signalType]].forEach(function(x){if(x[1])q.push(x[0]+'='+encodeURIComponent(x[1]))});
    var base='/api/repositories/'+S.repoId+'/runtime/historical-correlation';
    if(kind==='summary')base+='/summary';
    if(kind==='source-context')base+='/source-context';
    return base+'?'+q.join('&');
  }
  async function loadHistoricalRuntime(){
    if(S.historicalLoading)return;actionBusy('historical-filter',true,'Applying…');actionBusy('historical-clear-filter',true,'Reset');
    var token=S.workspaceToken,id=S.repoId,runId=S.runId,loadToken=++S.historicalLoadToken,previousFilter=S.historicalFilter,previousSummary=S.data.historicalSummary,previousCorrelation=S.data.historicalCorrelation,previousSourceContext=S.data.historicalSourceContext;
    S.historicalLoading=true;
    try{
      var windowMinutes=Number(($('histWindow')&&$('histWindow').value)||S.historicalFilter.windowMinutes||60);
      var minSamples=Number(($('histSamples')&&$('histSamples').value)||S.historicalFilter.minSamples||10);
      if(!Number.isInteger(windowMinutes))windowMinutes=60;
      if(!Number.isInteger(minSamples))minSamples=10;
      var f={
        windowMinutes:Math.max(5,Math.min(1440,windowMinutes)),
        minSamples:Math.max(1,Math.min(10000,minSamples)),
        deploymentId:(($('histDeployment')&&$('histDeployment').value.trim())||S.historicalFilter.deploymentId||''),
        environment:(($('histEnvironment')&&$('histEnvironment').value.trim())||S.historicalFilter.environment||''),
        operationName:(($('histOperation')&&$('histOperation').value.trim())||S.historicalFilter.operationName||''),
        signalType:(($('histSignal')&&$('histSignal').value)||S.historicalFilter.signalType||'')
      };
      var pages=[
        api(historicalRuntimePath('summary',1,25,f)),
        api(historicalRuntimePath('correlation',1,25,f)),
        api(historicalRuntimePath('source-context',1,25,f))
      ];
      var results=await Promise.all(pages);
      if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId||loadToken!==S.historicalLoadToken)return;
      S.historicalFilter=f;
      S.data.historicalSummary=results[0];
      S.data.historicalCorrelation=results[1];
      S.data.historicalSourceContext=results[2];
      S.dataErrors=S.dataErrors.filter(function(e){return e.key!=='historicalSummary'&&e.key!=='historicalCorrelation'&&e.key!=='historicalSourceContext'});
      if(S.view==='runtime'){
        setView('runtime');
        toast('Historical runtime evidence refreshed','good');
      }
    }catch(e){
      if(token===S.workspaceToken&&id===S.repoId&&runId===S.runId&&loadToken===S.historicalLoadToken){
        S.historicalFilter=previousFilter;
        S.data.historicalSummary=previousSummary;
        S.data.historicalCorrelation=previousCorrelation;
        S.data.historicalSourceContext=previousSourceContext;
        toast(e.message||'Historical runtime evidence refresh failed','bad');
      }
    }finally{
      if(token===S.workspaceToken&&id===S.repoId&&runId===S.runId&&loadToken===S.historicalLoadToken)S.historicalLoading=false;
      actionBusy('historical-filter',false);
      actionBusy('historical-clear-filter',false);
    }
  }
  async function loadMoreTimeline(){
    if(S.timelineLoading)return;
    var token=S.workspaceToken,id=S.repoId,runId=S.runId,loadToken=++S.timelineLoadToken;
    S.timelineLoading=true;
    try{
      var current=arr(S.data.timeline,'events'),pagination=S.data.timeline&&S.data.timeline.pagination||{},page=Number(pagination.page||1)+1;
      if(!pagination.totalPages||page>pagination.totalPages)return;
      actionBusy('more-timeline',true,'Loading…');
      var r=await api('/api/repositories/'+id+'/timeline?page='+page+'&limit='+(pagination.limit||50));
      if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId||loadToken!==S.timelineLoadToken)return;
      var next=arr(r,'events');
      S.data.timeline={events:current.concat(next),pagination:r.pagination};
      setView('history');
      toast(next.length?'Loaded next timeline page':'No more timeline evidence','good');
    }catch(e){
      if(token===S.workspaceToken&&id===S.repoId&&runId===S.runId&&loadToken===S.timelineLoadToken)toast(e.message||'Timeline evidence could not be loaded','bad');
    }finally{
      if(loadToken===S.timelineLoadToken){S.timelineLoading=false;actionBusy('more-timeline',false)}
    }
  }
  async function loadMoreCommits(){
    if(S.commitLoading)return;actionBusy('more-commits',true,'Loading…');
    var token=S.workspaceToken,id=S.repoId,runId=S.runId,loadToken=++S.commitLoadToken;
    S.commitLoading=true;
    try{
      var current=arr(S.data.commits,'commits'),page=Number(S.data.commits&&S.data.commits.pagination&&S.data.commits.pagination.page||1)+1;
      var r=await api('/api/repositories/'+id+'/commits?page='+page+'&limit=50');
      if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId||loadToken!==S.commitLoadToken)return;
      var next=arr(r,'commits');
      S.data.commits={commits:current.concat(next),pagination:r.pagination};
      setView('history');
      toast(next.length?'Loaded next commit page':'No more commit evidence','good');
    }catch(e){if(token===S.workspaceToken&&id===S.repoId&&runId===S.runId&&loadToken===S.commitLoadToken)toast(e.message,'bad')}
    finally{if(loadToken===S.commitLoadToken){S.commitLoading=false;actionBusy('more-commits',false)}}
  }
  async function loadProvenance(deploymentId,trigger){
    if(S.provenanceLoading)return;
    S.provenanceLoading=true;
    var token=S.workspaceToken,id=S.repoId,runId=S.runId;
    try{
      var r=await api('/api/repositories/'+id+'/deployments/provenance?deploymentId='+encodeURIComponent(deploymentId));
      if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId)return;
      S.currentEvidence={label:'Provenance · '+deploymentId,basis:'Exact deployment evidence reconciliation between observed deployment fields and available runtime identity.',payload:r};S.focusReturn=trigger||document.activeElement;
      $('drawerTitle').textContent=S.currentEvidence.label;
      $('drawerBasis').textContent=S.currentEvidence.basis;
      if($('drawerSummary'))$('drawerSummary').innerHTML=evidenceSummary(r);
      if($('drawerRaw'))$('drawerRaw').open=false;
      $('drawerJson').textContent=JSON.stringify(r,null,2);
      $('drawer').hidden=false;
      requestAnimationFrame(function(){$('drawerClose').focus()});
    }catch(e){if(token===S.workspaceToken&&id===S.repoId&&runId===S.runId)toast(e.message,'bad')}
    finally{S.provenanceLoading=false}
  }
  async function loadReport(){
    if(S.reportLoading)return;
    S.reportLoading=true;
    var token=S.workspaceToken,id=S.repoId,runId=S.runId;
    setView('report');
    actionBusy('report',true,'Generating…');
    $('root').innerHTML=loadingPage('Evidence report','Building a readable report from the current completed evidence snapshot.');
    try{
      var r=await api('/api/repositories/'+id+'/report?limit=10');
      if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId||S.view!=='report')return;
      S.data.report=r.report;
      setView('report');
      toast('Evidence report refreshed','good');
    }catch(e){
      if(token===S.workspaceToken&&id===S.repoId&&runId===S.runId&&S.view==='report'){
        $('root').innerHTML=errorPage('Evidence report',e.message||'The report could not be generated.','Try again','report');
        toast(e.message,'bad');
      }
    }finally{
      S.reportLoading=false;
      if(S.view==='report')actionBusy('report',false);
    }
  }
  async function loadInterview(){
    if(S.interviewLoading)return;
    S.interviewLoading=true;
    var token=S.workspaceToken,id=S.repoId,runId=S.runId;
    setView('interview');
    actionBusy('interview',true,'Loading…');
    $('root').innerHTML=loadingPage('Interview','Turning the evidence snapshot into verifiable talking points.');
    try{
      var r=await api('/api/repositories/'+id+'/interview-stories?limit=6');
      if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId||S.view!=='interview')return;
      S.data.interview=r;
      setView('interview');
      toast('Interview stories loaded','good');
    }catch(e){
      if(token===S.workspaceToken&&id===S.repoId&&runId===S.runId&&S.view==='interview'){
        $('root').innerHTML=errorPage('Interview',e.message||'Interview stories could not be generated.','Try again','interview');
        toast(e.message,'bad');
      }
    }finally{
      S.interviewLoading=false;
      if(S.view==='interview')actionBusy('interview',false);
    }
  }
  async function loadInterpretation(){
    if(S.interpretationLoading)return;
    S.interpretationLoading=true;
    var token=S.workspaceToken,id=S.repoId,runId=S.runId;
    try{
      setView('interpretation');
      actionBusy('interpretation',true,'Generating…');
      $('root').innerHTML=loadingPage('Engineering insights','Grounding the current report into themes, questions and uncertainties.');
      var r=await api('/api/repositories/'+id+'/interpretation?limit=10');
      if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId||S.view!=='interpretation')return;
      S.data.interpretation=r;
      setView('interpretation');
      toast('Insights refreshed','good');
    }catch(e){
      if(token===S.workspaceToken&&id===S.repoId&&runId===S.runId&&S.view==='interpretation'){
        var message=e&&e.message?String(e.message):'Insights could not be generated.';
        var action='interpretation',label='Try again',title='Engineering insights',body=message;
        if(/REPORT_NOT_READY|Generate the latest report|current report/i.test(message)){
          title='Report needs refresh';
          body='The insights endpoint no longer matches the current repository snapshot. Refresh the report, then generate insights again.';
          action='report';
          label='Refresh report';
        }else if(/AI_INTERPRETATION_NOT_CONFIGURED|server-side interpretation is not configured/i.test(message)){
          title='Insights are not configured';
          body='The current report remains available. Server-side interpretation is not configured for this workspace.';
        }else if(/AI_INTERPRETATION_PROVIDER_ERROR|AI provider/i.test(message)){
          title='Insights provider unavailable';
          body='The report is intact, but the configured AI provider did not complete the interpretation request. Retry after the provider is available.';
        }else if(/AI_INTERPRETATION_INVALID_OUTPUT|structured output|invalid output/i.test(message)){
          title='Insights output could not be validated';
          body='The provider returned a response that did not satisfy the evidence-grounded output contract. No interpretation was persisted from that response.';
        }
        $('root').innerHTML=errorPage(title,body,label,action);
        toast(body,'bad');
      }
    }finally{
      S.interpretationLoading=false;
      actionBusy('interpretation',false);
    }
  }
  function downloadReport(){if(!S.data.report){toast('Generate the report first','bad');return}var blob=new Blob([JSON.stringify(S.data.report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='project-autopsy-report.json';a.click();URL.revokeObjectURL(url);toast('Report JSON exported','good')}
  async function refresh(){if(S.refreshLoading)return;stopOperationsMonitoring();S.refreshLoading=true;var refreshButton=$('refresh'),refreshLabel=refreshButton&&refreshButton.textContent;if(refreshButton){refreshButton.disabled=true;refreshButton.setAttribute('aria-busy','true');refreshButton.textContent='Refreshing…'}
    S.workspaceToken+=1;clearInterval(S.timer);S.timer=null;S.commitLoadToken+=1;S.commitLoading=false;S.runtimeLoading=false;S.analysisRunsLoading=false;S.analysisRunsLoadToken+=1;S.historicalLoading=false;S.historicalLoadToken+=1;S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''};S.historicalFilter={windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''};S.viewFilter={};S.tableSort={};S.viewLoading={};
    var token=S.workspaceToken,id=S.repoId;
    try{
      var r=await api('/api/repositories/'+id+'/analyze',{method:'POST',body:'{}'});
      if(token!==S.workspaceToken||id!==S.repoId)return;
      S.runId=r.analysis.id;S.analysis=r.analysis;syncAnalysisRefreshControl();
      S.data.report=null;S.data.interview=null;S.data.interpretation=null;
      persist();poll();syncOperationsMonitoring();toast('Refresh analysis queued')
    }catch(e){if(token===S.workspaceToken&&id===S.repoId)toast(e.message,'bad')}
    finally{S.refreshLoading=false;if(refreshButton){refreshButton.disabled=false;refreshButton.removeAttribute('aria-busy');if(refreshLabel)refreshButton.textContent=refreshLabel}}
  }
  function formatUserAgent(ua){
    var value=String(ua||'').trim();
    return value?value.slice(0,180):'Browser session';
  }
  async function loadSecuritySessions(){
    var zone=$('sessionsList');
    if(!zone)return;
    if(!S.user){
      zone.innerHTML='<div class="callout">Sign in to manage active sessions.</div>';
      return;
    }
    zone.innerHTML='<div class="callout">Loading active sessions…</div>';
    try{
      var r=await api('/api/auth/sessions');
      var sessions=arr(r,'sessions');
      if(!sessions.length){
        zone.innerHTML='<div class="callout">No active sessions were found.</div>';
        return;
      }
      zone.innerHTML=sessions.map(function(session){
        var current=!!session.isCurrent;
        return '<div class="security-session '+(current?'current':'')+'"><div class="security-session-head"><div><div class="session-badge">'+(current?'CURRENT SESSION':'ACTIVE SESSION')+'</div><strong>'+esc(formatUserAgent(session.userAgent))+'</strong><small>Last seen '+esc(date(session.lastSeenAt))+' · Expires '+esc(date(session.expiresAt))+'</small></div><button class="btn danger revoke-session" type="button" data-session-id="'+esc(session.id)+'" data-current="'+(current?'1':'0')+'">'+(current?'Sign out':'Revoke')+'</button></div></div>';
      }).join('');
    }catch(e){
      zone.innerHTML='<div class="callout">Sessions could not be loaded right now.</div>';
    }
  }
  async function revokeOneSession(sessionId,isCurrent){
    if(!sessionId||!S.user)return;
    try{
      var r=await api('/api/auth/sessions/'+encodeURIComponent(sessionId),{method:'DELETE'});
      if(r.signedOutCurrentSession||isCurrent){
        await logoutLocalState(false);
        openAuth('login');
        toast('Current session signed out.','good');
        return;
      }
      toast('Session revoked.','good');
      await loadSecuritySessions();
    }catch(e){
      toast(e.message||'Could not revoke the session.','bad');
    }
  }
  function confirmRevokeAllSessions(){
    if(S.confirmResolver)return Promise.resolve(false);
    return new Promise(function(resolve){
      S.confirmResolver=resolve;
      S.confirmFocus=document.activeElement;
      $('confirmTitle').textContent='Revoke all active sessions?';
      $('confirmText').textContent='This signs out every active session on this account, including this browser.';
      var warning=$('confirmWarning');
      if(warning)warning.textContent='The current browser will be signed out too. You will need to sign in again.';
      $('confirmConfirm').textContent='Revoke all sessions';
      $('confirmModal').hidden=false;
      requestAnimationFrame(function(){$('confirmCancel').focus()});
    });
  }
  async function revokeAllSessions(){
    if(S.sessionRevoking||!S.user)return;
    S.sessionRevoking=true;
    var button=$('revokeSessions'),idle=button&&button.textContent;
    if(button){
      button.disabled=true;
      button.setAttribute('aria-busy','true');
      button.textContent='Revoking…';
    }
    try{
      if(!await confirmRevokeAllSessions())return;
      var response=await api('/api/auth/sessions');
      var sessions=arr(response,'sessions');
      var current=sessions.find(function(session){return !!session.isCurrent});
      var others=sessions.filter(function(session){return !session.isCurrent});
      var revokedOthers=0,failedOthers=0;
      for(var i=0;i<others.length;i++){
        try{
          await api('/api/auth/sessions/'+encodeURIComponent(others[i].id),{method:'DELETE'});
          revokedOthers++;
        }catch(e){
          failedOthers++;
        }
      }
      if(failedOthers){
        try{
          var retryResponse=await api('/api/auth/sessions');
          var remainingOthers=arr(retryResponse,'sessions').filter(function(session){return !session.isCurrent});
          for(var j=0;j<remainingOthers.length;j++){
            try{
              await api('/api/auth/sessions/'+encodeURIComponent(remainingOthers[j].id),{method:'DELETE'});
            }catch(e){
              // Leave the current session active when another session cannot be revoked.
            }
          }
          var verifyResponse=await api('/api/auth/sessions');
          failedOthers=arr(verifyResponse,'sessions').filter(function(session){return !session.isCurrent}).length;
        }catch(e){
          failedOthers=Math.max(failedOthers,1);
        }
      }
      if(failedOthers){
        await loadSecuritySessions();
        toast('Could not revoke '+failedOthers+' active session'+(failedOthers===1?'':'s')+'. This browser session remains active so you can retry.','bad');
        return;
      }
      if(!current){
        await loadSecuritySessions();
        toast(revokedOthers+' other session'+(revokedOthers===1?'':'s')+' revoked.','good');
        return;
      }
      try{
        var currentResult=await api('/api/auth/sessions/'+encodeURIComponent(current.id),{method:'DELETE'});
        if(!currentResult.signedOutCurrentSession)throw new Error('The current session was not confirmed as signed out.');
        S.user=null;
        S.csrfToken='';
        S.connectionState='unknown';
        clearWorkspaceState();
        connected('unknown');
        closeSettings();
        landing();
        openAuth('login');
        toast('All active sessions revoked.','good');
      }catch(e){
        await loadSecuritySessions();
        throw new Error('Other sessions were revoked, but this browser session could not be signed out: '+(e.message||'unknown error'));
      }
    }catch(e){
      toast(e.message||'Could not revoke all sessions.','bad');
    }finally{
      $('confirmTitle').textContent='Confirm deletion';
      $('confirmText').textContent='';
      var warning=$('confirmWarning');
      if(warning)warning.textContent='This removes the repository data stored by Autopsy. Your source repository is not modified.';
      $('confirmConfirm').textContent='Delete repository data';
      S.sessionRevoking=false;
      if(button){
        button.disabled=false;
        button.removeAttribute('aria-busy');
        button.textContent=idle||'Revoke all sessions';
      }
    }
  }
  async function changePassword(){
    if(!S.user)return;
    var current=$('currentPassword').value;
    var next=$('newPassword').value;
    var error=$('passwordError');
    var button=$('changePassword');
    if(!current||!next){
      error.textContent='Enter both passwords.';
      error.hidden=false;
      return;
    }
    if(current===next){
      error.textContent='Choose a new password that is different from the current password.';
      error.hidden=false;
      return;
    }
    error.hidden=true;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    button.textContent='Changing…';
    try{
      await api('/api/auth/password',{method:'POST',body:JSON.stringify({currentPassword:current,newPassword:next})});
      $('currentPassword').value='';
      $('newPassword').value='';
      closeSettings();
      toast('Password changed. Other sessions were signed out.','good');
    }catch(e){
      error.textContent=e.message||'Password change failed.';
      error.hidden=false;
    }finally{
      button.disabled=false;
      button.removeAttribute('aria-busy');
      button.textContent='Change password';
      await loadSecuritySessions();
    }
  }
  async function logoutLocalState(showToast){
    try{await api('/api/auth/logout',{method:'POST'})}catch(e){}
    S.user=null;S.csrfToken='';
    S.connectionState='unknown';
    clearWorkspaceState();
    connected('unknown');
    closeSettings();
    closeAuth();
    landing();
    if(showToast)toast('Signed out.','good');
  }
  function landing(){
    $('landing').hidden=false;
    $('workspace').hidden=true;
    document.title='Project Autopsy — Engineering Evidence';
  }
  function syncRepositoryAccessSettings(){
    var zone=$('repoAccessZone'),status=$('repoAccessStatus'),tokenInput=$('repoToken'),clearButton=$('clearRepoAccess');
    if(!zone)return;
    zone.hidden=!S.repoId;
    if(!S.repoId)return;
    var configured=!!(S.repo&&S.repo.accessConfigured);
    if(status)status.textContent=configured?'A repository credential is configured on the server. The current value is never shown.':'No repository credential is stored for this workspace.';
    if(tokenInput)tokenInput.value='';
    if(clearButton)clearButton.disabled=!configured;
  }
  function syncWorkspaceMeta(){
    var repo=S.repo||{},a=S.analysis||{},status=a.status||'idle';
    var label=status==='completed'?'READY':status==='running'?'RUNNING':status==='queued'?'QUEUED':status==='failed'?'FAILED':'IDLE';
    var tone=status==='completed'?'good':status==='failed'?'bad':(status==='running'||status==='queued')?'warn':'neutral';
    var statusEl=$('repoStatus');
    if(statusEl){statusEl.textContent=label;statusEl.className='side-status '+tone;}
    var repoName=$('repoName'),repoBranch=$('repoBranch');
    if(repoName)repoName.textContent=repo.name||'Repository';
    if(repoBranch)repoBranch.textContent=repo.tracked_branch||repo.trackedBranch||repo.default_branch||repo.defaultBranch||'branch unavailable';
  }
  function workspace(){
    $('landing').hidden=true;
    $('workspace').hidden=false;
    document.body.dataset.view=S.view||'overview';
    syncWorkspaceMeta();
    connected(S.connectionState);
    syncAnalysisRefreshControl();
    syncRepositoryAccessSettings();
  }
  function openSettings(trigger){
    S.settingsFocus=trigger||document.activeElement;
    $('api').value=S.api;
    if($('accountEmail'))$('accountEmail').textContent=S.user&&S.user.email||'Not signed in';
    if($('repoToken'))$('repoToken').value='';
    $('dangerZone').hidden=!S.repoId;
    $('modal').hidden=false;
    if($('passwordError'))$('passwordError').hidden=true;
    if($('currentPassword'))$('currentPassword').value='';
    if($('newPassword'))$('newPassword').value='';
    syncRepositoryAccessSettings();
    void loadSecuritySessions();
    requestAnimationFrame(function(){($('repoToken')||$('close')).focus()});
  }
  function closeSettings(){ $('modal').hidden=true;var focus=S.settingsFocus;S.settingsFocus=null;if(focus&&typeof focus.focus==='function')requestAnimationFrame(function(){try{focus.focus()}catch(e){}})}
  async function saveRepositoryAccess(clearCredential){
    if(!S.repoId)return;
    var token=S.workspaceToken,id=S.repoId,button=clearCredential?$('clearRepoAccess'):$('saveRepoAccess');
    if(button){button.disabled=true;button.setAttribute('aria-busy','true')}
    try{
      var request={method:clearCredential?'DELETE':'PUT'};
      if(!clearCredential){
        var value=$('repoToken').value.trim();
        if(!value)throw new Error('Enter a repository access token before saving.');
        request.body=JSON.stringify({accessToken:value});
      }
      var r=await api('/api/repositories/'+id+'/access',request);
      if(token!==S.workspaceToken||id!==S.repoId)return;
      S.repo=S.repo||{};
      S.repo.accessConfigured=!!r.configured;
      $('repoToken').value='';
      syncRepositoryAccessSettings();
      toast(clearCredential?'Repository credential cleared':'Repository credential updated','good');
    }catch(e){
      if(token===S.workspaceToken&&id===S.repoId)toast(e.message||'Repository credential update failed','bad');
    }finally{
      if(button){button.disabled=false;button.removeAttribute('aria-busy')}
      syncRepositoryAccessSettings();
    }
  }
  function finishConfirm(result){
    var resolve=S.confirmResolver,focus=S.confirmFocus;
    S.confirmResolver=null;S.confirmFocus=null;$('confirmModal').hidden=true;
    if(resolve)resolve(result);
    if(focus&&typeof focus.focus==='function')requestAnimationFrame(function(){try{focus.focus()}catch(e){}});
  }
  function confirmDelete(name){
    if(S.confirmResolver)return Promise.resolve(false);
    return new Promise(function(resolve){
      S.confirmResolver=resolve;S.confirmFocus=document.activeElement;
      $('confirmTitle').textContent='Delete '+(name||'repository')+'?';
      $('confirmText').textContent='This permanently removes the imported repository and its persisted Autopsy evidence. This action cannot be undone.';
      $('confirmModal').hidden=false;
      requestAnimationFrame(function(){$('confirmCancel').focus()});
    });
  }
  async function deleteRepository(){
    if(!S.repoId||S.importing)return;
    if(S.analysis&&['queued','running'].indexOf(S.analysis.status)>=0){toast('Analysis is already running. Wait for it to finish before starting another refresh.','warn');syncAnalysisRefreshControl();return}
    var token=S.workspaceToken,id=S.repoId,name=(S.repo&&S.repo.name)||'this repository';
    if(!await confirmDelete(name))return;
    stopOperationsMonitoring();
    try{
      var r=await api('/api/repositories/'+id,{method:'DELETE'});
      if(token!==S.workspaceToken||id!==S.repoId)return;
      S.workspaceToken+=1;S.commitLoadToken+=1;S.timelineLoading=false;S.timelineLoadToken+=1;S.analysisRunsLoading=false;S.analysisRunsLoadToken+=1;S.commitLoading=false;S.refreshLoading=false;S.reportLoading=false;S.interviewLoading=false;S.interpretationLoading=false;S.provenanceLoading=false;clearInterval(S.timer);S.timer=null;S.runtimeLoading=false;S.historicalLoading=false;S.historicalLoadToken+=1;
      S.repoId='';S.runId='';S.repo=null;S.analysis=null;S.data={};S.dataRunId='';S.dataErrors=[];S.evidence=[];S.runtimeEvents=[];S.runtimePagination=null;S.historicalLoading=false;S.historicalFilter={windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''};S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''};S.viewFilter={};S.tableSort={};S.viewLoading={};
      persist();closeSettings();landing();toast(r.cleanupPending?'Repository deleted; storage cleanup is pending and will be retried automatically.':'Repository data deleted','good');
    }catch(e){
      if(token===S.workspaceToken&&id===S.repoId)toast(e.message||'Repository deletion failed','bad');
    }
  }
  $('brandLink').onclick=function(e){
    if(S.user&&S.repoId){
      e.preventDefault();
      setView('overview');
      return;
    }
    e.preventDefault();
    clearWorkspaceState();
    landing();
    if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  };
  var storedTheme=themeStorageGet();
  applyTheme(storedTheme||document.documentElement.dataset.theme||'dark',false,!!storedTheme);
  window.addEventListener('storage',function(e){
    if(e.key!=='autopsy.theme')return;
    if(e.newValue==='light'||e.newValue==='dark')applyTheme(e.newValue,false,false);
  });
  $('themeToggle').onclick=function(){applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light',true,true)};
  $('settings').onclick=function(){S.user?openSettings(this):openAuth('login')};$('close').onclick=closeSettings;$('drawerCopy').onclick=copyEvidence;$('saveRepoAccess').onclick=function(){saveRepositoryAccess(false)};$('clearRepoAccess').onclick=function(){saveRepositoryAccess(true)};$('confirmCancel').onclick=function(){finishConfirm(false)};$('confirmConfirm').onclick=function(){finishConfirm(true)};$('deleteRepository').onclick=deleteRepository;$('testConnection').onclick=testConnection;$('drawerClose').onclick=closeEvidence;$('drawer').onclick=function(e){if(e.target===$('drawer'))closeEvidence()};$('modal').onclick=function(e){if(e.target===$('modal'))closeSettings()};$('confirmModal').onclick=function(e){if(e.target===$('confirmModal'))finishConfirm(false)};$('save').onclick=function(){
    try{S.api=safeApiBase($('api').value)}catch(e){toast(e.message,'bad');return}
    persist();
    closeSettings();
    connected(S.user?'verified':'unknown');
    toast('Account settings saved.','good');
  }
  $('form').onsubmit=function(e){e.preventDefault();importRepo()};$('refresh').onclick=refresh;
  $('authForm').onsubmit=function(e){e.preventDefault();submitAuth()};
  $('forgotForm').onsubmit=function(e){e.preventDefault();submitForgotPassword()};
  $('resetForm').onsubmit=function(e){e.preventDefault();resetPasswordFromLink()};
  $('verifySubmit').onclick=verifyEmail;
  $('authForgotLink').onclick=function(){$('forgotEmail').value=$('authEmail').value.trim();setAuthMode('forgot');$('forgotEmail').focus()};
  $('resendVerification').onclick=resendVerification;
  $('passwordForm').onsubmit=function(e){e.preventDefault();changePassword()};
  $('sessionsList').onclick=function(e){
    var button=e.target.closest('.revoke-session');
    if(!button)return;
    void revokeOneSession(button.getAttribute('data-session-id'),button.getAttribute('data-current')==='1');
  };
  $('refreshSessions').onclick=function(){void loadSecuritySessions()};
  $('authModeToggle').onclick=function(){
    if(['forgot','reset','verify','migrate'].indexOf(S.authMode)>=0){
      setAuthMode('login');
      return;
    }
    setAuthMode(S.authMode==='login'?'register':'login');
  };
  $('authClose').onclick=function(){closeAuth()};
  $('authModal').onclick=function(e){if(e.target===$('authModal'))closeAuth()};
  $('logout').onclick=function(){logoutLocalState(true)};
  $('revokeSessions').onclick=function(){revokeAllSessions()};
  $('recentRepositories').onclick=function(e){var b=e.target.closest('[data-repository-id]');if(b)openSavedRepository(b.getAttribute('data-repository-id'))};

  document.querySelector('.skip-link').addEventListener('click',function(e){
    var href=this.getAttribute('href')||'';
    var target=href.charAt(0)==='#'?$(href.slice(1)):null;
    var targetHidden=target&&target.closest('[hidden]');
    if(target&&(target.hidden||targetHidden)){
      var fallback=$('url');
      if(fallback&&!fallback.closest('[hidden]')){
        e.preventDefault();
        fallback.focus();
        fallback.scrollIntoView({block:'center'});
      }
      return;
    }
    if(target&&typeof target.focus==='function'&&!target.closest('[hidden]')){
      e.preventDefault();
      target.focus();
      target.scrollIntoView({block:'center'});
    }
  });
  document.addEventListener('keydown',function(e){
    if(!$('commandPalette').hidden){
      trapFocus($('commandPalette'),e);
      if(e.key==='Escape'){e.preventDefault();closeCommandPalette();return}
      if(e.key==='ArrowDown'){e.preventDefault();moveCommandSelection(1);return}
      if(e.key==='ArrowUp'){e.preventDefault();moveCommandSelection(-1);return}
      if(e.key==='Enter'&&document.activeElement===$('commandSearch')){e.preventDefault();var commands=commandPaletteMatches();if(commands[S.commandPaletteIndex])commandPaletteRun(commands[S.commandPaletteIndex].id);return}
      return;
    }
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&!e.altKey){
      e.preventDefault();openCommandPalette(document.activeElement);return;
    }
    if(!$('confirmModal').hidden)trapFocus($('confirmModal'),e);else if(!$('authModal').hidden)trapFocus($('authModal'),e);else if(!$('modal').hidden)trapFocus($('modal'),e);else if(!$('drawer').hidden)trapFocus($('drawer'),e);
    var target=e.target;
    var searchInput=$('viewSearch')||($('evidenceSearch')&&S.view==='evidence'?$('evidenceSearch'):null);
    if(e.key==='/'&&searchInput&&target&&['INPUT','TEXTAREA','SELECT'].indexOf(target.tagName)<0&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
      e.preventDefault();searchInput.focus();return;
    }
    if(e.key==='Escape'){
      if(!$('confirmModal').hidden){e.preventDefault();finishConfirm(false);return}
      if(searchInput&&document.activeElement===searchInput&&searchInput.value){
        e.preventDefault();searchInput.value='';
        if(searchInput.id==='viewSearch'){S.viewFilter[S.view]='';applyViewFilter();}
        else {var evt=document.createEvent('Event');evt.initEvent('input',true,true);searchInput.dispatchEvent(evt);}
        return;
      }
      if(!$('drawer').hidden)closeEvidence();else if(!$('modal').hidden)closeSettings();else if(!$('authModal').hidden)closeAuth()
    }
  });
  $('commandPalette').onclick=function(e){if(e.target===$('commandPalette'))closeCommandPalette()};
  $('commandSearch').oninput=function(){S.commandPaletteQuery=this.value;S.commandPaletteIndex=0;renderCommandPalette()};
  $('commandList').onclick=function(e){var b=e.target.closest('[data-command-id]');if(b)commandPaletteRun(b.getAttribute('data-command-id'))};
  $('new').onclick=function(){stopOperationsMonitoring();S.workspaceToken+=1;S.commitLoadToken+=1;S.timelineLoading=false;S.timelineLoadToken+=1;S.analysisRunsLoading=false;S.analysisRunsLoadToken+=1;S.commitLoading=false;S.importing=false;S.refreshLoading=false;S.reportLoading=false;S.interviewLoading=false;S.interpretationLoading=false;S.provenanceLoading=false;clearInterval(S.timer);S.timer=null;S.runtimeLoading=false;S.historicalLoading=false;S.historicalLoadToken+=1;S.repoId='';S.runId='';S.repo=null;S.analysis=null;S.data={};S.dataRunId='';S.dataErrors=[];S.runtimeEvents=[];S.runtimePagination=null;S.historicalFilter={windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''};S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''};S.viewFilter={};S.tableSort={};S.viewLoading={};persist();landing()}
  $('nav').onclick=function(e){var b=e.target.closest('button[data-view]');if(b)setView(b.getAttribute('data-view'))};window.addEventListener('hashchange',function(){setView(viewFromHash(),{fromHash:true})});window.addEventListener('pageshow',function(){closeTransientOverlays()});document.addEventListener('visibilitychange',function(){syncOperationsMonitoring(!document.hidden)})
  $('root').onclick=function(e){
    var family=e.target.closest('[data-evidence-family]');
    if(family){e.preventDefault();S.evidenceFamily=family.getAttribute('data-evidence-family')||'all';var q=$('evidenceSearch');if(q){var evt=document.createEvent('Event');evt.initEvent('input',true,true);q.dispatchEvent(evt)}return}
    var ev=e.target.closest('[data-evidence-id]');if(ev){e.preventDefault();openEvidence(ev.getAttribute('data-evidence-id'),ev);return}var pd=e.target.closest('[data-deployment-id]');if(pd){e.preventDefault();loadProvenance(pd.getAttribute('data-deployment-id'),pd);return}var a=e.target.closest('[data-action]');if(!a)return;if(a.getAttribute('data-action')==='report')loadReport();if(a.getAttribute('data-action')==='report-jump'){var target=$(a.getAttribute('data-report-section'));if(target)target.scrollIntoView({behavior:'smooth',block:'start'});}if(a.getAttribute('data-action')==='interview')loadInterview();if(a.getAttribute('data-action')==='copy-story')copyInterviewStory(a.getAttribute('data-story-id'));if(a.getAttribute('data-action')==='interpretation')loadInterpretation();if(a.getAttribute('data-action')==='download')downloadReport();if(a.getAttribute('data-action')==='more-commits')loadMoreCommits();if(a.getAttribute('data-action')==='more-timeline')loadMoreTimeline();if(a.getAttribute('data-action')==='analysis-runs-more')loadMoreAnalysisRuns();if(a.getAttribute('data-action')==='reload-data')reloadData();if(a.getAttribute('data-action')==='reload-view')reloadCurrentView();if(a.getAttribute('data-action')==='runtime-filter')loadRuntimeEvents(true);if(a.getAttribute('data-action')==='runtime-clear-filter'){S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''};['rtFrom','rtTo','rtDeployment','rtRevision','rtEnvironment','rtOperation'].forEach(function(id){if($(id))$(id).value=''});if($('rtSignal'))$('rtSignal').value='';loadRuntimeEvents(true)}if(a.getAttribute('data-action')==='runtime-more')loadRuntimeEvents(false);if(a.getAttribute('data-action')==='historical-filter')loadHistoricalRuntime();if(a.getAttribute('data-action')==='operations-refresh')loadOperations(true);if(a.getAttribute('data-action')==='operations-retry')loadOperations(true);if(a.getAttribute('data-action')==='historical-clear-filter'){S.historicalFilter={windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''};['histWindow','histSamples','histDeployment','histEnvironment','histOperation'].forEach(function(id){if($(id))$(id).value=id==='histWindow'?60:id==='histSamples'?10:''});if($('histSignal'))$('histSignal').value='';loadHistoricalRuntime()}}
  function setAuthMode(mode){
    S.authMode=['login','register','migrate','forgot','reset','verify'].indexOf(mode)>=0?mode:'login';
    var standard=['login','register','migrate'].indexOf(S.authMode)>=0;
    var migrating=S.authMode==='migrate';
    var forgot=S.authMode==='forgot';
    var reset=S.authMode==='reset';
    var verify=S.authMode==='verify';
    $('authForm').hidden=!standard;
    $('forgotForm').hidden=!forgot;
    $('resetForm').hidden=!reset;
    $('verifyPanel').hidden=!verify;
    $('authTitle').textContent=migrating?'Move your existing workspace':forgot?'Reset your password':reset?'Choose a new password':verify?'Verify your email':S.authMode==='register'?'Create your Project Autopsy account':'Sign in to Project Autopsy';
    $('authSubtitle').textContent=migrating?'Your previous workspace uses a legacy access credential. Convert it to account-based access once; the credential is then removed from this browser.':S.authMode==='register'?'Use your email and a password with at least 12 characters.':forgot?'We will send a one-time password reset link to your account email.':reset?'Choose a new password for your account.':verify?'Use the one-time link from your email to confirm this address.':'Use the account that owns your Autopsy repositories.';
    $('authSubmit').textContent=migrating?'Migrate & sign in':S.authMode==='register'?'Create account':'Sign in';
    $('authModeToggle').textContent=migrating?'Use normal sign in instead':S.authMode==='register'?'Already have an account? Sign in':(forgot||reset||verify)?'Back to sign in':'New here? Create an account';
    $('authModeToggle').hidden=!(standard||forgot);
    $('authForgotLink').hidden=S.authMode!=='login';
    $('resendVerification').hidden=S.authMode!=='login';
    $('authPassword').setAttribute('autocomplete',S.authMode==='register'?'new-password':'current-password');
    if($('authPasswordHint'))$('authPasswordHint').hidden=S.authMode!=='register';
    if($('resetPassword'))$('resetPassword').setAttribute('autocomplete','new-password');
    if($('resetPasswordConfirm'))$('resetPasswordConfirm').setAttribute('autocomplete','new-password');
  }
  function openAuth(mode,interrupt){
    if(S.authInterrupt&& !$('authModal').hidden)return;
    S.authInterrupt=!!interrupt;
    S.authMode=mode||'login';
    setAuthMode(S.authMode);
    $('authError').hidden=true;
    $('authNotice').hidden=true;
    $('forgotError').hidden=true;
    $('forgotNotice').hidden=true;
    $('resetError').hidden=true;
    $('authEmail').value=S.user&&S.user.email||$('authEmail').value||'';
    $('forgotEmail').value=$('authEmail').value||'';
    $('authPassword').value='';
    if(mode!=='reset'&&mode!=='verify')S.authToken='';
    if(mode==='migrate')$('authModeToggle').hidden=!S.legacyMigrationKey;
    $('authModal').hidden=false;
    requestAnimationFrame(function(){
      if(mode==='forgot')$('forgotEmail').focus();
      else if(mode==='reset')$('resetPassword').focus();
      else if(mode==='verify')$('verifySubmit').focus();
      else $('authEmail').focus();
    });
  }
  function closeAuth(){
    $('authModal').hidden=true;
    S.authSubmitting=false;
    S.authInterrupt=false;
  }
  async function submitAuth(){
    if(S.authSubmitting)return;
    var email=$('authEmail').value.trim();
    var password=$('authPassword').value;
    if(!email||!password){
      $('authError').textContent='Enter your email and password.';
      $('authError').hidden=false;
      return;
    }
    S.authSubmitting=true;
    var mode=S.authMode;
    var authButton=$('authSubmit');
    if(authButton){
      authButton.disabled=true;
      authButton.setAttribute('aria-busy','true');
      authButton.textContent=mode==='migrate'?'Migrating…':mode==='register'?'Creating…':'Signing in…';
    }
    $('authError').hidden=true;
    $('authNotice').hidden=true;
    try{
      var path=mode==='migrate'?'/api/auth/migrate-legacy':mode==='register'?'/api/auth/register':'/api/auth/login';
      var options={method:'POST',body:JSON.stringify({email:email,password:password})};
      if(mode==='migrate'&&S.legacyMigrationKey)options.headers={'x-autopsy-api-key':S.legacyMigrationKey};
      var result=await api(path,options);
      if(mode==='migrate')S.legacyMigrationKey='';
      if(mode==='register'&&result.requiresEmailVerification){
        S.user=null;
        S.connectionState='unknown';
        connected('unknown');
        $('authPassword').value='';
        $('authNotice').textContent=result.message||'Account created. Check your email to verify the account.';
        $('authNotice').hidden=false;
        $('authModeToggle').hidden=true;
        $('authForgotLink').hidden=true;
        $('resendVerification').hidden=false;
        toast('Verification email sent.','good');
        return;
      }
      S.user=result.user;
      S.authInterrupt=false;
      S.connectionState='verified';
      connected('verified');
      closeAuth();
      persist();
      await loadRecentRepositories();
      toast(mode==='register'?'Account created and signed in.':'Signed in successfully.','good');
      var restored=await restoreSavedWorkspace();
      if(!restored)landing();
    }catch(e){
      $('authError').textContent=e.message||'Authentication failed.';
      $('authError').hidden=false;
    }finally{
      S.authSubmitting=false;
      if(authButton){
        authButton.disabled=false;
        authButton.removeAttribute('aria-busy');
      }
      setAuthMode(S.authMode);
    }
  }
  async function submitForgotPassword(){
    var email=$('forgotEmail').value.trim();
    var error=$('forgotError'),notice=$('forgotNotice'),button=$('forgotSubmit');
    if(!email){
      error.textContent='Enter the email address for your account.';
      error.hidden=false;
      notice.hidden=true;
      return;
    }
    error.hidden=true;
    notice.hidden=true;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    button.textContent='Sending…';
    try{
      var result=await api('/api/auth/forgot-password',{method:'POST',body:JSON.stringify({email:email})});
      notice.textContent=result.message||'If an account exists for that email, a password reset link has been sent.';
      notice.hidden=false;
      $('authEmail').value=email;
      toast('Reset instructions requested.','good');
    }catch(e){
      error.textContent=e.message||'Password reset request failed.';
      error.hidden=false;
    }finally{
      button.disabled=false;
      button.removeAttribute('aria-busy');
      button.textContent='Send reset link';
    }
  }
  async function resendVerification(){
    var email=($('authEmail').value||$('forgotEmail').value||'').trim();
    var error=$('authError'),notice=$('authNotice'),button=$('resendVerification');
    if(!email){
      error.textContent='Enter your account email first.';
      error.hidden=false;
      return;
    }
    error.hidden=true;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    try{
      var result=await api('/api/auth/resend-verification',{method:'POST',body:JSON.stringify({email:email})});
      notice.textContent=result.message||'If the account needs verification, a new verification email has been sent.';
      notice.hidden=false;
      toast('Verification instructions requested.','good');
    }catch(e){
      error.textContent=e.message||'Verification email request failed.';
      error.hidden=false;
    }finally{
      button.disabled=false;
      button.removeAttribute('aria-busy');
    }
  }
  async function verifyEmail(){
    var status=$('verifyStatus'),button=$('verifySubmit');
    if(!S.authToken){
      status.textContent='This verification link is missing or incomplete.';
      button.disabled=true;
      return;
    }
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    button.textContent='Verifying…';
    try{
      var result=await api('/api/auth/verify-email',{method:'POST',body:JSON.stringify({token:S.authToken})});
      S.authToken='';
      setAuthMode('login');
      $('authNotice').textContent=result.message||'Email verified. You can now sign in.';
      $('authNotice').hidden=false;
      $('authPassword').focus();
      toast('Email verified.','good');
    }catch(e){
      status.textContent=e.message||'Email verification failed.';
    }finally{
      button.disabled=false;
      button.removeAttribute('aria-busy');
      button.textContent='Verify email';
    }
  }
  async function resetPasswordFromLink(){
    var next=$('resetPassword').value;
    var confirm=$('resetPasswordConfirm').value;
    var error=$('resetError'),button=$('resetSubmit');
    if(!S.authToken){
      error.textContent='This reset link is missing or incomplete.';
      error.hidden=false;
      return;
    }
    if(!next||!confirm){
      error.textContent='Enter and confirm your new password.';
      error.hidden=false;
      return;
    }
    if(next!==confirm){
      error.textContent='The password confirmation does not match.';
      error.hidden=false;
      return;
    }
    error.hidden=true;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    button.textContent='Resetting…';
    try{
      var result=await api('/api/auth/reset-password',{method:'POST',body:JSON.stringify({token:S.authToken,newPassword:next})});
      S.authToken='';
      S.user=null;
      S.csrfToken='';
      S.connectionState='unknown';
      clearWorkspaceState();
      connected('unknown');
      openAuth('login');
      $('authNotice').textContent=result.message||'Password reset. You can now sign in.';
      $('authNotice').hidden=false;
      toast('Password reset successfully.','good');
    }catch(e){
      error.textContent=e.message||'Password reset failed.';
      error.hidden=false;
    }finally{
      button.disabled=false;
      button.removeAttribute('aria-busy');
      button.textContent='Reset password';
    }
  }
  function consumeAuthLink(){
    try{
      var hash=location.hash||'';
      var verifyPrefix='#auth-verify=';
      var resetPrefix='#auth-reset=';
      var verify=hash.startsWith(verifyPrefix)?decodeURIComponent(hash.slice(verifyPrefix.length)):'';
      var reset=hash.startsWith(resetPrefix)?decodeURIComponent(hash.slice(resetPrefix.length)):'';
      if(!verify&&!reset)return'';
      history.replaceState(null,'',location.pathname+location.search);
      if(verify){S.authToken=verify;return'verify'}
      S.authToken=reset;
      return'reset';
    }catch(e){
      return'';
    }
  }
  function clearWorkspaceState(){
    stopOperationsMonitoring();
    S.workspaceToken+=1;
    S.commitLoadToken+=1;
    S.timelineLoading=false;
    S.timelineLoadToken+=1;
    S.analysisRunsLoading=false;
    S.analysisRunsLoadToken+=1;
    S.commitLoading=false;
    S.refreshLoading=false;
    S.reportLoading=false;
    S.interviewLoading=false;
    S.interpretationLoading=false;
    S.provenanceLoading=false;
    clearInterval(S.timer);
    S.timer=null;
    S.runtimeLoading=false;
    S.historicalLoading=false;
    S.historicalLoadToken+=1;
    S.repoId='';
    S.runId='';
    S.repo=null;
    S.analysis=null;
    S.data={};
    S.dataRunId='';
    S.dataErrors=[];
    S.evidence=[];
    S.runtimeEvents=[];
    S.runtimePagination=null;
    S.historicalFilter={windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''};
    S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''};
    S.viewFilter={};
    S.tableSort={};
    S.viewLoading={};
    persist();
  }
  async function loadRecentRepositories(){
    if(!S.user)return;
    try{
      var r=await api('/api/repositories?limit=20');
      var repos=arr(r,'repositories');
      var zone=$('recentRepositories');
      if(!zone)return;
      if(!repos.length){
        zone.hidden=true;
        zone.innerHTML='';
        return;
      }
      zone.hidden=false;
      zone.innerHTML='<div class="recent-head"><div><div class="kicker">YOUR REPOSITORIES</div><h3>Recent workspaces</h3></div><span class="tag">'+n(repos.length)+' saved</span></div>'+
        '<div class="recent-list">'+repos.map(function(x){
          return '<button type="button" class="recent-repo" data-repository-id="'+esc(x.id)+'"><strong>'+esc(x.name)+'</strong><span>'+esc(x.trackedBranch||'branch unavailable')+'</span><small>'+esc(x.sourceUrl||'')+'</small></button>';
        }).join('')+'</div>';
    }catch(e){
      var zone=$('recentRepositories');
      if(zone){zone.hidden=true;zone.innerHTML='';}
    }
  }
  async function openSavedRepository(repositoryId){
    if(!S.user||!repositoryId)return;
    var token=S.workspaceToken;
    try{
      clearWorkspaceState();
      token=S.workspaceToken;
      var repo=await getRepo(repositoryId);
      var runs=await api('/api/repositories/'+repositoryId+'/analysis-runs?page=1&limit=1');
      var latest=arr(runs,'runs')[0];
      if(!latest)throw new Error('This repository does not have an analysis run yet.');
      S.repoId=repositoryId;
      S.runId=latest.id;
      S.repo=repo;
      persist();
      workspace();
      if(latest.status==='completed'){
        S.analysis=await getRun(repositoryId,latest.id);
        var initialView=viewFromHash();
        await loadViewData(initialView);
        if(token===S.workspaceToken&&S.repoId===repositoryId)setView(initialView,{skipLoad:true});
      }else{
        S.analysis=await getRun(repositoryId,latest.id);
        setView('overview');
        poll();
      }
    }catch(e){
      if(token===S.workspaceToken){
        clearWorkspaceState();
        landing();
        toast(e.message||'Repository could not be opened.','bad');
      }
    }
  }
  async function restoreSavedWorkspace(){
    if(!S.user||!S.repoId||!S.runId)return false;
    var token=S.workspaceToken,id=S.repoId,runId=S.runId;
    try{
      S.repo=await getRepo(id);
      if(token!==S.workspaceToken||id!==S.repoId)return false;
      workspace();
      var analysis=await getRun(id,runId);
      if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId)return false;
      S.analysis=analysis;
      if(S.analysis.status==='completed'){
        var initialView=viewFromHash();
        await loadViewData(initialView);
        if(token===S.workspaceToken&&id===S.repoId)setView(initialView,{skipLoad:true});
      }else{
        setView('overview');
        poll();
      }
      return true;
    }catch(e){
      if(String(e&&e.message||'').indexOf('Request failed (404).')===0){
        clearWorkspaceState();
      }
      return false;
    }
  }
  async function boot(){
    var authLink=consumeAuthLink();
    if(authLink){
      landing();
      openAuth(authLink);
      return;
    }
    S.legacyMigrationKey=storageGet('autopsy.key');
    storageRemove('autopsy.key');
    storageRemove('autopsy.aiKey');
    try{
      var me=await api('/api/auth/me');
      S.user=me.user;
      S.connectionState='verified';
      connected('verified');
      await loadRecentRepositories();
      if(await restoreSavedWorkspace())return;
      landing();
      return;
    }catch(e){
      S.user=null;
      S.csrfToken='';
      S.connectionState='unknown';
      connected('unknown');
      landing();
      if(S.legacyMigrationKey)openAuth('migrate');
    }
  }
  boot()
})();
