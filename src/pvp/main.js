import {MatchClient,$,escape} from './client.js';
import {createView} from './view.js';
import {HOLES} from '/shared/golf.js';
let host=null,match=null,links=null,noticeTimer;
const view=createView($('view'));
function notice(message){$('notice').textContent=message;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',7000);}
const client=new MatchClient(render,notice);
function playerRows(players,manage=false){return players.map(p=>`<div class="roster-row"><i class="dot" style="background:${p.color}"></i><span class="grow">${escape(p.name)}<small>${p.forfeit?'Forfeited':!p.connected?'Disconnected':p.ready?'Ready':'Getting ready'}</small></span>${manage?`<button class="secondary" data-remove="${p.id}">Remove</button>`:''}</div>`).join('')||'<p class="note">The first tee is waiting. Scan the QR code with each phone.</p>';}
function removeButtons(container){container.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const p=match.players.find(p=>p.id===Number(b.dataset.remove));if(confirm(`Remove ${p.name}${match.phase==='lobby'?' from the lobby':' and forfeit their remaining holes'}?`))client.action({op:'remove',playerId:p.id});});}
function render(m){
 match=m;view.update(m);const lobby=m.phase==='lobby';$('welcome').hidden=true;$('room').hidden=!lobby;$('clubhouse').hidden=!lobby;$('matchhud').hidden=lobby;
 $('roomcode').textContent=m.code;$('count').textContent=`${m.players.length} / 4`;$('roster').innerHTML=playerRows(m.players,!!host);removeButtons($('roster'));
 $('roomtitle').textContent=host?'Your lobby is open':'You’re watching this lobby';$('startmatch').hidden=!host;$('startmatch').disabled=m.players.length<2||m.players.some(p=>!p.ready||!p.connected);$('starthelp').textContent=host?'At least two golfers must be connected and ready.':'The host starts when everyone is ready.';
 $('layoutlabel').textContent=m.mode==='multi'?'Multiple screens · share this room with your friends':'One shared screen · everyone watches here';$('screenlinkbox').hidden=m.mode!=='multi';
 const joinUrl=links?.joinUrl??`${location.origin}/pvp/controller?code=${m.code}`,viewUrl=links?.viewUrl??`${location.origin}/pvp?code=${m.code}`;$('phonelink').href=joinUrl;$('phonelink').textContent='Join on your phone ↗';$('screenlink').href=viewUrl;$('screenlink').textContent=viewUrl;if(links?.qrSvg)$('qr').innerHTML=links.qrSvg;
 const h=HOLES[m.hole],p=m.players.find(p=>p.id===m.turn);$('hole').textContent=`Hole ${m.hole+1} / ${HOLES.length} · Par ${h.par}`;$('course').textContent=h.name;
 $('turn').textContent=m.phase==='finished'?winner(m):m.phase==='hole-complete'?'Hole complete':p?`${p.name}’s turn`:'Waiting';$('turnhint').textContent=m.phase==='flight'?'Ball in play':m.phase==='ready'?'Aim, hold, swing, release':m.phase==='finished'?'Lowest total score wins':'Everyone has finished this hole.';
 $('leaderboard').innerHTML='<div class="eyebrow">Match scorecard</div>'+m.players.map(p=>`<div class="score-line ${p.id===m.turn?'current':''}"><span><i class="dot" style="background:${p.color}"></i> ${escape(p.name)}${p.forfeit?' · DNF':''}</span><span>${p.total+(p.done?0:p.strokes)} strokes</span></div><small>${p.scores.map((n,i)=>`H${i+1}: ${n}`).join(' · ')||'First hole'}</small>`).join('');
 $('wind').textContent=h.wind?`${h.wind>0?'→':'←'} ${Math.abs(h.wind)} crosswind`:'Calm wind';$('nextHole').hidden=!host||m.phase!=='hole-complete';$('returnlobby').hidden=!host||m.phase!=='finished';$('manage').hidden=!host;$('manageplayers').innerHTML=playerRows(m.players,!!host);removeButtons($('manageplayers'));
}
function winner(m){const ranked=m.players.filter(p=>!p.forfeit).sort((a,b)=>a.total-b.total);if(!ranked.length)return 'Match complete';const tied=ranked.filter(p=>p.total===ranked[0].total);return tied.length>1?`Tie: ${tied.map(p=>p.name).join(' & ')}`:`${ranked[0].name} wins!`;}
async function create(){const r=await client.action({op:'create',mode:$('mode').value});if(!r)return;host=r.hostToken;links=r;sessionStorage.setItem('fairway.pvp.host',JSON.stringify({code:r.match.code,token:host,links:r}));history.replaceState(null,'',`/pvp?code=${r.match.code}`);client.start({code:r.match.code,token:host});render(r.match);}
async function joinScreen(code){const r=await client.action({op:'view',code});if(r){client.start({code},true);history.replaceState(null,'',`/pvp?code=${code}`);}}
$('create').onclick=create;$('joinscreen').onclick=()=>joinScreen($('viewcode').value.trim().toUpperCase());$('startmatch').onclick=()=>client.action({op:'start'});$('nextHole').onclick=()=>client.action({op:'next'});$('returnlobby').onclick=()=>client.action({op:'rematch'});$('manage').onclick=()=>$('managepanel').classList.remove('hidden');$('closemanage').onclick=()=>$('managepanel').classList.add('hidden');
const code=new URLSearchParams(location.search).get('code');let saved;try{saved=JSON.parse(sessionStorage.getItem('fairway.pvp.host'));}catch{}
if(code){if(saved?.code===code){host=saved.token;links=saved.links;client.start({code,token:host});}else joinScreen(code);}
window.__pvp={get match(){return match;},client,view};
