/* Local public catalogue + image-bound TAN footprints. No private TV data. */
(()=>{'use strict';
const host=document.querySelector('[data-sky]');if(!host)return;
const canvas=host.querySelector('canvas'),ctx=canvas.getContext('2d'),caption=host.querySelector('[data-caption]'),button=host.querySelector('[data-pause]');if(!ctx){if(button)button.disabled=true;return;}
const rad=Math.PI/180,unit=p=>{const r=p[0]*rad,d=p[1]*rad;return [Math.cos(d)*Math.cos(r),Math.cos(d)*Math.sin(r),Math.sin(d)];},dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),add=(a,b,t=1)=>a.map((v,i)=>v+t*b[i]),scale=(a,t)=>a.map(v=>v*t),norm=a=>scale(a,1/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);},mix=(a,b,t)=>a+(b-a)*t;
function spherical(a,b,t){const angle=Math.acos(Math.max(-1,Math.min(1,dot(a,b))));if(angle<1e-5)return a;return norm(add(scale(a,Math.sin((1-t)*angle)),scale(b,Math.sin(t*angle))));}
const motion=matchMedia('(prefers-reduced-motion: reduce)'),connection=navigator.connection,still=()=>motion.matches||connection?.saveData||['slow-2g','2g','3g'].includes(connection?.effectiveType);
let data=null,photos=[],markers=[],index=0,current=null,next=null,raf=0,last=0,elapsed=0,paused=false,visible=true,dead=false,dismissed=false;
let camera=unit([280,20]),origin=camera,width=1,height=1,frames=0;
function halt(){cancelAnimationFrame(raf);raf=0;last=0;}
function dismiss(){dismissed=true;halt();}
function resume(){if(!dead&&!dismissed&&!paused&&visible&&!document.hidden&&data&&!still()&&!raf)raf=requestAnimationFrame(draw);}
function imageAt(i){if(!photos.length)return null;const image=new Image();image.decoding='async';image.src=photos[i].src;return image;}
function chooseNext(){if(photos.length<2)return index;let best=(index+1)%photos.length;for(let j=1;j<photos.length;j++){const candidate=(index+j)%photos.length;if(dot(photos[index].centre,photos[candidate].centre)<Math.cos(50*rad)){best=candidate;break;}}return best;}
let nextIndex=0;
function select(i,loaded=null){index=i;current=loaded||imageAt(index);nextIndex=chooseNext();next=nextIndex===index?null:imageAt(nextIndex);}
function prepare(p){const f=p.footprint,c=unit(f.centre_deg),corners=f.corners_deg.map(unit).map(v=>scale(v,1/dot(v,c))),right=add(corners[1],scale(corners[0],-1)),down=add(corners[3],scale(corners[0],-1));return {...p,centre:c,corners,up:norm(scale(down,-1)),fieldW:Math.hypot(...right),fieldH:Math.hypot(...down)};}
function triangle(image,a,b,c,uvA,uvB,uvC){
 const [x0,y0]=uvA,[x1,y1]=uvB,[x2,y2]=uvC,det=x0*(y1-y2)+x1*(y2-y0)+x2*(y0-y1);if(Math.abs(det)<1e-9)return;
 const coeff=(v0,v1,v2)=>[(v0*(y1-y2)+v1*(y2-y0)+v2*(y0-y1))/det,(v0*(x2-x1)+v1*(x0-x2)+v2*(x1-x0))/det,(v0*(x1*y2-x2*y1)+v1*(x2*y0-x0*y2)+v2*(x0*y1-x1*y0))/det];
 const x=coeff(a[0],b[0],c[0]),y=coeff(a[1],b[1],c[1]);ctx.save();ctx.beginPath();const centre=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3],edge=p=>{const dx=p[0]-centre[0],dy=p[1]-centre[1],n=Math.hypot(dx,dy)||1;return [p[0]+dx/n*.6,p[1]+dy/n*.6];};ctx.moveTo(...edge(a));ctx.lineTo(...edge(b));ctx.lineTo(...edge(c));ctx.closePath();ctx.clip();ctx.transform(x[0],y[0],x[1],y[1],x[2],y[2]);ctx.drawImage(image,0,0);ctx.restore();
}
function drawImage(item,image,project){if(!image?.complete||!image.naturalWidth)return;const [a,b,,d]=item.corners,ab=add(b,scale(a,-1)),ad=add(d,scale(a,-1)),steps=4;
 const projected=item.corners.map(project);
 if(projected.every(Boolean)){
  const [p,q,r,s]=projected;
  if(Math.hypot(p[0]+r[0]-q[0]-s[0],p[1]+r[1]-q[1]-s[1])<.25){
   ctx.save();ctx.transform((q[0]-p[0])/image.naturalWidth,(q[1]-p[1])/image.naturalWidth,(s[0]-p[0])/image.naturalHeight,(s[1]-p[1])/image.naturalHeight,p[0],p[1]);ctx.drawImage(image,0,0);ctx.restore();return;
  }
 }
 const point=(u,v)=>project(norm(add(add(a,ab,u),ad,v)));
 for(let y=0;y<steps;y++)for(let x=0;x<steps;x++){const u=x/steps,v=y/steps,U=(x+1)/steps,V=(y+1)/steps,p=[point(u,v),point(U,v),point(U,V),point(u,V)];if(p.some(q=>!q))continue;const uv=[[u,v],[U,v],[U,V],[u,V]].map(q=>[q[0]*image.naturalWidth,q[1]*image.naturalHeight]);triangle(image,p[0],p[1],p[2],uv[0],uv[1],uv[2]);triangle(image,p[0],p[2],p[3],uv[0],uv[2],uv[3]);}
}
function draw(time){raf=0;if(dead||dismissed||paused||!visible||document.hidden)return;
 if(last)elapsed+=Math.max(time-last,0);last=time;
 if(elapsed>=14000&&photos.length){origin=camera;elapsed=0;select(nextIndex,next);host.dataset.cycle=String(Number(host.dataset.cycle||0)+1);}
 const item=photos[index],t=elapsed/1000;
 let phase=t<2?'slew':t<5?'dive':t<10?'hold':'pullout',zoom=t<2?0:t<5?ease((t-2)/3):t<10?1:1-ease((t-10)/4);
 if(!item){phase='sky';zoom=0;}
 host.dataset.phase=phase;host.dataset.target=item?.name||'';
 camera=item?(t<2?spherical(origin,item.centre,ease(t/2)):item.centre):origin;
 width=host.clientWidth;height=host.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);
 if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);
 const north=norm(add([0,0,1],scale(camera,-camera[2]))),targetUp=item?item.up:north;
 // Rotate the camera continuously toward image-up while diving. The photo's
 // four corners still determine its parity; the camera never invents a flip.
 const east=norm(cross(north,camera)),roll=Math.atan2(dot(targetUp,east),dot(targetUp,north))*zoom;
 let up=add(scale(north,Math.cos(roll)),scale(east,Math.sin(roll)));
 const right=norm(cross(up,camera));up=norm(cross(camera,right));
 const cover=item?Math.min(item.fieldH,item.fieldW/(width/height))*.96:.8;
 const tangent=Math.exp(mix(Math.log(1.25),Math.log(cover/2),zoom)),focal=height/(2*tangent);
 const project=v=>{const z=dot(v,camera);if(z<=.03)return null;return [width/2+dot(v,right)/z*focal,height/2-dot(v,up)/z*focal];};
 ctx.fillStyle=`rgb(${Math.round(4*(1-zoom))},${Math.round(13*(1-zoom))},${Math.round(25*(1-zoom))})`;ctx.fillRect(0,0,width,height);
 function line(points,color,lineWidth){ctx.beginPath();let previous=null;for(const v of points){const p=project(v);if(!p||Math.abs(p[0])>width*4||Math.abs(p[1])>height*4){previous=null;continue;}if(previous&&Math.hypot(p[0]-previous[0],p[1]-previous[1])<width*.7)ctx.lineTo(...p);else ctx.moveTo(...p);previous=p;}ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();}
 if(zoom<.75){for(const ring of data.mw)line(ring,'#49698925',14);for(const l of data.lines)line(l,'#7b93ab45',.6);}
 for(const star of data.stars){const p=project(star.v);if(!p||p[0]<0||p[0]>width||p[1]<0||p[1]>height)continue;ctx.fillStyle=`rgba(230,237,247,${Math.max(.2,1-star.mag/8)*(1-zoom*.9)})`;ctx.beginPath();ctx.arc(...p,Math.max(.5,1.9-star.mag*.2),0,Math.PI*2);ctx.fill();}
 if(zoom<.65){
  ctx.font='11px sans-serif';ctx.fillStyle='#c6ae7e';ctx.strokeStyle='#c6ae7e88';
  const bounds=host.getBoundingClientRect(),occupied=[document.querySelector('.site-nav'),host.querySelector('.sky-hud')].filter(Boolean).map(e=>{const r=e.getBoundingClientRect();return [r.left-bounds.left-8,r.top-bounds.top-8,r.right-bounds.left+8,r.bottom-bounds.top+8];});
  ctx.save();ctx.globalAlpha=1-zoom/.65;
  for(const m of markers){const p=project(m.v);if(!p||p[0]<8||p[0]>width-8||p[1]<8||p[1]>height-8)continue;
   ctx.strokeRect(p[0]-2,p[1]-2,4,4);const box=[p[0]+5,p[1]-10,p[0]+ctx.measureText(m.name).width+13,p[1]+8];
   if(box[2]>width-8||occupied.some(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]))continue;
   occupied.push(box);ctx.fillText(m.name,p[0]+7,p[1]+3);
  }ctx.restore();
 }
 if(item){ctx.save();ctx.globalAlpha=width<600?ease((zoom-.35)/.55):1;drawImage(item,current,project);ctx.restore();}
 const text=phase==='hold'&&current?.naturalWidth?(item?.display_name||item?.name):'';if(caption.textContent!==text)caption.textContent=text;
 host.dataset.ready='true';frames++;host.dataset.frames=String(frames);raf=requestAnimationFrame(draw);
}
button?.addEventListener('click',e=>{e.stopPropagation();paused=!paused;button.querySelector('[data-pause-label]').textContent=paused?'Play':'Pause';button.setAttribute('aria-pressed',String(paused));if(paused)halt();else resume();});
function enter(){dismiss();document.getElementById('sky-content')?.scrollIntoView({behavior:'instant'});}
if(host.dataset.sky==='home'){
 host.addEventListener('click',e=>{if(e.target.closest('button,a'))return;enter();});
 host.querySelector('[data-sky-skip]')?.addEventListener('click',e=>{e.preventDefault();enter();document.getElementById('sky-content')?.focus({preventScroll:true});});
 window.addEventListener('keydown',e=>{if(!visible||dismissed)return;if(e.key==='Escape'&&document.querySelector('.sky-nav-more[open]')){document.querySelector('.sky-nav-more[open]').open=false;return;}if(e.target.closest('input,textarea,select,button,a,summary')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='Enter'||e.key==='Escape')enter();});
 // Native wheel/touch/scroll remains untouched; observer pauses offscreen work.
}else{
 const move=delta=>{origin=camera;elapsed=0;select(delta===1?nextIndex:(index+photos.length-1)%Math.max(photos.length,1),delta===1?next:null);};
 const full=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else host.requestFullscreen?.().catch(()=>{});};
 const help=()=>{const text=host.querySelector('[data-help-text]');text.hidden=!text.hidden;};
 host.querySelector('[data-next]')?.addEventListener('click',()=>move(1));
 host.querySelector('[data-prev]')?.addEventListener('click',()=>move(-1));
 host.querySelector('[data-fullscreen]')?.addEventListener('click',full);
 host.querySelector('[data-help]')?.addEventListener('click',help);
 window.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,button,a,summary')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='ArrowRight')move(1);else if(e.key==='ArrowLeft')move(-1);else if(e.key===' '){e.preventDefault();button.click();}else if(e.key.toLowerCase()==='f')full();else if(e.key.toLowerCase()==='h')help();else if(e.key==='Escape'&&!document.fullscreenElement)location.href='index.html';});
}
document.querySelector('.sky-nav-more')?.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.currentTarget.open){e.currentTarget.open=false;e.currentTarget.querySelector('summary').focus();e.stopPropagation();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)halt();else resume();});
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)resume();else halt();},{threshold:.05}).observe(host);
function fallback(){dead=true;halt();host.removeAttribute('data-ready');current=next=null;if(button)button.disabled=true;}
motion.addEventListener('change',()=>{if(still())fallback();});connection?.addEventListener?.('change',()=>{if(still())fallback();});
if(still()){fallback();return;}
Promise.all(['catalogue','images'].map(name=>fetch(`nova-sky/${name}.json`).then(r=>{if(!r.ok)throw Error(name);return r.json();}))).then(([catalogue,images])=>{
 if(dead||dismissed)return;
 data={stars:catalogue.stars.map(([ra,dec,mag])=>({v:unit([ra,dec]),mag})),mw:catalogue.mw.map(r=>r.map(unit)),lines:catalogue.lines.map(r=>r.map(unit))};
 const markerIndex=new Map();for(const p of [...images.filter(p=>p.src),...images.filter(p=>!p.src),...catalogue.messier]){const key=p.name.toLowerCase().replace(/\s+/g,'');if(!markerIndex.has(key))markerIndex.set(key,p);}
 markers=[...markerIndex.values()].map(p=>({name:p.display_name||p.name,v:unit([p.ra,p.dec])}));photos=images.filter(p=>p.src&&p.footprint).map(prepare);select(0);resume();
}).catch(fallback);
})();
