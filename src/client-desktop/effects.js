import * as THREE from 'three';

// Bounded pools keep celebrations cheap even on integrated graphics.
export class Effects {
 constructor(scene){
  this.kick=0;this.particles=[];this.trail=[];
  this.positions=new Float32Array(384*3);this.colors=new Float32Array(384*3);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3));geometry.setDrawRange(0,0);
  this.points=new THREE.Points(geometry,new THREE.PointsMaterial({size:.24,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));this.points.frustumCulled=false;scene.add(this.points);
  this.line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffedb3,transparent:true,opacity:.75,depthWrite:false}));scene.add(this.line);
  this.rings=[];this.scene=scene;
 }
 burst(p,color,count=30,speed=5){
  const c=new THREE.Color(color);
  for(let i=0;i<count;i++){if(this.particles.length>=384)this.particles.shift();const a=Math.random()*Math.PI*2,v=(.3+Math.random()*.7)*speed;this.particles.push({x:p.x,y:Math.max(.2,p.y??.2),z:p.z,vx:Math.cos(a)*v,vy:2+Math.random()*speed,vz:Math.sin(a)*v,life:1+Math.random(),c});}
  const ring=new THREE.Mesh(new THREE.RingGeometry(.8,1,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(p.x,.12,p.z);this.scene.add(ring);this.rings.push({mesh:ring,life:1});
 }
 celebrate(p){for(const c of [0xffd56e,0xff987e,0xb9efae,0xffffff])this.burst({...p,y:2},c,55,8);}
 clear(){this.trail=[];this.particles=[];for(const r of this.rings){this.scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();}this.rings=[];}
 update(dt,ball,flying){
  this.kick=Math.max(0,this.kick-dt*1.5);
  this.particles=this.particles.filter(p=>(p.life-=dt)>0);
  this.particles.forEach((p,i)=>{p.vy-=9*dt;p.x+=p.vx*dt;p.y=Math.max(.1,p.y+p.vy*dt);p.z+=p.vz*dt;this.positions.set([p.x,p.y,p.z],i*3);this.colors.set([p.c.r,p.c.g,p.c.b],i*3);});
  this.points.geometry.setDrawRange(0,this.particles.length);this.points.geometry.attributes.position.needsUpdate=true;this.points.geometry.attributes.color.needsUpdate=true;
  if(flying){this.trail.push(new THREE.Vector3(ball.x,ball.y+.05,ball.z));if(this.trail.length>38)this.trail.shift();}else if(this.trail.length)this.trail.shift();
  this.line.geometry.dispose();this.line.geometry=new THREE.BufferGeometry().setFromPoints(this.trail);this.line.visible=this.trail.length>1;
  for(const r of this.rings){r.life-=dt;r.mesh.scale.setScalar(1+(1-r.life)*8);r.mesh.material.opacity=Math.max(0,r.life*.65);}
  this.rings=this.rings.filter(r=>{if(r.life>0)return true;this.scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();return false;});
 }
}
