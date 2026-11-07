import {createMatch,mutateMatch,publicMatch,token} from '../src/server/multiplayer.js';
import QRCode from 'qrcode';
import {randomBytes} from 'node:crypto';
const CAS="local current=redis.call('GET',KEYS[1]); if (not current and ARGV[1]=='') or current==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',7200);return 1 end;return 0";
async function redis(command){const url=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,t=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;if(!url||!t)throw Error('The clubhouse is temporarily unavailable.');const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(8000)});const result=await res.json();if(!res.ok||result.error)throw Error('The clubhouse is busy. Please retry.');return result.result;}
export const store={get:key=>redis(['GET',key]),save:(key,before,after)=>redis(['EVAL',CAS,1,key,before??'',after])};
export function makeHandler(storage=store){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST required'});
 try{
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({ok:false,error:'Origin not allowed'});
  const a=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!a||JSON.stringify(a).length>4000)throw Error('Invalid request.');
  if(a.op==='create'){
   for(let i=0;i<5;i++){const alphabet='ABCDEFGHJKMNPQRSTUVWXYZ23456789',code=Array.from(randomBytes(4),n=>alphabet[n%alphabet.length]).join(''),hostToken=token(),r=createMatch(code,hostToken,a.mode,Date.now(),a.game);
    if(await storage.save('pvp:'+code,null,JSON.stringify(r))){const base=`${req.headers.host?.startsWith('localhost')?'http':'https'}://${req.headers.host}`,joinUrl=`${base}/pvp/controller?code=${code}`,viewUrl=`${base}/pvp?code=${code}`;return res.json({ok:true,hostToken,match:publicMatch(r,Date.now()),joinUrl,viewUrl,qrSvg:await QRCode.toString(joinUrl,{type:'svg',margin:1})});}
   }throw Error('Please try again.');
  }
  if(!/^[A-Z2-9]{4}$/.test(a.code??''))throw Error('Enter the four-character lobby code.');
  for(let i=0;i<10;i++){
   const key='pvp:'+a.code,raw=await storage.get(key);if(!raw)throw Error('Lobby not found or expired. Ask the host for a new code.');
   const r=JSON.parse(raw),now=Date.now(),extra=mutateMatch(r,a,now);
   // Reads are the hot path at 5-10 Hz per phone. If a poll changed nothing,
   // skip the compare-and-swap entirely so it cannot collide with a shot write.
   if((a.op==='read'||a.op==='view')&&JSON.stringify(r)===raw)return res.json({ok:true,...extra,match:publicMatch(r,now,a.sinceShot)});
   r.revision++;
   if(await storage.save(key,raw,JSON.stringify(r)))return res.json({ok:true,...extra,match:publicMatch(r,now,a.sinceShot)});
  }throw Error('The lobby is busy. Please try again.');
 }catch(error){res.status(400).json({ok:false,error:error.message});}
};}
export default makeHandler();
