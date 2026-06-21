const zlib=require('zlib'),fs=require('fs');const {encode}=require('./png');
function decodeAny(p){const b=fs.readFileSync(p);const W=b.readUInt32BE(16),H=b.readUInt32BE(20),bd=b[24],ct=b[25];const ch=ct===6?4:ct===2?3:null;if(!ch||bd!==8)throw new Error('unsupported '+ct);let off=8;const idat=[];while(off<b.length){const len=b.readUInt32BE(off);const t=b.toString('ascii',off+4,off+8);if(t==='IDAT')idat.push(b.subarray(off+8,off+8+len));off+=12+len;if(t==='IEND')break;}const raw=zlib.inflateSync(Buffer.concat(idat));const stride=W*ch,out=Buffer.alloc(H*stride);let prev=Buffer.alloc(stride),pp=0;for(let y=0;y<H;y++){const ft=raw[pp++];const cur=out.subarray(y*stride,y*stride+stride);raw.copy(cur,0,pp,pp+stride);pp+=stride;for(let x=0;x<stride;x++){const a=x>=ch?cur[x-ch]:0,bb=prev[x],c=x>=ch?prev[x-ch]:0;let v=cur[x];switch(ft){case 1:v=(v+a)&255;break;case 2:v=(v+bb)&255;break;case 3:v=(v+((a+bb)>>1))&255;break;case 4:{const q=a+bb-c,pa=Math.abs(q-a),pb=Math.abs(q-bb),pc=Math.abs(q-c);v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?bb:c))&255;break;}}cur[x]=v;}prev=cur;}
  // RGBA に正規化
  if(ch===4)return{W,H,data:out};const rgba=Buffer.alloc(W*H*4);for(let i=0;i<W*H;i++){rgba[i*4]=out[i*3];rgba[i*4+1]=out[i*3+1];rgba[i*4+2]=out[i*3+2];rgba[i*4+3]=255;}return{W,H,data:rgba};}
function rgb2hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h,s,l=(mx+mn)/2;if(mx===mn){h=s=0;}else{const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}return[h,s,l];}
function hue2rgb(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;}
function hsl2rgb(h,s,l){let r,g,b;if(s===0){r=g=b=l;}else{const q=l<0.5?l*(1+s):l+s-l*s;const p=2*l-q;r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);}return[r*255,g*255,b*255];}
function bodyMean(im){const {W,H,data}=im;let n=0,sl=0,ss=0;for(let i=0;i<W*H;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2],a=data[i*4+3];if(a<200)continue;if(r<20&&g<20&&b<20)continue;const[,s,l]=rgb2hsl(r,g,b);if(l<0.06||l>0.97)continue;n++;sl+=l;ss+=s;}return{meanL:sl/n,meanS:ss/n};}
function clamp(v,lo,hi){return v<lo?lo:v>hi?hi:v;}

const A='renderer/assets/ニシアフ/',M='renderer/assets/モーション/';
const jobs=[['緑','最終進化緑.png','ニシアフ最終進化あくび1.png'],['青','最終進化青.png','ニシアフ最終進化あくび2.png'],['金','最終進化金.png','ニシアフ最終進化あくび3.png']];
const results=[];
for(const [name,idleF,yawnF] of jobs){
  const idle=decodeAny(A+idleF), yawn=decodeAny(M+yawnF);
  const im=bodyMean(idle), ym=bodyMean(yawn);
  const fL=ym.meanL/im.meanL, fS=ym.meanS/im.meanS;
  const out=Buffer.from(idle.data);
  for(let i=0;i<idle.W*idle.H;i++){const a=idle.data[i*4+3];if(a<8)continue;let[h,s,l]=rgb2hsl(idle.data[i*4],idle.data[i*4+1],idle.data[i*4+2]);l=clamp(l*fL,0,1);s=clamp(s*fS,0,1);const[r,g,b]=hsl2rgb(h,s,l);out[i*4]=r;out[i*4+1]=g;out[i*4+2]=b;}
  const toned={W:idle.W,H:idle.H,data:out};
  encode(A+idleF,{width:idle.W,height:idle.H,data:out});
  const after=bodyMean(toned);
  console.log(name,' fL',fL.toFixed(3),'fS',fS.toFixed(3),' -> after meanL',after.meanL.toFixed(3),'(target',ym.meanL.toFixed(3),') meanS',after.meanS.toFixed(3),'(target',ym.meanS.toFixed(3),')');
  results.push({name,before:idle,after:toned});
}
// before/after プレビュー（上=調整前 下=調整後）グレー下地
const PAD=20,CW=Math.max(...results.map(r=>r.before.W)),CH=Math.max(...results.map(r=>r.before.H));
const W=PAD+(CW+PAD)*3,H=PAD+(CH+PAD)*2,BG=[40,40,52];const sh=Buffer.alloc(W*H*4);for(let i=0;i<W*H;i++){sh[i*4]=BG[0];sh[i*4+1]=BG[1];sh[i*4+2]=BG[2];sh[i*4+3]=255;}
function blit(src,dx,dy){const {W:w,H:h,data:d}=src;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=d[(y*w+x)*4+3]/255;if(a<=0)continue;const o=((dy+y)*W+(dx+x))*4;for(let k=0;k<3;k++)sh[o+k]=Math.round(d[(y*w+x)*4+k]*a+sh[o+k]*(1-a));}}
results.forEach((r,c)=>{const dx=PAD+(CW+PAD)*c+((CW-r.before.W)>>1);blit(r.before,dx,PAD);blit(r.after,dx,PAD+CH+PAD);});
encode('tools/_tone_check.png',{width:W,height:H,data:sh});
console.log('上=調整前 / 下=あくびトーンに合わせて調整後');
