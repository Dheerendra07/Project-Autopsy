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
    legacyMigrationKey:'',
    repoId:storageGet('autopsy.repoId'),
    runId:storageGet('autopsy.runId'),
    authMode:'login',authSubmitting:false,authToken:'',repo:null,analysis:null,data:{},dataErrors:[],view:'overview',timer:null,evidence:[],evidenceSeq:0,importing:false,workspaceToken:0,commitLoading:false,commitLoadToken:0,runtimeLoading:false,runtimeFilter:{from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''},runtimeEvents:[],runtimePagination:null,analysisRunsLoading:false,analysisRunsLoadToken:0,timelineLoading:false,timelineLoadToken:0,historicalLoading:false,confirmResolver:null,confirmFocus:null,historicalLoadToken:0,historicalFilter:{windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''},connectionState:'unknown',authInterrupt:false,dataRunId:'',viewScroll:{},viewFilter:{},tableSort:{},viewLoading:{},settingsFocus:null,focusReturn:null,currentEvidence:null,reportLoading:false,interviewLoading:false,interpretationLoading:false,refreshLoading:false,connectionTesting:false,provenanceLoading:false,operationalLoading:false,operationalLoadToken:0,operationalTimer:null,operationalPollMs:30_000
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
      button.textContent=verified?'Account':rejected?'Sign in':'Sign in';
      button.setAttribute('data-auth-state',verified?'signed-in':rejected?'rejected':'signed-out');
      button.title=verified?'Account & security settings':'Sign in to your private workspace';
    }
  }
  function syncAnalysisRefreshControl(){var b=$('refresh'),running=!!(S.analysis&&['queued','running'].indexOf(S.analysis.status)>=0);if(!b)return;b.disabled=running||S.refreshLoading;b.setAttribute('aria-busy',running||S.refreshLoading?'true':'false');b.textContent=S.refreshLoading?'Refreshing…':running?'Analysis running…':'Refresh analysis'}
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
  function closeEvidence(){$('drawer').hidden=true;var focus=S.focusReturn;S.focusReturn=null;S.currentEvidence=null;if(focus&&typeof focus.focus==='function')requestAnimationFrame(function(){try{focus.focus()}catch(e){}})}
  function closeTransientOverlays(){
    if($('drawer'))$('drawer').hidden=true;
    if($('modal'))$('modal').hidden=true;
    if($('confirmModal'))$('confirmModal').hidden=true;
    S.currentEvidence=null;S.focusReturn=null;S.confirmResolver=null;S.confirmFocus=null;
  }
  async function copyEvidence(){var x=S.currentEvidence;if(!x){toast('No evidence record is open','bad');return}try{await navigator.clipboard.writeText(JSON.stringify(x.payload,null,2));toast('Evidence JSON copied','good')}catch(e){toast('Clipboard access is unavailable in this browser','bad')}}
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
      var csrf=readCookie('autopsy_csrf');
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
  function shell(title,desc,actions){var toolbar=viewFilterMarkup(),snap=snapshotState(),loading=!!S.viewLoading[S.view],reload=RELOADABLE_VIEWS.indexOf(S.view)>=0?'<button class="btn" data-action="reload-view"'+(loading?' disabled aria-busy="true"':'')+'>'+(loading?'Refreshing…':'Refresh data')+'</button>':'',source=safeExternalUrl(S.repo&&(S.repo.source_url||S.repo.sourceUrl)),sourceAction=source?'<a class="btn link" href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Open repository ↗</a>':'';return '<div class="head"><div><div class="kicker">WORKSPACE</div><div class="head-title"><h2>'+esc(title)+'</h2><span class="snapshot-pill '+esc(snap.tone)+'">'+esc(snap.label)+'</span></div><p>'+esc(desc)+'</p></div><div class="actions">'+(actions||'')+reload+sourceAction+'</div></div>'+toolbar}
  const VIEW_DATA={overview:['commits','analysisRuns','hotspots','contributors'],history:['commits','timeline'],structure:['architecture','dependencies','complexity','coupling'],quality:['bugs','repeated','refactors','migrations','tests','testSummary'],runtime:['runtime','runtimeEvents','deployments','historicalSummary','historicalCorrelation','historicalSourceContext'],evidence:['commits','timeline','hotspots','architecture','dependencies','complexity','coupling','bugs','repeated','refactors','migrations','tests','testSummary','runtime','runtimeEvents','deployments','historicalSummary','historicalCorrelation','historicalSourceContext'],contributors:['contributors']};
  const RELOADABLE_VIEWS=['overview','history','structure','quality','evidence','contributors'];
  const VIEW_LABELS={overview:['Engineering overview','Loading the workspace evidence needed for the overview…'],history:['History','Loading chronological repository evidence…'],structure:['Structure','Loading architecture and codebase-structure evidence…'],quality:['Quality evidence','Loading historical quality signals…'],runtime:['Runtime & provenance','Loading runtime and deployment evidence…'],evidence:['Evidence explorer','Loading the evidence index…'],contributors:['Contributors','Loading contributor history…'],operations:['Operations','Checking live service health and queue telemetry…']};
  function viewEndpoints(id){return {commits:'/api/repositories/'+id+'/commits?page=1&limit=50',analysisRuns:'/api/repositories/'+id+'/analysis-runs?page=1&limit=20',timeline:'/api/repositories/'+id+'/timeline?page=1&limit=50',hotspots:'/api/repositories/'+id+'/hotspots?limit=20',repeated:'/api/repositories/'+id+'/repeatedly-modified-files?minTouches=3&limit=20',bugs:'/api/repositories/'+id+'/repeated-bug-areas?limit=20',coupling:'/api/repositories/'+id+'/coupling?minCoChanges=2&limit=50',refactors:'/api/repositories/'+id+'/refactors?limit=20',dependencies:'/api/repositories/'+id+'/dependencies?limit=100',architecture:'/api/repositories/'+id+'/architecture?limit=100',migrations:'/api/repositories/'+id+'/database-migrations?limit=100',tests:'/api/repositories/'+id+'/test-evolution?limit=100',testSummary:'/api/repositories/'+id+'/test-evolution/summary',complexity:'/api/repositories/'+id+'/complexity?limit=100',contributors:'/api/repositories/'+id+'/contributors?limit=25',runtime:'/api/repositories/'+id+'/runtime/telemetry/summary',runtimeEvents:'/api/repositories/'+id+'/runtime/telemetry?page=1&limit=40',deployments:'/api/repositories/'+id+'/deployments?limit=50',historicalSummary:'/api/repositories/'+id+'/runtime/historical-correlation/summary?limit=25',historicalCorrelation:'/api/repositories/'+id+'/runtime/historical-correlation?limit=25',historicalSourceContext:'/api/repositories/'+id+'/runtime/historical-correlation/source-context?limit=25'};}
  function hasViewData(view){var keys=VIEW_DATA[view]||[];return !!keys.length&&S.dataRunId===S.runId&&!keys.some(function(k){return S.data[k]===undefined||S.data[k]===null})}
  async function loadViewData(view,options){options=options||{};var keys=VIEW_DATA[view]||[];if(!keys.length||(!options.force&&hasViewData(view))||!S.repoId||S.viewLoading[view])return;var token=S.workspaceToken,id=S.repoId,runId=S.runId;S.viewLoadToken=(S.viewLoadToken||0)+1;var loadToken=S.viewLoadToken;S.viewLoading[view]=loadToken;actionBusy('reload-view',true,'Refreshing…');try{var label=VIEW_LABELS[view]||[view,'Loading evidence…'];$('root').innerHTML=loadingPage(label[0],label[1]);var eps=viewEndpoints(id),out={},errs=[];await mapLimited(keys,6,async function(k){try{out[k]=await api(eps[k])}catch(e){out[k]=S.data[k]??null;errs.push({key:k,path:eps[k],message:e.message})}});if(token!==S.workspaceToken||id!==S.repoId||runId!==S.runId||loadToken!==S.viewLoadToken||S.view!==view)return;Object.keys(out).forEach(function(k){S.data[k]=out[k]});S.dataRunId=runId;S.dataErrors=S.dataErrors.filter(function(e){return keys.indexOf(e.key)<0}).concat(errs);if(view==='runtime'){S.runtimeEvents=arr(S.data.runtimeEvents,'events');S.runtimePagination=S.data.runtimeEvents&&S.data.runtimeEvents.pagination||null}if(S.viewLoading[view]===loadToken)delete S.viewLoading[view];setView(view,{skipLoad:true});if(errs.length)toast(errs.length+' evidence source'+(errs.length===1?'':'s')+' unavailable; showing the remaining persisted data.','warn')}finally{if(S.viewLoading[view]===loadToken)delete S.viewLoading[view];if(S.view===view)actionBusy('reload-view',false)}}

  function metric(label,val,sub){return '<div class="card"><div class="metric">'+esc(val)+'</div><div class="metric-label">'+esc(label)+'</div>'+(sub?'<div class="sub">'+esc(sub)+'</div>':'')+'</div>'}
  function loadingPage(title,message){
    return shell(title,message,'')+'<div class="card loading-state"><div class="loading-orb"><span></span></div><div><strong>Working through the current evidence</strong><p>Nothing new is being inferred while this loads. Your existing snapshot stays intact.</p></div></div>';
  }
  function errorPage(title,message,actionLabel,action){
    return shell(title,'The workspace could not complete this action. The existing evidence snapshot is unchanged.','')+'<div class="card error-state"><div class="error-mark">!</div><div><strong>'+esc(message)+'</strong><p>Retry the operation without starting a new repository analysis.</p><button class="btn primary" data-action="'+esc(action)+'">'+esc(actionLabel||'Try again')+'</button></div></div>';
  }
  function overview(){
    var r=S.repo||{},a=S.analysis||{},d=S.data,c=arr(d.commits,'commits'),h=arr(d.hotspots,'hotspots');
    var max=1;
    h.slice(0,8).forEach(function(x){max=Math.max(max,Number(x.commits_touched||0))});
    var repoName=r.name||'Repository',branchName=r.tracked_branch||r.trackedBranch||r.default_branch||r.defaultBranch||'branch unavailable';
    var head=r.head_sha||r.headSha||'',target=a.targetHeadSha||'';
    var snapshot=snapshotState(),current=currentAnalysisSnapshot();
    var mode=a.mode||'full',status=a.status||'unknown';
    var journey=[
      ['01','Imported','Repository metadata persisted'],
      ['02','Analyzed',status==='completed'?'Evidence snapshot completed':'Analysis '+status],
      ['03','Mapped',n(c.length)+' commits in this page'],
      ['04','Inspectable',current?'Current snapshot ready':'Refresh to inspect latest head']
    ];
    return shell('Engineering overview','A compact, evidence-backed command center for the current repository snapshot.','<button class="btn" data-action="report">Generate report</button>')+
      '<div class="overview-context card">'+
        '<div class="overview-context-main">'+
          '<div class="kicker">CURRENT SNAPSHOT</div>'+
          '<div class="overview-context-title"><h3>'+esc(repoName)+'</h3><span class="snapshot-pill '+esc(snapshot.tone)+'">'+esc(snapshot.label)+'</span></div>'+
          '<div class="overview-context-source"><span class="mono">'+esc(branchName)+'</span><span>·</span><span class="mono">'+esc(head?sha(head):'head unavailable')+'</span><span>·</span><span>'+esc(mode)+' analysis</span></div>'+
        '</div>'+
        '<div class="overview-journey">'+journey.map(function(x,i){return '<div class="journey-step '+(i===0||i===1&&status==='completed'||i===2&&c.length||i===3&&current?'done':'')+'"><span>'+x[0]+'</span><div><b>'+x[1]+'</b><small>'+x[2]+'</small></div></div>'}).join('')+'</div>'+
      '</div>'+
      '<div class="grid g4 overview-metrics">'+
        metric('Persisted commits',n(d.commits&&d.commits.pagination&&d.commits.pagination.total||c.length),'stored Git history')+
        metric('Change hotspots',n(h.length),'historical activity signals')+
        metric('Contributors',n(d.contributors&&d.contributors.totalContributors||0),'exact Git author tuples')+
        metric('Analyzer version',a.analyzerVersion||'—','deterministic analyzer')+
      '</div>'+
      (S.dataErrors.length
        ? '<div class="callout section"><strong>Partial evidence load</strong><br>'+n(S.dataErrors.length)+' endpoint'+(S.dataErrors.length===1?'':'s')+' could not be loaded. Existing persisted data remains visible; retry the evidence load without starting a new analysis.</div><div style="margin-top:10px"><button class="btn" data-action="reload-data">Retry evidence load</button></div>'
        : '')+
      '<div class="overview-insight-grid section">'+
        '<div class="card overview-evidence-card">'+
          '<div class="overview-card-head"><div><div class="kicker">EVIDENCE POSTURE</div><h3>What this snapshot can support</h3><div class="sub">The workspace keeps observations, derived signals and interpretation separate.</div></div><span class="tag">'+(current?'CURRENT':'REVIEW')+'</span></div>'+
          '<div class="posture-list">'+
            '<div class="posture-row"><span class="posture-icon">01</span><div><b>Observed</b><small>Commit, source-structure and repository metadata persisted from the analyzed target.</small></div><span class="posture-state good">SUPPORTED</span></div>'+
            '<div class="posture-row"><span class="posture-icon">02</span><div><b>Derived</b><small>Hotspots, coupling and heuristic classifications remain labelled as signals.</small></div><span class="posture-state">DERIVED</span></div>'+
            '<div class="posture-row"><span class="posture-icon">03</span><div><b>Interpretation</b><small>Reports and insights must point back to evidence instead of replacing it.</small></div><span class="posture-state">SCOPED</span></div>'+
          '</div>'+
        '</div>'+
        '<div class="card overview-target-card">'+
          '<div class="overview-card-head"><div><div class="kicker">ANALYSIS TARGET</div><h3>Exact run boundary</h3><div class="sub">Useful context when a repository moves while evidence is being reviewed.</div></div></div>'+
          '<div class="target-stack">'+
            '<div><span>RUN</span><b class="mono">'+esc(sha(a.id))+'</b></div>'+
            '<div><span>TARGET</span><b class="mono">'+esc(sha(target))+'</b></div>'+
            '<div><span>STARTED</span><b>'+esc(date(a.startedAt))+'</b></div>'+
            '<div><span>COMPLETED</span><b>'+esc(date(a.completedAt))+'</b></div>'+
            '<div><span>DURATION</span><b>'+esc(elapsed(a.startedAt,a.completedAt))+'</b></div>'+
          '</div>'+
          (!current&&status==='completed'
            ? '<div class="overview-warning"><span>!</span><div><b>Repository head differs from this snapshot.</b><small>Refresh analysis before using derived outputs as current.</small></div></div>'
            : '')+
        '</div>'+
      '</div>'+
      '<div class="card section"><div class="overview-card-head"><div><div class="kicker">ANALYSIS HISTORY</div><h3>Run ledger</h3><div class="sub">Persisted lifecycle records; failure details remain sanitized.</div></div><span class="tag">'+n(arr(d.analysisRuns,'runs').length)+' shown</span></div><div class="table section"><table><thead><tr><th>Status</th><th>Mode</th><th>Target</th><th>Started</th><th>Completed</th><th></th></tr></thead><tbody>'+(arr(d.analysisRuns,'runs').slice(0,20).map(function(x){return '<tr><td><span class="pill '+cls(x.status)+'">'+esc(x.status||'unknown')+'</span></td><td>'+esc(x.mode||'—')+'</td><td class="mono">'+esc(sha(x.targetHeadSha))+'</td><td>'+esc(date(x.startedAt))+'</td><td>'+esc(date(x.completedAt))+'</td><td>'+((x.errorMessage)?inspectButton("Analysis run "+sha(x.id),"Sanitized analysis failure diagnostics.",x):inspectButton("Analysis run "+sha(x.id),"Persisted analysis lifecycle record.",x))+'</td></tr>'}).join('')||'<tr><td colspan="6" class="dim">No analysis runs persisted.</td></tr>')+'</tbody></table></div>'+(d.analysisRuns&&d.analysisRuns.pagination&&d.analysisRuns.pagination.page<d.analysisRuns.pagination.totalPages?'<div style="margin-top:12px"><button class="btn" data-action="analysis-runs-more">'+(S.analysisRunsLoading?'Loading…':'Load older analysis runs')+'</button></div>':'')+'</div>'+
      '<div class="grid g2 section"><div class="card"><div class="overview-card-head"><div><div class="kicker">RECENT HISTORY</div><h3>Latest persisted changes</h3><div class="sub">Newest commits first; inspect the source evidence behind each item.</div></div></div><div class="timeline">'+(c.slice(0,7).map(function(x){return '<div class="item"><i></i><strong>'+esc(x.subject)+'</strong><p><span class="mono">'+esc(sha(x.sha))+'</span> · '+esc(date(x.committed_at))+' · '+n(x.files_changed)+' files</p><div style="margin-top:7px">'+inspectButton('Commit '+sha(x.sha),'Persisted commit metadata and numstat evidence.',x)+'</div></div>'}).join('')||'<div class="empty">No commit evidence.</div>')+'</div></div>'+
      '<div class="card"><div class="overview-card-head"><div><div class="kicker">ACTIVITY SIGNAL</div><h3>Most touched files</h3><div class="sub">Historical activity signal — not a quality ranking.</div></div></div><div class="bars" style="margin-top:15px">'+(h.slice(0,8).map(function(x){return '<div class="bar"><span title="'+esc(x.path)+'">'+esc(x.path)+'</span><div class="track"><div class="fill" style="width:'+(Number(x.commits_touched||0)/max*100)+'%"></div></div><b>'+n(x.commits_touched)+'</b>'+inspectButton('Hotspot '+(x.path||'file'),'Historical file-activity signal from persisted commit evidence.',x)+'</div>'}).join('')||'<div class="empty">No hotspot evidence.</div>')+'</div></div></div>';
  }
  function historyView(){
    var d=S.data,c=arr(d.commits,'commits'),t=arr(d.timeline,'events'),commitPagination=d.commits&&d.commits.pagination||{},timelinePagination=d.timeline&&d.timeline.pagination||{};
    var actions=[];
    if(commitPagination.totalPages&&commitPagination.page<commitPagination.totalPages)actions.push('<button class="btn" data-action="more-commits">'+(S.commitLoading?'Loading…':'Load next 50 commits')+'</button>');
    if(timelinePagination.totalPages&&timelinePagination.page<timelinePagination.totalPages)actions.push('<button class="btn" data-action="more-timeline">'+(S.timelineLoading?'Loading…':'Load next 50 timeline events')+'</button>');
    var counts={};
    t.forEach(function(x){var key=x.eventType||'change';counts[key]=(counts[key]||0)+1});
    var signalTypes=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]||a.localeCompare(b)}).slice(0,5),signalMax=Math.max(1,...signalTypes.map(function(k){return counts[k]}));
    return shell('History','Chronological Git evidence with descriptive event classification.',actions.join(''))+
      '<div class="history-signalbar card">'+
        '<div class="history-stat"><span>LOADED COMMITS</span><b>'+n(c.length)+'</b><small>'+(commitPagination.total?esc(n(commitPagination.total))+' persisted total':'current page')+'</small></div>'+
        '<div class="history-stat"><span>TIMELINE EVENTS</span><b>'+n(t.length)+'</b><small>'+(timelinePagination.total?esc(n(timelinePagination.total))+' persisted total':'current page')+'</small></div>'+
        '<div class="history-stat"><span>LATEST OBSERVED</span><b>'+esc(c[0]&&date(c[0].committed_at)||'—')+'</b><small>Newest commit in this page</small></div>'+
        '<div class="history-stat"><span>OLDEST LOADED</span><b>'+esc(c.length&&date(c[c.length-1].committed_at)||'—')+'</b><small>Oldest commit in this page</small></div>'+
      '</div>'+
      '<div class="history-overview section">'+
        '<div class="card"><div class="overview-card-head"><div><div class="kicker">TIMELINE SIGNALS</div><h3>What the commit subjects are saying</h3><div class="sub">Keyword classifications are descriptive signals, not proof of intent.</div></div><span class="tag">'+n(signalTypes.length)+' signal types</span></div><div class="signal-bars section">'+signalTypes.map(function(k){return '<div class="signal-bar"><div class="signal-label"><b>'+esc(k)+'</b><span>'+n(counts[k])+'</span></div><div class="track"><div class="fill" style="width:'+(counts[k]/signalMax*100)+'%"></div></div></div>'}).join('')+(signalTypes.length?'':'<div class="empty">No timeline signal evidence.</div>')+'</div></div>'+
        '<div class="card"><div class="overview-card-head"><div><div class="kicker">CHANGE LEDGER</div><h3>Recent commit footprint</h3><div class="sub">A compact view before opening the full ledger.</div></div></div><div class="commit-footprint">'+c.slice(0,6).map(function(x){return '<div class="footprint-row"><span class="mono">'+esc(sha(x.sha))+'</span><strong>'+esc(x.subject||'—')+'</strong><small>'+n(x.files_changed)+' files · +'+n(x.additions)+' / −'+n(x.deletions)+'</small></div>'}).join('')+(c.length?'':'<div class="empty">No commit evidence.</div>')+'</div></div>'+
      '</div>'+
      '<div class="grid g2 section"><div class="card"><div class="overview-card-head"><div><div class="kicker">CHRONOLOGY</div><h3>Timeline</h3><div class="sub">Latest persisted event projections, with direct evidence inspection.</div></div></div><div class="timeline history-timeline">'+(t.map(function(x){return '<div class="item"><i></i><strong>'+esc(x.subject)+'</strong><p><span class="tag">'+esc(x.eventType||'change')+'</span> · <span class="mono">'+esc(sha(x.sha))+'</span> · '+esc(date(x.committed_at))+'</p><div style="margin-top:7px">'+inspectButton('Timeline '+sha(x.sha),'Commit-subject classification evidence from the timeline projection.',x)+'</div></div>'}).join('')||'<div class="empty">No timeline evidence.</div>')+'</div></div>'+
      '<div class="card"><div class="overview-card-head"><div><div class="kicker">FULL LEDGER</div><h3>Commit history</h3><div class="sub">Persisted metadata and Git numstat evidence.</div></div><span class="tag">'+(commitPagination.totalPages?('Page '+n(commitPagination.page)+' / '+n(commitPagination.totalPages)):'Current page')+'</span></div><div class="table section"><table><thead><tr><th>Commit</th><th>Subject</th><th>Files</th><th>+</th><th>−</th><th>When</th><th></th></tr></thead><tbody>'+(c.map(function(x){return '<tr><td class="mono">'+esc(sha(x.sha))+'</td><td>'+esc(x.subject)+'</td><td>'+n(x.files_changed)+'</td><td>'+n(x.additions)+'</td><td>'+n(x.deletions)+'</td><td>'+esc(date(x.committed_at))+'</td><td>'+inspectButton('Commit '+sha(x.sha),'Persisted commit metadata and numstat evidence.',x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="7" class="dim">No commit evidence.</td></tr>')+'</tbody></table></div></div></div>';
  }
  function structure(){
    var d=S.data,ar=arr(d.architecture,'events'),de=arr(d.dependencies,'changes'),cx=arr(d.complexity,'events'),co=arr(d.coupling,'pairs');
    var dependencyKinds={},complexityDelta=0;
    de.forEach(function(x){var key=x.change_type||'change';dependencyKinds[key]=(dependencyKinds[key]||0)+1});
    cx.forEach(function(x){complexityDelta+=Number(x.delta&&x.delta.cyclomaticComplexity||0)});
    var depTypes=Object.keys(dependencyKinds).sort(function(a,b){return dependencyKinds[b]-dependencyKinds[a]||a.localeCompare(b)}).slice(0,4);
    return shell('Structure','Architecture, dependency, complexity and co-change evidence')+
      '<div class="grid g4">'+
        metric('Architecture events',n(ar.length),'historical tree evidence')+
        metric('Dependency changes',n(de.length),'package manifest evidence')+
        metric('Complexity events',n(cx.length),'AST-derived source changes')+
        metric('Coupled pairs',n(co.length),'same-commit co-changes')+
      '</div>'+
      '<div class="structure-summary section">'+
        '<div class="card"><div class="overview-card-head"><div><div class="kicker">ARCHITECTURE MAP</div><h3>How the repository surface changed</h3><div class="sub">Top-level directory surfaces from persisted Git tree evidence. This is a structural index, not a runtime dependency graph.</div></div><span class="tag">'+n(ar.length)+' events</span></div>'+architectureMap(ar)+'</div>'+
        '<div class="card"><div class="overview-card-head"><div><div class="kicker">DEPENDENCY PULSE</div><h3>Package change mix</h3><div class="sub">Historical package.json changes, grouped by observed change type.</div></div></div><div class="dep-pulse">'+depTypes.map(function(k){var max=Math.max.apply(null,depTypes.map(function(x){return dependencyKinds[x]}).concat([1]));return '<div class="dep-pulse-row"><div><b>'+esc(k)+'</b><span>'+n(dependencyKinds[k])+'</span></div><div class="track"><div class="fill" style="width:'+(dependencyKinds[k]/max*100)+'%"></div></div></div>'}).join('')+(depTypes.length?'':'<div class="empty">No dependency-change evidence.</div>')+'</div><div class="structure-footnote"><span>Δ complexity</span><b class="mono">'+esc(n(complexityDelta))+'</b><small>sum of observed cyclomatic deltas across loaded complexity events</small></div></div>'+
      '</div>'+
      '<div class="grid g2 section"><div class="card"><div class="overview-card-head"><div><div class="kicker">STRUCTURE EVENTS</div><h3>Architecture evolution</h3><div class="sub">Observed directory/root-path changes with direct evidence inspection.</div></div></div><div class="table section"><table><thead><tr><th>Event</th><th>Path</th><th>Root</th><th>Commit</th><th></th></tr></thead><tbody>'+(ar.slice(0,40).map(function(x){return '<tr><td>'+esc(x.event_type)+'</td><td class="path">'+esc(x.path)+'</td><td class="path">'+esc(x.root_path)+'</td><td class="mono">'+esc(sha(x.sha))+'</td><td>'+inspectButton("Architecture "+(x.path||"event"),"Observed directory/root-path change evidence.",x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No architecture evidence.</td></tr>')+'</tbody></table></div></div>'+
      '<div class="card"><div class="overview-card-head"><div><div class="kicker">DEPENDENCIES</div><h3>Dependency evolution</h3><div class="sub">Historical package.json changes with version movement visible.</div></div></div><div class="table section"><table><thead><tr><th>Package</th><th>Scope</th><th>Change</th><th>From</th><th>To</th><th></th></tr></thead><tbody>'+(de.slice(0,40).map(function(x){return '<tr><td class="path">'+esc(x.package_name)+'</td><td>'+esc(x.scope)+'</td><td>'+esc(x.change_type)+'</td><td class="mono">'+esc(x.previous_spec||'—')+'</td><td class="mono">'+esc(x.current_spec||'—')+'</td><td>'+inspectButton("Dependency "+(x.package_name||"package"),"Historical package.json dependency evidence.",x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="6" class="dim">No dependency evidence.</td></tr>')+'</tbody></table></div></div></div>'+
      '<div class="grid g2 section"><div class="card"><div class="overview-card-head"><div><div class="kicker">COMPLEXITY</div><h3>Complexity change events</h3><div class="sub">AST-derived metrics tied to changed source files.</div></div><span class="tag">Δ cyclomatic '+esc(n(complexityDelta))+'</span></div><div class="table section"><table><thead><tr><th>Path</th><th>Before</th><th>After</th><th>Δ</th><th></th></tr></thead><tbody>'+(cx.slice(0,50).map(function(x){return '<tr><td class="path">'+esc(x.path)+'</td><td>'+n(x.before&&x.before.cyclomaticComplexity)+'</td><td>'+n(x.after&&x.after.cyclomaticComplexity)+'</td><td>'+n(x.delta&&x.delta.cyclomaticComplexity)+'</td><td>'+inspectButton("Complexity "+(x.path||"file"),"AST-derived source metrics for a changed file.",x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No complexity evidence.</td></tr>')+'</tbody></table></div></div>'+
      '<div class="card"><div class="overview-card-head"><div><div class="kicker">CO-CHANGE</div><h3>Change coupling</h3><div class="sub">Files observed changing together in persisted commits.</div></div><span class="tag">'+n(co.length)+' pairs</span></div><div class="table section"><table><thead><tr><th>Path A</th><th>Path B</th><th>Co-changes</th><th></th></tr></thead><tbody>'+(co.slice(0,50).map(function(x){return '<tr><td class="path">'+esc(x.path_a)+'</td><td class="path">'+esc(x.path_b)+'</td><td>'+n(x.co_change_count)+'</td><td>'+inspectButton("Coupling "+(x.path_a||"path")+" <-> "+(x.path_b||"path"),"Files observed changing together in persisted commits.",x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="4" class="dim">No coupling evidence.</td></tr>')+'</tbody></table></div></div></div>';
  }
  function quality(){
    var d=S.data,b=arr(d.bugs,'areas'),r=arr(d.repeated,'files'),rf=arr(d.refactors,'signals'),m=arr(d.migrations,'events'),t=arr(d.tests,'events'),ts=d.testSummary||{};
    var testDelta=Number(ts.testCaseDelta||0),migrationOps=m.reduce(function(sum,x){return sum+Number(x.operationCount||0)},0),signalTotal=b.length+r.length+rf.length;
    return shell('Quality evidence','Historical signals across bug/fix subjects, repeated changes, refactors, tests and database migrations')+
      '<div class="grid g4">'+metric('Bug-area signals',n(b.length),'heuristic signals')+metric('Repeatedly modified',n(r.length),'historical touch frequency')+metric('Refactor signals',n(rf.length),'subject heuristic')+metric('Migration events',n(m.length),'source-file analysis')+'</div>'+
      '<div class="quality-map section">'+
        '<div class="card quality-map-card"><div class="kicker">HISTORICAL SIGNALS</div><h3>Change pressure</h3><div class="sub">These surfaces show where the repository changed repeatedly or where commit subjects produced heuristic signals.</div><div class="quality-big">'+n(signalTotal)+'</div><div class="quality-caption">signal records across the loaded evidence</div><div class="quality-mini-list"><span>Bug / fix <b>'+n(b.length)+'</b></span><span>Repeated <b>'+n(r.length)+'</b></span><span>Refactor <b>'+n(rf.length)+'</b></span></div></div>'+
        '<div class="card quality-map-card"><div class="kicker">TEST EVIDENCE</div><h3>Test surface</h3><div class="sub">Source-level test change evidence, not runtime pass/fail.</div><div class="quality-big">'+n(ts.testCaseCount)+'</div><div class="quality-caption">observed test cases in analyzed source</div><div class="quality-mini-list"><span>Events <b>'+n(ts.eventCount||t.length)+'</b></span><span>Δ cases <b>'+n(testDelta)+'</b></span><span>Assertions <b>'+n(ts.assertionCount)+'</b></span></div></div>'+
        '<div class="card quality-map-card"><div class="kicker">SCHEMA EVIDENCE</div><h3>Migration surface</h3><div class="sub">Migration files are inspected as source evidence; Autopsy does not execute them.</div><div class="quality-big">'+n(m.length)+'</div><div class="quality-caption">migration events loaded</div><div class="quality-mini-list"><span>Operations <b>'+n(migrationOps)+'</b></span><span>Source evidence <b>'+n(m.length)+'</b></span><span>Execution <b>Not run</b></span></div></div>'+
      '</div>'+
      '<div class="grid g2 section"><div class="card"><div class="overview-card-head"><div><div class="kicker">BUG / FIX SIGNALS</div><h3>Signal areas</h3><div class="sub">Observed commit subjects; these do not prove a defect.</div></div><span class="tag">'+n(b.length)+' areas</span></div><div class="table section"><table><thead><tr><th>Path</th><th>Signals</th><th>Touches</th><th>Ratio</th><th></th></tr></thead><tbody>'+(b.slice(0,35).map(function(x){return '<tr><td class="path">'+esc(x.path)+'</td><td>'+n(x.signal_commits)+'</td><td>'+n(x.total_commits_touched)+'</td><td>'+pct(x.signal_ratio)+'</td><td>'+inspectButton("Bug-area signal "+(x.path||"file"),"Subject-based historical bug/fix signal; not defect proof.",x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No bug-area signal evidence.</td></tr>')+'</tbody></table></div></div>'+
      '<div class="card"><div class="overview-card-head"><div><div class="kicker">TEST EVOLUTION</div><h3>Test surface changes</h3><div class="sub">Changed-test source evidence — not pass/fail.</div></div><span class="tag">'+n(t.length)+' events</span></div><div class="table section"><table><thead><tr><th>Path</th><th>Framework</th><th>Type</th><th>Δ cases</th><th></th></tr></thead><tbody>'+(t.slice(0,25).map(function(x){return '<tr><td class="path">'+esc(x.path)+'</td><td>'+esc(x.framework)+'</td><td>'+esc(x.testType)+'</td><td>'+n(x.testCaseDelta)+'</td><td>'+inspectButton("Test evolution "+(x.path||"file"),"Changed-test source evidence; not runtime pass/fail evidence.",x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No test-change evidence.</td></tr>')+'</tbody></table></div></div></div>'+
      '<div class="grid g2 section"><div class="card"><div class="overview-card-head"><div><div class="kicker">REPEATED CHANGE</div><h3>Repeatedly modified files</h3><div class="sub">Historical touch frequency, not a quality ranking.</div></div><span class="tag">'+n(r.length)+' files</span></div><div class="table section"><table><thead><tr><th>Path</th><th>Touches</th><th>Churn</th><th>Span</th><th></th></tr></thead><tbody>'+(r.slice(0,30).map(function(x){return '<tr><td class="path">'+esc(x.path)+'</td><td>'+n(x.commits_touched)+'</td><td>'+n(x.total_churn)+'</td><td>'+n(x.change_span_days)+'d</td><td>'+inspectButton("Repeated file "+(x.path||"file"),"Historical repeated-modification evidence.",x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No repeated-change evidence.</td></tr>')+'</tbody></table></div></div>'+
      '<div class="card"><div class="overview-card-head"><div><div class="kicker">REFACTOR SIGNALS</div><h3>Refactor candidates</h3><div class="sub">Commit-subject heuristic signals; not proof of intent.</div></div><span class="tag">'+n(rf.length)+' signals</span></div><div class="table section"><table><thead><tr><th>Commit</th><th>Subject</th><th>Files changed</th><th>When</th><th></th></tr></thead><tbody>'+(rf.slice(0,30).map(function(x){return '<tr><td class="mono">'+esc(sha(x.sha))+'</td><td>'+esc(x.subject||"—")+'</td><td>'+n(x.files_changed)+'</td><td>'+esc(date(x.committed_at))+'</td><td>'+inspectButton("Refactor signal "+sha(x.sha),"Commit-subject refactor signal evidence.",x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="5" class="dim">No refactor signal evidence.</td></tr>')+'</tbody></table></div></div></div>'+
      '<div class="card section"><div class="overview-card-head"><div><div class="kicker">DATABASE MIGRATIONS</div><h3>Migration evidence</h3><div class="sub">Source evidence; target migrations are never executed by Autopsy.</div></div><span class="tag">'+n(migrationOps)+' operations</span></div><div class="table section"><table><thead><tr><th>Path</th><th>Framework</th><th>Kind</th><th>Ops</th><th>Status</th><th></th></tr></thead><tbody>'+(m.slice(0,30).map(function(x){return '<tr><td class="path">'+esc(x.path)+'</td><td>'+esc(x.framework)+'</td><td>'+esc(x.migrationKind)+'</td><td>'+n(x.operationCount)+'</td><td>'+esc(x.analysisStatus)+'</td><td>'+inspectButton("Migration "+(x.path||"file"),"Database migration source evidence; migrations are not executed by Autopsy.",x)+'</td></tr>'}).join('')||'<tr data-empty-state="true"><td colspan="6" class="dim">No migration evidence.</td></tr>')+'</tbody></table></div></div>';
  }
  function runtimeFilterDate(value){if(!value)return'';var d=new Date(value);return isNaN(d)?'':d.toISOString()}
  function runtimeInputDate(value){if(!value)return'';var d=new Date(value);if(isNaN(d))return'';function pad(x){return String(x).padStart(2,'0')}return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())}
  function runtimeEventsPathWithFilter(page,limit,filter){var f=filter||S.runtimeFilter,q=['page='+encodeURIComponent(page),'limit='+encodeURIComponent(limit||40)];[['from',runtimeFilterDate(f.from)],['to',runtimeFilterDate(f.to)],['deploymentId',f.deploymentId],['revisionSha',f.revisionSha],['environment',f.environment],['operationName',f.operationName],['signalType',f.signalType]].forEach(function(x){if(x[1])q.push(x[0]+'='+encodeURIComponent(x[1]))});return '/api/repositories/'+S.repoId+'/runtime/telemetry?'+q.join('&')}
  function runtimeEventsPath(page,limit){return runtimeEventsPathWithFilter(page,limit,S.runtimeFilter)}
  function runtime(){
    var d=S.data,rt=d.runtime&&d.runtime.overall||{},g=arr(d.runtime,'groups'),dp=arr(d.deployments,'events'),hs=d.historicalSummary&&d.historicalSummary.result||{},hc=arr(d.historicalCorrelation,'events'),sc=d.historicalSourceContext&&d.historicalSourceContext.coverage||{},sci=arr(d.historicalSourceContext,'events'),re=(S.runtimeEvents&&S.runtimeEvents.length?S.runtimeEvents:arr(d.runtimeEvents,'events')),rp=S.runtimePagination||d.runtimeEvents&&d.runtimeEvents.pagination||{};
    var depRows=dp.slice(0,30).map(function(x){return '<tr><td>'+esc(x.provider)+'</td><td class="mono">'+esc(x.deploymentId)+'</td><td>'+esc(x.environment)+'</td><td>'+esc(x.state)+'</td><td class="mono">'+esc(sha(x.revisionSha))+'</td><td>'+inspectButton('Deployment '+x.deploymentId,'Observed deployment evidence record.',x)+' <button class="inspect" data-deployment-id="'+esc(x.deploymentId)+'">Provenance</button></td></tr>'}).join('');
    var runtimeRows=re.map(function(x){return '<tr><td>'+esc(date(x.observedAt))+'</td><td>'+esc(x.signalType||'—')+'</td><td>'+esc(x.serviceName||'—')+'<div class="sub">'+esc(x.operationName||'—')+'</div></td><td>'+esc(x.environment||'—')+'</td><td class="mono">'+esc(sha(x.revisionSha))+'</td><td>'+ms(x.durationMs)+'</td><td>'+esc(x.status||'—')+(x.errorType?'<div class="sub">'+esc(x.errorType)+'</div>':'')+'</td><td>'+inspectButton('Runtime event '+(x.eventId||x.id),'Observed runtime telemetry event.',x)+'</td></tr>'}).join('');
    var runtimePager=(rp.totalPages&&rp.page<rp.totalPages)?'<div style="margin-top:10px"><button class="btn" data-action="runtime-more">Load next 40 runtime events</button></div>':'';
    var histItems=hc.slice(0,20),a=S.analysis||{},snap=currentAnalysisSnapshot(),targetSha=a.targetHeadSha||snap&&snap.targetHeadSha||'';
    var runtimeLineage=[
      {k:'OBSERVED',t:'Runtime telemetry',v:n(rt.sampleCount),s:'Directly persisted runtime samples.'},
      {k:'EXTERNAL',t:'Deployments',v:n(dp.length),s:'Deployment records supplied by integrations.'},
      {k:'CORRELATED',t:'History links',v:n(hs.pageCoverage&&hs.pageCoverage.ready),s:'Commit windows with usable runtime evidence.'},
      {k:'CONTEXT',t:'Source context',v:n(sc.sourceContextAvailable),s:'Correlations with changed-file context available.'}
    ].map(function(x){return '<div class="runtime-lineage-step"><span class="runtime-lineage-kicker">'+x.k+'</span><strong>'+esc(x.t)+'</strong><b>'+esc(x.v)+'</b><small>'+esc(x.s)+'</small></div>'}).join('');
    var snapSummary=snap?'<span class="runtime-snapshot-id"><span>ANALYSIS TARGET</span><b class="mono">'+esc(sha(targetSha))+'</b></span><span class="runtime-snapshot-id"><span>RUN</span><b class="mono">'+esc(String(snap.analysisRunId||S.runId||'—'))+'</b></span>':'<span class="runtime-snapshot-id"><span>SNAPSHOT</span><b>Not available</b></span>';
    var runtimePosture=[
      ['Observed telemetry',n(rt.sampleCount),'direct runtime samples'],
      ['Deployment records',n(dp.length),'externally supplied evidence'],
      ['Historical ready',n(hs.pageCoverage&&hs.pageCoverage.ready),'correlations with usable evidence'],
      ['Source context',n(sc.sourceContextAvailable),'changed-file context available']
    ];
    var postureHtml=runtimePosture.map(function(x){return '<div class="runtime-posture-item"><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b><small>'+esc(x[2])+'</small></div>'}).join('');
    return shell('Runtime & provenance','Observed runtime telemetry, historical reconstruction and externally supplied deployment evidence')+
      '<div class="runtime-posture card"><div class="arch-title"><div><h3>Evidence posture</h3><div class="sub">The runtime workspace separates direct observations, external deployment records and historical reconstruction before any interpretation.</div></div><span class="tag">provenance kept explicit</span></div><div class="runtime-posture-grid">'+postureHtml+'</div></div>'+
      '<div class="runtime-lineage card"><div class="arch-title"><div><h3>Provenance chain</h3><div class="sub">A visible boundary between telemetry, historical correlation and source context.</div></div><div class="runtime-snapshot">'+snapSummary+'</div></div><div class="runtime-lineage-grid">'+runtimeLineage+'</div><div class="runtime-lineage-note"><span>BOUNDARY</span><strong>Correlation narrows the historical window; it does not establish causality.</strong><small>Inspect the underlying event or deployment record from the tables below.</small></div></div>'+
      '<div class="grid g4">'+metric('Runtime samples',n(rt.sampleCount))+metric('p95 duration',ms(rt.p95DurationMs))+metric('Error rate',pct(rt.errorRate))+metric('Deployment evidence',n(dp.length))+'</div>'+
      '<div class="grid g4 section">'+metric('Historical commits',n(hs.totalCommits))+metric('Page commits',n(hs.pageCoverage&&hs.pageCoverage.commits))+metric('Ready correlations',n(hs.pageCoverage&&hs.pageCoverage.ready))+metric('Evidence gaps',n(hs.pageCoverage&&hs.pageCoverage.evidenceGaps))+'</div>'+
      '<div class="card section"><div class="arch-title"><div><h3>Runtime event explorer</h3><div class="sub">Direct inspection of persisted telemetry. Filters narrow observed evidence; they do not establish causality.</div></div><span class="tag">'+n(rp.total||re.length)+' events</span></div><div class="filter-panel section"><div class="filter-head"><div><b>Quick filters</b><small>Start with environment, operation or signal.</small></div><div class="filter-actions"><button class="btn primary" data-action="runtime-filter">Apply filters</button><button class="btn" data-action="runtime-clear-filter">Clear</button></div></div><div class="grid g3 filter-grid"><label class="field">Environment<input id="rtEnvironment" value="'+esc(S.runtimeFilter.environment)+'" placeholder="production"></label><label class="field">Operation<input id="rtOperation" value="'+esc(S.runtimeFilter.operationName)+'" placeholder="api.request"></label><label class="field">Signal type<select id="rtSignal" style="background:#12120f;border:1px solid var(--line);border-radius:10px;color:var(--text);padding:12px"><option value="">All signals</option><option value="http"'+(S.runtimeFilter.signalType==='http'?' selected':'')+'>http</option><option value="job"'+(S.runtimeFilter.signalType==='job'?' selected':'')+'>job</option><option value="db"'+(S.runtimeFilter.signalType==='db'?' selected':'')+'>db</option><option value="external"'+(S.runtimeFilter.signalType==='external'?' selected':'')+'>external</option><option value="custom"'+(S.runtimeFilter.signalType==='custom'?' selected':'')+'>custom</option></select></label></div><details class="filter-advanced"><summary>Advanced filters</summary><div class="grid g3"><label class="field">From<input id="rtFrom" type="datetime-local" value="'+esc(runtimeInputDate(S.runtimeFilter.from))+'"></label><label class="field">To<input id="rtTo" type="datetime-local" value="'+esc(runtimeInputDate(S.runtimeFilter.to))+'"></label><label class="field">Deployment ID<input id="rtDeployment" value="'+esc(S.runtimeFilter.deploymentId)+'" placeholder="deployment-id"></label><label class="field">Revision SHA<input id="rtRevision" value="'+esc(S.runtimeFilter.revisionSha)+'" placeholder="40/64-char SHA"></label></div></details></div><div class="table section"><table><thead><tr><th>Observed</th><th>Signal</th><th>Service / operation</th><th>Env</th><th>Revision</th><th>Duration</th><th>Status</th><th></th></tr></thead><tbody>'+runtimeRows+'</tbody></table></div>'+runtimePager+'</div>'+
      '<div class="grid g2 section"><div class="card"><h3>Runtime groups</h3><div class="sub">Persisted observations by summary grouping</div><div class="table section"><table><thead><tr><th>Group</th><th>Samples</th><th>Avg</th><th>Error</th></tr></thead><tbody>'+g.slice(0,40).map(function(x){return '<tr><td class="path">'+esc(x.key)+'</td><td>'+n(x.sampleCount)+'</td><td>'+ms(x.avgDurationMs)+'</td><td>'+pct(x.errorRate)+'</td></tr>'}).join('')+'</tbody></table></div></div>'+
      '<div class="card"><h3>Deployment evidence</h3><div class="sub">External records without current-traffic inference</div><div class="table section"><table><thead><tr><th>Provider</th><th>Deployment</th><th>Env</th><th>State</th><th>Revision</th><th></th></tr></thead><tbody>'+depRows+'</tbody></table></div></div></div>'+
      '<div class="card section"><div class="arch-title"><div><h3>Historical runtime reconstruction</h3><div class="sub">Commit-by-commit reconstruction using persisted runtime evidence. Missing coverage stays explicit.</div></div><span class="tag">'+(S.historicalLoading?'Refreshing…':'Configurable evidence window')+'</span></div><div class="filter-panel section"><div class="filter-head"><div><b>Reconstruction window</b><small>Start focused; widen only when coverage is sparse.</small></div><div class="filter-actions"><button class="btn primary" data-action="historical-filter">Apply</button><button class="btn" data-action="historical-clear-filter">Reset</button></div></div><div class="grid g3 filter-grid"><label class="field">Window (minutes)<input id="histWindow" type="number" min="5" max="1440" step="1" value="'+esc(S.historicalFilter.windowMinutes)+'"></label><label class="field">Minimum samples<input id="histSamples" type="number" min="1" max="10000" step="1" value="'+esc(S.historicalFilter.minSamples)+'"></label><label class="field">Environment<input id="histEnvironment" value="'+esc(S.historicalFilter.environment)+'" placeholder="production"></label><label class="field">Signal type<select id="histSignal" style="background:#12120f;border:1px solid var(--line);border-radius:10px;color:var(--text);padding:12px"><option value="">All signals</option><option value="http"'+(S.historicalFilter.signalType==='http'?' selected':'')+'>http</option><option value="job"'+(S.historicalFilter.signalType==='job'?' selected':'')+'>job</option><option value="db"'+(S.historicalFilter.signalType==='db'?' selected':'')+'>db</option><option value="external"'+(S.historicalFilter.signalType==='external'?' selected':'')+'>external</option><option value="custom"'+(S.historicalFilter.signalType==='custom'?' selected':'')+'>custom</option></select></label></div><details class="filter-advanced"><summary>Advanced identity filters</summary><div class="grid g3"><label class="field">Deployment ID<input id="histDeployment" value="'+esc(S.historicalFilter.deploymentId)+'" placeholder="deployment-id"></label><label class="field">Operation<input id="histOperation" value="'+esc(S.historicalFilter.operationName)+'" placeholder="api.request"></label></div></details></div><div class="table section"><table><thead><tr><th>Commit</th><th>Subject</th><th>Samples</th><th>Assessment</th><th>Evidence</th></tr></thead><tbody>'+(histItems.map(function(x){return '<tr><td class="mono">'+esc(sha(x.commit&&x.commit.sha||x.sha))+'</td><td>'+esc(x.commit&&x.commit.subject||x.subject||'—')+'</td><td>'+n(x.correlation&&x.correlation.assessment&&x.correlation.assessment.sampleComparison&&x.correlation.assessment.sampleComparison.targetSampleCount)+'</td><td>'+esc(x.correlation&&x.correlation.status||'—')+'</td><td>'+inspectButton('Historical runtime '+sha(x.commit&&x.commit.sha||x.sha),'Historical runtime reconstruction record.',x)+'</td></tr>'}).join('')||'<tr><td colspan="5" class="dim">No historical runtime records returned.</td></tr>')+'</tbody></table></div></div>'+
      '<div class="card section"><div class="arch-title"><div><h3>Historical source-change context</h3><div class="sub">Exact changed-file evidence attached to each historical runtime comparison. Files remain evidence for the commit as a whole.</div></div><div class="grid g4">'+metric('Context available',n(sc.sourceContextAvailable))+metric('Complete',n(sc.sourceContextComplete))+metric('Truncated',n(sc.sourceContextTruncated))+metric('Files reported',n(sc.totalChangedFilesReported))+'</div></div><div class="table section"><table><thead><tr><th>Commit</th><th>Source context</th><th>Files</th><th>Change</th><th>Runtime</th><th></th></tr></thead><tbody>'+(sci.slice(0,20).map(function(x){var c=x.commit||{},s=x.sourceContext||{},r=x.runtimeEvidence||{};return '<tr><td class="mono">'+esc(sha(c.sha))+'</td><td>'+esc(s.status||'—')+'<div class="sub">'+n(s.filesReported)+' reported</div></td><td>'+(Array.isArray(s.changedFiles)&&s.changedFiles.length?s.changedFiles.slice(0,5).map(function(f){return '<div class="path">'+esc(f.path)+'</div>'}).join(''):'<span class="dim">No changed-file context</span>')+(s.changedFilesTruncated?'<div class="sub">Additional files omitted by bound.</div>':'')+'</td><td>'+n(c.filesChanged)+' files · +'+n(c.additions)+' / −'+n(c.deletions)+'</td><td><span class="pill '+cls(r.status)+'">'+esc(r.status||'—')+'</span></td><td>'+inspectButton('Source context '+sha(c.sha),'Persisted changed-file context paired with the historical runtime evidence.',x)+'</td></tr>'}).join('')||'<tr><td colspan="6" class="dim">No historical source-context records returned.</td></tr>')+'</tbody></table></div></div>'+
      '<div class="callout section">Source context shows what changed in the persisted commit. Autopsy does not attribute runtime measurements to individual files or infer causality.</div>';
  }
  function reportPage(){var rep=S.data.report,a=S.analysis||{},current=!!(rep&&currentAnalysisSnapshot()&&rep.analysis&&rep.analysis.runId===S.runId&&sameRevision(rep.analysis.targetHeadSha,a.targetHeadSha)),actions=current?'<button class="btn" data-action="download">Download JSON</button><button class="btn" data-action="interpretation">Generate insights</button>':'';actions+='<button class="btn primary" data-action="report"'+(S.reportLoading?' disabled aria-busy="true"':'')+'>'+(S.reportLoading?'Generating…':(current?'Generate / refresh':'Generate current report'))+'</button>';return shell('Evidence report','A bounded report generated from the latest completed analysis snapshot',actions)+'<div id="reportBox" class="section">'+(current?reportHtml(rep):'<div class="empty"><strong>Report requires a current analysis</strong>Refresh the analysis before using a report from an older repository snapshot.</div>')+'</div>'}
  function reportHtml(rep){
    var sections=Array.isArray(rep.sections)?rep.sections:[],claims=0,evidenceRefs=0,limited=0;
    sections.forEach(function(s){var cs=Array.isArray(s.claims)?s.claims:[];claims+=cs.length;cs.forEach(function(c){evidenceRefs+=Array.isArray(c.evidence)?c.evidence.length:0;if(c.limitation)limited++})});
    var sectionRows=sections.map(function(s){return '<div class="report-index-row"><span>'+esc(s.title||'Untitled section')+'</span><b>'+n(Array.isArray(s.claims)?s.claims.length:0)+'</b><small>'+esc(s.evidenceBasis||'Evidence basis unavailable')+'</small></div>'}).join('');
    return '<div class="grid g4">'+metric('Report version',rep.reportVersion)+metric('Persisted commits',n(rep.coverage&&rep.coverage.persistedCommits))+metric('Evidence sections',n(rep.coverage&&rep.coverage.sectionsWithEvidence))+metric('Fingerprint',sha(rep.fingerprint))+'</div>'+
      '<div class="report-posture card section"><div class="arch-title"><div><h3>Evidence posture</h3><div class="sub">This report is a bounded projection of the current completed analysis snapshot. Claims keep their evidence references and limitations.</div></div><span class="tag">snapshot-bound</span></div><div class="report-posture-grid">'+
        '<div><span>Claims</span><b>'+n(claims)+'</b><small>generated statements</small></div>'+
        '<div><span>Evidence refs</span><b>'+n(evidenceRefs)+'</b><small>references attached to claims</small></div>'+
        '<div><span>With limits</span><b>'+n(limited)+'</b><small>claims carrying a limitation</small></div>'+
        '<div><span>Sections</span><b>'+n(sections.length)+'</b><small>report sections</small></div>'+
      '</div></div>'+
      '<div class="report-frame section"><div class="report-index card"><div class="arch-title"><div><h3>Report map</h3><div class="sub">Jump context at a glance before reading the detailed claims.</div></div><span class="tag">'+n(sections.length)+' sections</span></div><div class="report-index-list">'+(sectionRows||'<div class="empty">No report sections returned.</div>')+'</div></div>'+
      '<div class="callout">Generated '+esc(date(rep.generatedAt))+' · fingerprint <span class="mono">'+esc(rep.fingerprint)+'</span></div></div>'+
      '<div class="section">'+sections.map(function(s){return '<div class="report"><div class="report-head"><strong>'+esc(s.title)+'</strong><small>'+esc(s.evidenceBasis)+' · '+n((s.claims||[]).length)+' claims</small></div>'+(s.claims||[]).map(function(c){return '<div class="claim"><p>'+esc(c.statement)+'</p><div class="tags">'+(c.evidence||[]).slice(0,6).map(function(e){return '<span class="tag">'+esc(e.source)+':'+esc(e.key)+'</span>'}).join('')+'</div><div class="limit">'+esc(c.limitation)+'</div><div style="margin-top:8px">'+inspectButton('Inspect claim evidence','Claim statement, cited evidence references and limitation.',c)+'</div></div>'}).join('')+'</div>'}).join('')+'</div>';
  }
    function interpretation(){var rep=S.data.report,i=S.data.interpretation,a=S.analysis||{},current=!!(rep&&currentAnalysisSnapshot()&&rep.analysis&&rep.analysis.runId===S.runId&&sameRevision(rep.analysis.targetHeadSha,a.targetHeadSha)&&i&&i.result&&i.result.reportFingerprint===rep.fingerprint),ready=!!(rep&&currentAnalysisSnapshot()&&rep.analysis&&rep.analysis.runId===S.runId&&sameRevision(rep.analysis.targetHeadSha,a.targetHeadSha));return shell('Engineering insights','Evidence-grounded interpretation of the current report. The system keeps cited claims and uncertainties visible.',ready?'<button class="btn primary" data-action="interpretation"'+(S.interpretationLoading?' disabled aria-busy="true"':'')+'>'+(S.interpretationLoading?'Generating…':(current?'Refresh insights':'Generate insights'))+'</button>':'')+'<div id="aiBox" class="section">'+(current?interpretationHtml(i):'<div class="empty"><strong>Insights need a current report</strong>Generate the latest report before using insights from an older snapshot.</div>')+'</div>'}
  function interpretationHtml(x){
    var r=x&&x.result||x||{},i=r.interpretation||{},rep=S.data.report||{},sections=Array.isArray(rep.sections)?rep.sections:[];
    var themes=Array.isArray(i.themes)?i.themes:[],questions=Array.isArray(i.investigationQuestions)?i.investigationQuestions:[],uncertainties=Array.isArray(i.uncertainties)?i.uncertainties:[];
    function grounding(keys){var out=[];(Array.isArray(keys)?keys:[]).forEach(function(k){var parts=String(k).split("/"),sec=sections.find(function(s){return s.id===parts[0]}),claim=sec&&Array.isArray(sec.claims)?sec.claims.find(function(c){return c.id===parts.slice(1).join("/")||c.id===parts[1]}):null;if(sec&&claim)out.push({evidenceKey:k,sectionId:sec.id,sectionTitle:sec.title,claim:claim})});return out}
    function inspectGrounding(keys,basis){var rows=grounding(keys);return rows.length?inspectButton("Inspect supporting evidence",basis,rows):'<span class="dim">No matching grounding claim available.</span>'}
    var themeRefs=themes.reduce(function(total,t){return total+(Array.isArray(t.evidenceKeys)?t.evidenceKeys.length:0)},0),questionRefs=questions.reduce(function(total,q){return total+(Array.isArray(q.evidenceKeys)?q.evidenceKeys.length:0)},0);
    return '<div class="insight-posture card section"><div class="arch-title"><div><h3>Grounding posture</h3><div class="sub">Interpretation remains downstream of the current report. Evidence keys are resolved back to report claims before inspection.</div></div><span class="tag">'+(r.cacheHit?'cached result':'fresh result')+'</span></div><div class="insight-posture-grid">'+
      '<div><span>Grounding claims</span><b>'+n(r.groundingClaimCount)+'</b><small>claims available to the interpretation</small></div>'+
      '<div><span>Themes</span><b>'+n(themes.length)+'</b><small>'+n(themeRefs)+' evidence keys attached</small></div>'+
      '<div><span>Questions</span><b>'+n(questions.length)+'</b><small>'+n(questionRefs)+' evidence keys attached</small></div>'+
      '<div><span>Uncertainties</span><b>'+n(uncertainties.length)+'</b><small>limitations kept visible</small></div>'+
    '</div></div>'+
      '<div class="card section"><h3>Executive summary</h3><div class="callout">'+esc(i.executiveSummary||'No executive summary returned.')+'</div></div>'+
      '<div class="grid g2 section"><div class="card"><h3>Themes</h3><div class="section">'+(themes.map(function(t){return '<div class="story"><div class="story-topline"><span class="tag">theme</span><span class="story-evidence-count">'+n(Array.isArray(t.evidenceKeys)?t.evidenceKeys.length:0)+' refs</span></div><h3>'+esc(t.title)+'</h3><p style="font-size:10px;line-height:1.55;color:var(--muted)">'+esc(t.analysis)+'</p><div class="tags">'+(t.evidenceKeys||[]).map(function(k){return '<span class="tag">'+esc(k)+'</span>'}).join('')+'</div><div style="margin-top:8px">'+inspectGrounding(t.evidenceKeys,'Validated report claims referenced by this theme.')+'</div></div>'}).join('')||'<div class="empty">No themes returned.</div>')+'</div></div>'+
      '<div class="card"><h3>Investigation questions</h3><div class="section">'+(questions.map(function(q){return '<div class="callout"><div class="story-topline"><span class="tag">question</span><span class="story-evidence-count">'+n(Array.isArray(q.evidenceKeys)?q.evidenceKeys.length:0)+' refs</span></div><strong>'+esc(q.question)+'</strong><div class="tags" style="margin-top:7px">'+(q.evidenceKeys||[]).map(function(k){return '<span class="tag">'+esc(k)+'</span>'}).join('')+'</div><div style="margin-top:8px">'+inspectGrounding(q.evidenceKeys,'Validated report claims supporting this investigation question.')+'</div></div>'}).join('')||'<div class="empty">No investigation questions returned.</div>')+'</div></div></div>'+
      '<div class="card section"><h3>Uncertainties</h3><div class="section">'+(uncertainties.map(function(u){return '<div class="callout">'+esc(u)+'</div>'}).join('')||'<div class="empty">No uncertainties returned.</div>')+'</div></div>';
  }
    function contributors(){
    var d=S.data,items=arr(d.contributors,'contributors').slice(0,100);
    var pulse=items.slice().sort(function(a,b){return Number(b.commitCount||0)-Number(a.commitCount||0)||String(a.authorName||'').localeCompare(String(b.authorName||''))}).slice(0,8);
    var pulseMax=Math.max(1,Math.max.apply(null,pulse.map(function(x){return Number(x.commitCount||0)})));
    var pulseRows=pulse.map(function(x){
      var count=Number(x.commitCount||0),width=Math.max(4,Math.round((count/pulseMax)*100));
      return '<div class="contrib-pulse-row"><div class="contrib-pulse-head"><b>'+esc(x.authorName||'Unknown author')+'</b><span>'+n(count)+' commits</span></div><div class="contrib-track"><span style="width:'+width+'%"></span></div><div class="contrib-pulse-meta">'+n(x.pathsTouched||0)+' paths · last '+esc(date(x.lastCommittedAt))+'</div></div>';
    }).join('');
    return shell('Contributors','Descriptive activity reconstructed from exact persisted Git author name/email tuples.')+
      '<div class="grid g3">'+metric('Contributors',n(d.contributors&&d.contributors.totalContributors||0),'persisted author tuples')+metric('Displayed',n(items.length),'bounded result set')+metric('Identity rule','Exact tuples','aliases are not merged')+'</div>'+
      '<div class="contributor-overview section">'+
        '<div class="card"><div class="arch-title"><div><h3>Activity pulse</h3><div class="sub">Commit count is a descriptive Git-history measure; no ownership or impact is inferred.</div></div><span class="tag">top '+n(pulse.length)+' by commits</span></div><div class="contrib-pulse">'+(pulseRows||'<div class="empty">No contributor activity is loaded.</div>')+'</div></div>'+
        '<div class="card"><h3>Identity boundary</h3><div class="sub">Autopsy keeps author attribution literal rather than merging people by name, email domain or inferred aliases.</div><div class="contrib-boundary"><div><span>Measured</span><b>Git author tuple</b></div><div><span>Not measured</span><b>Ownership / effort / intent</b></div><div><span>Not measured</span><b>Business impact / seniority</b></div></div></div>'+
      '</div>'+
      '<div class="card section"><div class="table"><table><thead><tr><th>Author</th><th>Commits</th><th>Additions</th><th>Deletions</th><th>Churn</th><th>Paths</th><th>First</th><th>Last</th><th></th></tr></thead><tbody>'+
      items.map(function(x){return '<tr><td><strong>'+esc(x.authorName||'Unknown author')+'</strong><div class="sub mono">'+esc(x.authorEmail||'email unavailable')+'</div></td><td>'+n(x.commitCount)+'</td><td>'+n(x.additions)+'</td><td>'+n(x.deletions)+'</td><td>'+n(x.totalChurn)+'</td><td>'+n(x.pathsTouched)+'</td><td>'+esc(date(x.firstCommittedAt))+'</td><td>'+esc(date(x.lastCommittedAt))+'</td><td>'+inspectButton('Contributor '+(x.authorName||'Unknown'),'Persisted Git author tuple and activity aggregation.',x)+'</td></tr>'}).join('')+
      '</tbody></table></div></div>';
  }
  function evidencePage(){
    var d=S.data||{},items=[];
    function add(label,basis,payload,search){items.push({label:label,basis:basis,payload:payload,search:String(search||label).toLowerCase()})}
    var families=[
      {label:'Git history',items:arr(d.commits,'commits'),detail:'commits + persisted numstat'},
      {label:'Timeline',items:arr(d.timeline,'events'),detail:'classified commit events'},
      {label:'Structure',items:arr(d.architecture,'events').concat(arr(d.dependencies,'changes')),detail:'architecture + dependency change events'},
      {label:'Quality signals',items:arr(d.bugs,'areas').concat(arr(d.repeated,'files')).concat(arr(d.refactors,'signals')),detail:'historical quality signals'},
      {label:'Schema / tests',items:arr(d.migrations,'events').concat(arr(d.tests,'events')),detail:'migration + test evolution'},
      {label:'Runtime / deploy',items:arr(d.runtimeEvents,'events').concat(arr(d.deployments,'events')),detail:'observed telemetry + deployment evidence'},
      {label:'Contributors',items:arr(d.contributors,'contributors'),detail:'exact Git author tuples'}
    ];
    arr(d.commits,'commits').slice(0,20).forEach(function(x){add('Commit '+sha(x.sha)+' · '+(x.subject||'change'),'Persisted Git commit metadata and numstat evidence.',x,(x.subject||'')+' '+(x.sha||''))});
    arr(d.timeline,'events').slice(0,20).forEach(function(x){add('Timeline '+sha(x.sha)+' · '+(x.eventType||'change'),'Commit-subject classification evidence from the timeline projection.',x,(x.subject||'')+' '+(x.eventType||''))});
    arr(d.hotspots,'hotspots').slice(0,20).forEach(function(x){add('Hotspot '+(x.path||'file'),'Historical file-activity signal from persisted commit evidence.',x,x.path||'')});
    arr(d.architecture,'events').slice(0,20).forEach(function(x){add('Architecture '+(x.root_path||x.path||'root')+' · '+(x.event_type||'event'),'Observed directory/root-path change evidence.',x,(x.root_path||'')+' '+(x.path||'')+' '+(x.event_type||''))});
    arr(d.dependencies,'changes').slice(0,20).forEach(function(x){add('Dependency '+(x.package_name||'package')+' · '+(x.change_type||'change'),'Historical package.json dependency evidence.',x,(x.package_name||'')+' '+(x.change_type||''))});
    arr(d.complexity,'events').slice(0,20).forEach(function(x){add('Complexity '+(x.path||'file'),'AST-derived source metrics for a changed file.',x,x.path||'')});
    arr(d.coupling,'pairs').slice(0,20).forEach(function(x){add('Coupling '+(x.path_a||'path')+' ↔ '+(x.path_b||'path'),'Files observed changing together in persisted commits.',x,(x.path_a||'')+' '+(x.path_b||''))});
    arr(d.bugs,'areas').slice(0,20).forEach(function(x){add('Bug-area signal '+(x.path||'file'),'Subject-based historical bug/fix signal; not defect proof.',x,x.path||'')});
    arr(d.repeated,'files').slice(0,20).forEach(function(x){add('Repeated file '+(x.path||'file'),'Historical repeated-modification evidence.',x,x.path||'')});
    arr(d.refactors,'signals').slice(0,20).forEach(function(x){add('Refactor signal '+(x.path||'file'),'Commit-subject refactor signal evidence.',x,x.path||'')});
    arr(d.migrations,'events').slice(0,20).forEach(function(x){add('Migration '+(x.path||'file')+' · '+(x.migrationKind||'event'),'Database migration source evidence; migrations are not executed by Autopsy.',x,(x.path||'')+' '+(x.migrationKind||''))});
    arr(d.tests,'events').slice(0,20).forEach(function(x){add('Test evolution '+(x.path||'file'),'Changed-test source evidence; not runtime pass/fail evidence.',x,(x.path||'')+' '+(x.framework||''))});
    arr(d.runtimeEvents,'events').slice(0,20).forEach(function(x){add('Runtime '+(x.eventId||x.id||'event')+' · '+(x.signalType||'signal'),'Observed runtime telemetry event.',x,(x.eventId||'')+' '+(x.signalType||'')+' '+(x.serviceName||'')+' '+(x.operationName||''))});
    arr(d.deployments,'events').slice(0,20).forEach(function(x){add('Deployment '+(x.deploymentId||'deployment'),'Externally supplied deployment evidence record.',x,(x.deploymentId||'')+' '+(x.provider||'')+' '+(x.environment||''))});
    arr(d.contributors,'contributors').slice(0,20).forEach(function(x){add('Contributor '+(x.authorName||'Unknown author'),'Persisted Git author tuple and activity aggregation.',x,(x.authorName||'')+' '+(x.authorEmail||''))});
    var familyMax=Math.max(1,Math.max.apply(null,families.map(function(f){return f.items.length})));
    var familyCards=families.map(function(f){
      var count=f.items.length;
      var width=Math.max(3,Math.round((count/familyMax)*100));
      return '<div class="evidence-family"><div class="evidence-family-head"><div><b>'+esc(f.label)+'</b><small>'+esc(f.detail)+'</small></div><strong>'+n(count)+'</strong></div><div class="evidence-track"><span style="width:'+width+'%"></span></div><div class="evidence-family-foot"><span>loaded sample</span><span>'+((count===0)?'No records loaded':'Up to 20 records indexed')+'</span></div></div>';
    }).join('');
    var rows=items.map(function(x){return '<div class="evidence-row" data-search="'+esc(x.search)+'"><div><strong>'+esc(x.label)+'</strong><small>'+esc(x.basis)+'</small></div>'+inspectButton(x.label,x.basis,x.payload)+'</div>'}).join('');
    return shell('Evidence explorer','Inspect the structured records behind the product views. This is the direct path from a visual signal back to its persisted evidence payload.')+
      '<div class="evidence-overview card"><div class="arch-title"><div><h3>Evidence index</h3><div class="sub">A bounded map of the evidence families currently loaded into this workspace.</div></div><span class="tag">'+n(items.length)+' inspectable records</span></div><div class="evidence-families">'+familyCards+'</div><div class="evidence-boundary"><span>BOUNDARY</span><strong>Counts describe the loaded UI sample, not repository totals.</strong><small>Open a dedicated view for full pagination, API-level totals and filters.</small></div></div>'+
      '<div class="card"><input id="evidenceSearch" class="search" aria-label="Filter evidence records" placeholder="Filter commits, paths, runtime, deployments, tests, migrations…" autocomplete="off" spellcheck="false"><div class="sub" style="margin-top:8px">Search stays local to records already loaded into this snapshot; it never triggers extra API traffic.</div><div id="evidenceList" class="evidence-list">'+rows+'</div><div id="evidenceEmpty" class="empty evidence-empty" hidden>No evidence matches this filter.</div></div>';
  }
    function interview(){var stories=S.data.interview,a=S.analysis||{},current=!!(stories&&currentAnalysisSnapshot()&&stories.analysisRunId===S.runId&&a.status==='completed'),ready=currentAnalysisSnapshot()&&a.status==='completed';return shell('Interview stories','Evidence anchors for preparing truthful project explanations',ready?'<button class="btn" data-action="interview"'+(S.interviewLoading?' disabled aria-busy="true"':'')+'>'+(S.interviewLoading?'Loading…':(current?'Refresh stories':'Load stories'))+'</button>':'')+'<div id="stories" class="section">'+(current?storiesHtml(stories):'<div class="empty"><strong>Interview preparation requires current evidence</strong>Refresh analysis and regenerate the story scaffolds before using an older snapshot.</div>')+'</div>'}
  function storiesHtml(x){
    var q=x&&x.result&&x.result.stories||x&&x.stories||x&&x.result||[];
    if(!Array.isArray(q))q=Object.keys(q||{}).map(function(k){return Object.assign({title:k},q[k]||{})});
    var evidenceLinked=0,verificationNotes=0;
    q.forEach(function(s){if(Array.isArray(s.evidence)&&s.evidence.length)evidenceLinked++;if(s.verification&&(s.verification.ownership||s.verification.runtimeImpact))verificationNotes++});
    var storyRows=q.map(function(s){
      var a=s.draftAnswer||{},v=s.verification||{},ev=Array.isArray(s.evidence)?s.evidence:[];
      return '<article class="story"><div class="story-topline"><span class="tag">evidence-backed scaffold</span><span class="story-evidence-count">'+n(ev.length)+' refs</span></div><h3>'+esc(s.headline||s.title||s.name||'Interview story')+'</h3><div class="sub">'+esc(s.interviewQuestion||'Interview question unavailable.')+'</div><block><label>Context</label><div>'+esc(s.context||'—')+'</div></block><block><label>Situation</label><div>'+esc(a.situation||s.situation||'—')+'</div></block><block><label>Approach / evidence</label><div>'+esc(a.approach||s.action||s.actions||'—')+'</div></block><block><label>Evidence-backed result</label><div>'+esc(a.evidenceBackedResult||s.result||s.outcome||'—')+'</div></block><block><label>Verification</label><div>'+esc(v.ownership||'Ownership verification required.')+' '+esc(v.runtimeImpact||'Runtime impact verification required.')+'</div></block><div style="margin-top:11px">'+(ev.length?inspectButton("Inspect story evidence","Evidence references selected for this interview scaffold.",ev):'<span class="dim">No direct evidence references.</span>')+'</div></article>';
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
    if(!o){
      return shell('Operations','Live service health and queue telemetry for the running Autopsy API.','<button class="btn primary" data-action="operations-refresh">Check now</button>')+
        '<div class="card"><div class="empty"><strong>No operational snapshot loaded.</strong><span>Check the live service status without changing repository analysis state.</span></div></div>';
    }
    var q=o.analysisQueue||{},d=o.dependencies||{},db=d.database||{},redis=d.redis||{};
    var degraded=o.status!=='healthy',queueAvailable=q.waiting!=null||q.active!=null||q.failed!=null;
    var monitoring=S.operationalTimer?'Auto refresh active':'On-demand refresh';
    var dependencyLabel=degraded?'One or more checks need attention':'API, database and queue checks are healthy';
    return shell('Operations','Live service health and queue telemetry for the running Autopsy API.','<span class="pill '+fresh.tone+'">'+esc(fresh.label)+'</span><button class="btn primary" data-action="operations-refresh"'+(S.operationalLoading?' disabled aria-busy="true"':'')+'>'+(S.operationalLoading?'Checking…':'Refresh status')+'</button>')+
      '<div class="ops-posture card" aria-live="polite"><div class="arch-title"><div><h3>Operational posture</h3><div class="sub">A live service snapshot kept separate from repository analysis evidence.</div></div><span class="tag">'+esc(monitoring)+'</span></div><div class="ops-posture-grid"><div><span>SNAPSHOT</span><b>'+esc(date(o.timestamp))+'</b><small>last successful status payload</small></div><div><span>DEPENDENCIES</span><b>'+esc(dependencyLabel)+'</b><small>PostgreSQL and Redis probes are bounded</small></div><div><span>QUEUE</span><b>'+esc(queueAvailable?'Available':'Unavailable')+'</b><small>analysis counts are operational telemetry only</small></div><div><span>BOUNDARY</span><b>Runtime only</b><small>does not mutate or reinterpret persisted evidence</small></div></div></div>'+
      '<div class="grid g4">'+
        '<div class="card ops-health-card"><div class="ops-health-top"><span>SERVICE</span>'+operationalStatusPill(o.status)+'</div><div class="metric">'+esc(o.status||'unknown')+'</div><div class="metric-label">Service status</div><div class="sub">'+esc(o.service||'project-autopsy-api')+'</div></div>'+
        '<div class="card ops-health-card"><div class="ops-health-top"><span>DATABASE</span>'+operationalStatusPill(db.status)+'</div><div class="metric">'+esc(db.status||'unknown')+'</div><div class="metric-label">PostgreSQL</div><div class="sub">'+esc(ms(db.latencyMs))+' probe latency</div></div>'+
        '<div class="card ops-health-card"><div class="ops-health-top"><span>QUEUE STORE</span>'+operationalStatusPill(redis.status)+'</div><div class="metric">'+esc(redis.status||'unknown')+'</div><div class="metric-label">Redis</div><div class="sub">'+esc(ms(redis.latencyMs))+' probe latency</div></div>'+
        '<div class="card ops-health-card"><div class="ops-health-top"><span>BACKLOG</span><span class="tag">'+(q.failed==null?'queue unavailable':n(q.failed)+' failed retained')+'</span></div><div class="metric">'+(q.waiting==null?'—':n(q.waiting))+'</div><div class="metric-label">Waiting jobs</div><div class="sub">current BullMQ waiting count</div></div>'+
      '</div>'+
      (degraded?'<div class="callout section"><strong>Service is degraded.</strong><br>One or more live operational checks are unavailable. Repository evidence is unchanged; retry this status check after the service recovers.</div>':'')+
      '<div class="grid g2 section">'+
        '<div class="card"><div class="arch-title"><div><h3>Analysis queue</h3><div class="sub">Current BullMQ counts; these are live operational signals, not repository evidence.</div></div><span class="tag">'+esc(queueAvailable?'live counts':'unavailable')+'</span></div><div class="grid g2" style="margin-top:14px">'+
          metric('Waiting',q.waiting==null?'—':n(q.waiting))+
          metric('Active',q.active==null?'—':n(q.active))+
          metric('Delayed',q.delayed==null?'—':n(q.delayed))+
          metric('Failed retained',q.failed==null?'—':n(q.failed))+
          metric('Completed retained',q.completed==null?'—':n(q.completed))+
          metric('Paused',q.paused==null?'—':n(q.paused))+
          '</div></div>'+
        '<div class="card"><div class="arch-title"><div><h3>Process runtime</h3><div class="sub">Current API process measurements from the live service.</div></div><span class="tag">process scope</span></div><div class="grid g2" style="margin-top:14px">'+
          metric('Uptime',operationalUptime(o.process&&o.process.uptimeSeconds))+
          metric('Node.js',o.process&&o.process.nodeVersion||'—')+
          metric('RSS',o.process&&o.process.rssMb!=null?n(o.process.rssMb)+' MB':'—')+
          metric('Heap used',o.process&&o.process.heapUsedMb!=null?n(o.process.heapUsedMb)+' MB':'—')+
          '</div></div>'+
      '</div>'+
      '<div class="card section"><div class="arch-title"><div><h3>Operational snapshot</h3><div class="sub">Captured '+esc(date(o.timestamp))+' · status '+operationalStatusPill(o.status)+'</div></div><span class="tag">'+esc(fresh.label)+'</span></div><div class="ops-boundary"><span>WHAT THIS MEANS</span><strong>The workspace tells you how the running service is behaving at the time of the snapshot.</strong><small>It does not change, reinterpret or overwrite persisted repository evidence.</small></div></div>';
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
    var previous=S.view;
    if(previous)S.viewScroll[previous]=window.scrollY||0;
    S.view=v;
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
      if(q)q.oninput=function(){var term=q.value.trim().toLowerCase(),shown=0;document.querySelectorAll('.evidence-row').forEach(function(row){var ok=!term||(row.getAttribute('data-search')||'').indexOf(term)>=0;row.hidden=!ok;if(ok)shown++});var empty=$('evidenceEmpty');if(empty)empty.hidden=shown!==0}
    }
    if(v==='operations'&&!options.skipLoad&&S.data.operational===undefined)loadOperations();else if(!options.skipLoad&&VIEW_DATA[v]&&!hasViewData(v))loadViewData(v);
    syncOperationsMonitoring()
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
        $('root').innerHTML=errorPage('Engineering insights',e.message||'Insights could not be generated.','Try again','interpretation');
        toast(e.message,'bad');
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
    S.user=null;
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
  function workspace(){
    $('landing').hidden=true;
    $('workspace').hidden=false;
    $('repoName').textContent=S.repo&&S.repo.name||'Repository';
    $('repoBranch').textContent=(S.repo&&(S.repo.tracked_branch||S.repo.trackedBranch||S.repo.default_branch||S.repo.defaultBranch))||'branch unavailable';
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

  document.addEventListener('keydown',function(e){
    if(!$('confirmModal').hidden)trapFocus($('confirmModal'),e);else if(!$('authModal').hidden)trapFocus($('authModal'),e);else if(!$('modal').hidden)trapFocus($('modal'),e);else if(!$('drawer').hidden)trapFocus($('drawer'),e);
    var target=e.target;
    if(e.key==='/'&&$('viewSearch')&&target&&['INPUT','TEXTAREA','SELECT'].indexOf(target.tagName)<0&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
      e.preventDefault();$('viewSearch').focus();return;
    }
    if(e.key==='Escape'){
      if(!$('confirmModal').hidden){e.preventDefault();finishConfirm(false);return}
      if($('viewSearch')&&document.activeElement===$('viewSearch')&&$('viewSearch').value){
        e.preventDefault();$('viewSearch').value='';S.viewFilter[S.view]='';applyViewFilter();return;
      }
      if(!$('drawer').hidden)closeEvidence();else if(!$('modal').hidden)closeSettings();else if(!$('authModal').hidden)closeAuth()
    }
  });
  $('new').onclick=function(){stopOperationsMonitoring();S.workspaceToken+=1;S.commitLoadToken+=1;S.timelineLoading=false;S.timelineLoadToken+=1;S.analysisRunsLoading=false;S.analysisRunsLoadToken+=1;S.commitLoading=false;S.importing=false;S.refreshLoading=false;S.reportLoading=false;S.interviewLoading=false;S.interpretationLoading=false;S.provenanceLoading=false;clearInterval(S.timer);S.timer=null;S.runtimeLoading=false;S.historicalLoading=false;S.historicalLoadToken+=1;S.repoId='';S.runId='';S.repo=null;S.analysis=null;S.data={};S.dataRunId='';S.dataErrors=[];S.runtimeEvents=[];S.runtimePagination=null;S.historicalFilter={windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''};S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''};S.viewFilter={};S.tableSort={};S.viewLoading={};persist();landing()}
  $('nav').onclick=function(e){var b=e.target.closest('button[data-view]');if(b)setView(b.getAttribute('data-view'))};window.addEventListener('hashchange',function(){setView(viewFromHash(),{fromHash:true})});window.addEventListener('pageshow',function(){closeTransientOverlays()});document.addEventListener('visibilitychange',function(){syncOperationsMonitoring(!document.hidden)})
  $('root').onclick=function(e){var ev=e.target.closest('[data-evidence-id]');if(ev){e.preventDefault();openEvidence(ev.getAttribute('data-evidence-id'),ev);return}var pd=e.target.closest('[data-deployment-id]');if(pd){e.preventDefault();loadProvenance(pd.getAttribute('data-deployment-id'),pd);return}var a=e.target.closest('[data-action]');if(!a)return;if(a.getAttribute('data-action')==='report')loadReport();if(a.getAttribute('data-action')==='interview')loadInterview();if(a.getAttribute('data-action')==='interpretation')loadInterpretation();if(a.getAttribute('data-action')==='download')downloadReport();if(a.getAttribute('data-action')==='more-commits')loadMoreCommits();if(a.getAttribute('data-action')==='more-timeline')loadMoreTimeline();if(a.getAttribute('data-action')==='analysis-runs-more')loadMoreAnalysisRuns();if(a.getAttribute('data-action')==='reload-data')reloadData();if(a.getAttribute('data-action')==='reload-view')reloadCurrentView();if(a.getAttribute('data-action')==='runtime-filter')loadRuntimeEvents(true);if(a.getAttribute('data-action')==='runtime-clear-filter'){S.runtimeFilter={from:'',to:'',deploymentId:'',revisionSha:'',environment:'',operationName:'',signalType:''};['rtFrom','rtTo','rtDeployment','rtRevision','rtEnvironment','rtOperation'].forEach(function(id){if($(id))$(id).value=''});if($('rtSignal'))$('rtSignal').value='';loadRuntimeEvents(true)}if(a.getAttribute('data-action')==='runtime-more')loadRuntimeEvents(false);if(a.getAttribute('data-action')==='historical-filter')loadHistoricalRuntime();if(a.getAttribute('data-action')==='operations-refresh')loadOperations(true);if(a.getAttribute('data-action')==='operations-retry')loadOperations(true);if(a.getAttribute('data-action')==='historical-clear-filter'){S.historicalFilter={windowMinutes:60,minSamples:10,deploymentId:'',environment:'',operationName:'',signalType:''};['histWindow','histSamples','histDeployment','histEnvironment','histOperation'].forEach(function(id){if($(id))$(id).value=id==='histWindow'?60:id==='histSamples'?10:''});if($('histSignal'))$('histSignal').value='';loadHistoricalRuntime()}}
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
    $('authTitle').textContent=migrating?'Move your existing workspace':forgot?'Reset your password':reset?'Choose a new password':verify?'Verify your email':'Sign in to Project Autopsy';
    $('authSubtitle').textContent=migrating?'Your previous workspace uses a legacy access credential. Convert it to account-based access once; the credential is then removed from this browser.':S.authMode==='register'?'Your private engineering workspace starts with one account.':forgot?'We will send a one-time password reset link to your account email.':reset?'Choose a new password for your account.':verify?'Use the one-time link from your email to confirm this address.':'Use the account that owns your Autopsy repositories.';
    $('authSubmit').textContent=migrating?'Migrate & sign in':S.authMode==='register'?'Create account':'Sign in';
    $('authModeToggle').textContent=migrating?'Use normal sign in instead':S.authMode==='register'?'Already have an account? Sign in':(forgot||reset||verify)?'Back to sign in':'New here? Create an account';
    $('authModeToggle').hidden=!(standard||forgot);
    $('authForgotLink').hidden=S.authMode!=='login';
    $('resendVerification').hidden=!['login','register'].includes(S.authMode);
    $('authPassword').setAttribute('autocomplete',S.authMode==='register'?'new-password':'current-password');
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
      S.connectionState='unknown';
      connected('unknown');
      landing();
      if(S.legacyMigrationKey)openAuth('migrate');
    }
  }
  boot()
})();
