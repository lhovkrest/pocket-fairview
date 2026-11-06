import {mkdir,cp,readFile,writeFile} from 'node:fs/promises';
await mkdir('dist/solo',{recursive:true});
for(const [from,to] of [['src/client-desktop','desktop'],['src/client-mobile','controller/assets'],['src/shared','shared'],['src/styles','styles'],['node_modules/three/build','vendor/three/build'],['src/pvp','pvp']])await cp(from,'dist/'+to,{recursive:true});
for(const [from,to] of [['src/client-desktop/index.html','dist/solo/index.html'],['src/client-mobile/index.html','dist/controller/index.html']]){
 const html=(await readFile(from,'utf8')).replace('<script src="/socket.io/socket.io.js"></script>','<script>window.GOLF_CLOUD=true;</script>');await writeFile(to,html);
}
console.log('Built public golf game');

await cp('src/pvp/index.html','dist/index.html');
