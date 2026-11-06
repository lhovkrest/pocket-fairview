import {MatchClient,$,escape} from './client.js';
import {createView} from './view.js';
import {createHoopsView} from './hoops-view.js';
import {HOLES} from '/shared/golf.js';
import {HOOPS_SPOTS,HOOP_SHOTS,hoopDistance,hoopsShotLabel} from '/shared/hoops.js';
let host=null,match=null,links=null,noticeTimer,gameChoice='golf',view=null,viewGame=null,bannerTimer=null,lastBanner=null;
function notice(message){$('notice').textContent=message;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',7000);}
const client=new MatchClient(render,notice);

// A canvas can only feed one WebGL renderer at a time, so swapping games
// replaces the canvas and disposes the previous arena.
function setView(game){
 if(viewGame===game&&view)return;
 viewGame=game;
 view?.destroy();
 const old=$('view'),fresh=old.cloneNode(false);
 old.replaceWith(fresh);
 view=game==='hoops'?createHoopsView(fresh):createView(fresh);
}
setView('golf');

function playerRows(players,manage=false){return players.map(p=>`<div class="roster-row"><i class="dot" style="background:${p.color}"></i><span class="grow">${escape(p.name)}<small>${p.forfeit?(match?.game==='hoops'?'Sat out':'Forfeited'):!p.connected?'Disconnected':p.ready?'Ready':'Getting ready'}</small></span>${manage?`<button class="secondary" data-remove="${p.id}">Remove</button>`:''}</div>`).join('')||'<p class="note">The tip-off is waiting. Scan the QR code with each phone.</p>';}
function removeButtons(container){container.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const p=match.players.find(p=>p.id===Number(b.dataset.remove));const tail=match.phase==='lobby'?' from the lobby':match.game==='hoops'?' and forfeit their remaining shots':' and forfeit their remaining holes';if(confirm(`Remove ${p.name}${tail}?`))client.action({op:'remove',playerId:p.id});});}
function showBanner(m){
 if(!m.last||m.last.id===lastBanner)return;
 lastBanner=m.last.id;
 const p=m.players.find(p=>p.id===m.last.player);
 const made=m.last.result==='made';
 $('shotbanner').innerHTML=`<strong>${escape(p?.name??'Player')}</strong> ${made?`<span class="made">+${m.last.points}</span>`:''} · ${escape(hoopsShotLabel(m.last))}`;
 $('shotbanner').classList.add('show');
 clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>$('shotbanner').classList.remove('show'),2800);
}
function render(m){
 match=m;setView(m.game==='hoops'?'hoops':'golf');view.update(m);
 const lobby=m.phase==='lobby',hoops=m.game==='hoops';
 $('welcome').hidden=true;$('room').hidden=!lobby;$('clubhouse').hidden=!lobby;$('matchhud').hidden=lobby;
 $('roomcode').textContent=m.code;$('count').textContent=`${m.players.length} / 4`;$('roster').innerHTML=playerRows(m.players,!!host);removeButtons($('roster'));
 $('roomtitle').textContent=host?(hoops?'Your tip-off lobby is open':'Your tee-off lobby is open'):'You’re watching this lobby';
 $('startmatch').hidden=!host;$('startmatch').textContent=hoops?'Tip off ↗':'Start match ↗';$('startmatch').disabled=m.players.length<2||m.players.some(p=>!p.ready||!p.connected);
 $('starthelp').textContent=host?'At least two connected players must be ready.':'The host starts when everyone is ready.';
 $('layoutlabel').textContent=m.mode==='multi'?'Multiple screens · share this room with your friends':'One shared screen · everyone watches here';$('screenlinkbox').hidden=m.mode!=='multi';
 $('gamenametitle').textContent=hoops?'Pocket Hoops':'Pocket Fairway';
 $('gamerule').textContent=hoops?'Five shots from five spots. Highest total score wins — power is everything.':'Six holes across the meadow. Lowest total strokes wins.';
 $('lobbygames').querySelectorAll('[data-lobby-game]').forEach(b=>{b.classList.toggle('selected',b.dataset.lobbyGame===m.game);b.disabled=!host||!lobby;});
 $('roomhint').textContent=hoops?'Scan with each phone, tap Ready, then hold and flick to shoot.':'Scan with each phone, enter a name, then tap Ready.';
 $('manage').textContent=hoops?'Manage players':'Manage golfers';
 const joinUrl=links?.joinUrl??`${location.origin}/pvp/controller?code=${m.code}`,viewUrl=links?.viewUrl??`${location.origin}/pvp?code=${m.code}`;$('phonelink').href=joinUrl;$('phonelink').textContent='Join on your phone ↗';$('screenlink').href=viewUrl;$('screenlink').textContent=viewUrl;if(links?.qrSvg)$('qr').innerHTML=links.qrSvg;
 const current=m.players.find(p=>p.id===m.turn);
 $('netstatus').textContent=client.online?(client.latency?`Live · ${Math.round(client.latency)} ms`:'Live'):'Reconnecting…';
 $('netstatus').classList.toggle('offline',!client.online);
 if(hoops){
  const spot=HOOPS_SPOTS[Math.min(m.hole??0,HOOPS_SPOTS.length-1)];
  $('hole').textContent=m.phase==='lobby'?`${HOOP_SHOTS} shots · first to the buzzer`:`Shot ${Math.min(m.hole+1,HOOP_SHOTS)} / ${HOOP_SHOTS} · ${spot.points} points`;
  $('course').textContent=spot.name;
  $('turn').textContent=m.phase==='finished'?winner(m):m.phase==='flight'?'Ball in the air':current?`${current.name} shooting`:'Waiting';
  $('turnhint').textContent=m.phase==='flight'?'':m.phase==='ready'?'Hold · flick the phone up · release':m.phase==='finished'?'Highest total score wins':'Everyone shoots once from each spot.';
  $('wind').textContent=`${Math.round(hoopDistance(spot)*10)/10} m · ${spot.points} pts`;
  $('leaderboard').innerHTML='<div class="eyebrow">Shootout scoreboard</div>'+m.players.map(p=>`<div class="score-line ${p.id===m.turn?'current':''}"><span><i class="dot" style="background:${p.color}"></i> ${escape(p.name)}${p.forfeit?' · DNF':''}</span><span>${p.hscore??0} pts</span></div><small>${(p.hshots??[]).map((n,i)=>`S${i+1}: ${n??'–'}`).join(' · ')||'No shots yet'}</small>`).join('');
  $('nextHole').hidden=true;$('returnlobby').hidden=!host||m.phase!=='finished';$('manage').hidden=!host;$('manageplayers').innerHTML=playerRows(m.players,!!host);removeButtons($('manageplayers'));
  showBanner(m);
 }else{
  const h=HOLES[m.hole],p=current;
  $('hole').textContent=`Hole ${m.hole+1} / ${HOLES.length} · Par ${h.par}`;$('course').textContent=h.name;
  $('turn').textContent=m.phase==='finished'?winner(m):m.phase==='hole-complete'?'Hole complete':p?`${p.name}’s turn`:'Waiting';
  $('turnhint').textContent=m.phase==='flight'?'Ball in play':m.phase==='ready'?'Aim, hold, swing, release':m.phase==='finished'?'Lowest total score wins':'Everyone has finished this hole.';
  $('leaderboard').innerHTML='<div class="eyebrow">Match scorecard</div>'+m.players.map(p=>`<div class="score-line ${p.id===m.turn?'current':''}"><span><i class="dot" style="background:${p.color}"></i> ${escape(p.name)}${p.forfeit?' · DNF':''}</span><span>${p.total+(p.done?0:p.strokes)} strokes</span></div><small>${p.scores.map((n,i)=>`H${i+1}: ${n}`).join(' · ')||'First hole'}</small>`).join('');
  $('wind').textContent=h.wind?`${h.wind>0?'→':'←'} ${Math.abs(h.wind)} crosswind`:'Calm wind';
  $('nextHole').hidden=!host||m.phase!=='hole-complete';$('returnlobby').hidden=!host||m.phase!=='finished';$('manage').hidden=!host;$('manageplayers').innerHTML=playerRows(m.players,!!host);removeButtons($('manageplayers'));
 }
}
function winner(m){
 if(m.game==='hoops'){
  const ranked=m.players.filter(p=>!p.forfeit).sort((a,b)=>(b.hscore??0)-(a.hscore??0));
  if(!ranked.length)return 'Game complete';
  const top=ranked[0].hscore??0,tied=ranked.filter(p=>(p.hscore??0)===top);
  return tied.length>1?`Tie game: ${tied.map(p=>p.name).join(' & ')}`:`${ranked[0].name} wins with ${top} points!`;
 }
 const ranked=m.players.filter(p=>!p.forfeit).sort((a,b)=>a.total-b.total);if(!ranked.length)return 'Match complete';const tied=ranked.filter(p=>p.total===ranked[0].total);return tied.length>1?`Tie: ${tied.map(p=>p.name).join(' & ')}`:`${ranked[0].name} wins!`;
}
async function create(){const r=await client.action({op:'create',mode:$('mode').value,game:gameChoice});if(!r)return;host=r.hostToken;links=r;sessionStorage.setItem('fairway.pvp.host',JSON.stringify({code:r.match.code,token:host,links:r}));history.replaceState(null,'',`/pvp?code=${r.match.code}`);client.start({code:r.match.code,token:host});render(r.match);}
async function joinScreen(code){const r=await client.action({op:'view',code});if(r){client.start({code},true);history.replaceState(null,'',`/pvp?code=${code}`);}}
function pickGame(game){gameChoice=game;$('gamepicker').querySelectorAll('[data-game]').forEach(b=>b.classList.toggle('selected',b.dataset.game===game));}
$('gamepicker').querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>pickGame(b.dataset.game));
$('lobbygames').querySelectorAll('[data-lobby-game]').forEach(b=>b.onclick=()=>{if(!host||match?.phase!=='lobby')return;client.action({op:'settings',game:b.dataset.lobbyGame,mode:match.mode});});
$('create').onclick=create;$('joinscreen').onclick=()=>joinScreen($('viewcode').value.trim().toUpperCase());$('startmatch').onclick=()=>client.action({op:'start'});$('nextHole').onclick=()=>client.action({op:'next'});$('returnlobby').onclick=()=>client.action({op:'rematch'});$('manage').onclick=()=>$('managepanel').classList.remove('hidden');$('closemanage').onclick=()=>$('managepanel').classList.add('hidden');
const code=new URLSearchParams(location.search).get('code');let saved;try{saved=JSON.parse(sessionStorage.getItem('fairway.pvp.host'));}catch{}
if(code){if(saved?.code===code){host=saved.token;links=saved.links;client.start({code,token:host});}else joinScreen(code);}
window.__pvp={get match(){return match;},client,get view(){return view;},pickGame};
