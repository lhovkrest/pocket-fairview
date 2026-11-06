import {randomBytes} from 'node:crypto';
import QRCode from 'qrcode';

// Every room mutation is atomic across Vercel instances. Tokens never leave
// their owning client; only the public code and sanitized events are shared.
const script=`
local raw=redis.call('GET',KEYS[1])
local a=cjson.decode(ARGV[1])
if a.op=='create' then
 if raw then return cjson.encode({ok=false,message='Code collision'}) end
 redis.call('SET',KEYS[1],cjson.encode(a.room),'EX',7200)
 return cjson.encode({ok=true})
end
if not raw then return cjson.encode({ok=false,message='Room expired. Refresh the big screen.'}) end
local r=cjson.decode(raw)
if a.op=='join' then
 if r.player and r.player~=a.token then return cjson.encode({ok=false,message='This room already has a golfer.'}) end
 r.player=a.token;r.phoneSeen=a.now
elseif a.role=='host' then
 if r.host~=a.token then return cjson.encode({ok=false,message='Invalid host session'}) end
 r.hostSeen=a.now
 if a.hud then r.hud=a.hud;r.version=r.version+1 end
elseif a.role=='phone' then
 if r.player~=a.token then return cjson.encode({ok=false,message='Invalid controller session'}) end
 r.phoneSeen=a.now
 for _,e in ipairs(a.events or {}) do
  if e.id>r.lastCommand then
   r.lastCommand=e.id;r.sequence=r.sequence+1
   table.insert(r.events,{seq=r.sequence,ev=e.ev,data=e.data,at=a.now})
   if #r.events>128 then table.remove(r.events,1) end
  end
 end
else return cjson.encode({ok=false,message='Invalid operation'}) end
local events={}
if a.role=='host' then for _,e in ipairs(r.events) do if e.seq>(a.cursor or 0) then table.insert(events,e) end end end
redis.call('SET',KEYS[1],cjson.encode(r),'EX',7200)
return cjson.encode({ok=true,events=events,sequence=r.sequence,now=a.now,hud=r.hud,version=r.version,hostOnline=a.now-r.hostSeen<20000,phoneOnline=r.player~=nil and a.now-r.phoneSeen<20000})
`;
async function redis(command){
 const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
 const token=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
 if(!url||!token)throw Error('Phone pairing is being set up. PC practice is available.');
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(7000)});
 const result=await response.json();if(!response.ok||result.error)throw Error('Clubhouse temporarily unavailable. Please retry.');return result.result;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,message:'POST required'});
 if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({ok:false,message:'Origin not allowed'});
 try{
  let a=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!a||JSON.stringify(a).length>12000)return res.status(400).json({ok:false,message:'Invalid request'});
  const now=Date.now();
  if(a.op==='create'){
   const alphabet='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
   for(let attempt=0;attempt<5;attempt++){
    const code=Array.from(randomBytes(4),n=>alphabet[n%alphabet.length]).join(''),hostToken=randomBytes(24).toString('hex');
    const room={host:hostToken,hostSeen:now,phoneSeen:0,events:[],sequence:0,lastCommand:0,version:0,hud:{state:'lobby'}};
    const result=JSON.parse(await redis(['EVAL',script,1,'fairway:'+code,JSON.stringify({op:'create',room})]));
    if(result.ok){const joinUrl=`https://${req.headers.host}/controller?code=${code}`;return res.json({ok:true,code,hostToken,joinUrl,qrSvg:await QRCode.toString(joinUrl,{type:'svg',margin:1})});}
   }throw Error('Please try creating the room again.');
  }
  if(!/^[A-Z2-9]{4}$/.test(a.code??'')||!['join','poll'].includes(a.op))return res.status(400).json({ok:false,message:'Invalid room request'});
  if((a.op==='poll'||a.token)&&!/^[a-f0-9]{48}$/.test(a.token??''))return res.status(400).json({ok:false,message:'Invalid session'});
  const token=a.op==='join'?(a.token||randomBytes(24).toString('hex')):a.token;
  const events=(Array.isArray(a.events)?a.events:[]).slice(0,32).filter(e=>Number.isSafeInteger(e.id)&&['trigger','ctrl:start','ctrl:config'].includes(e.ev)).map(e=>({id:e.id,ev:e.ev,data:e.data??{}}));
  const result=JSON.parse(await redis(['EVAL',script,1,'fairway:'+a.code,JSON.stringify({op:a.op,role:a.role,token,now,cursor:Number(a.cursor)||0,hud:a.role==='host'&&a.hud&&typeof a.hud==='object'?a.hud:undefined,events})]));
  if(a.op==='join'&&result.ok)Object.assign(result,{token,slot:0,code:a.code,name:'Golfer'});
  res.status(result.ok?200:400).json(result);
 }catch(error){res.status(503).json({ok:false,message:error.message});}
}
