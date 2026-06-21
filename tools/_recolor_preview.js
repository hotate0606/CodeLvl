const {decode,encode}=require('./png');

// RGB<->HSL
function rgb2hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h,s,l=(mx+mn)/2;if(mx===mn){h=s=0;}else{const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}return[h,s,l];}
function hue2rgb(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;}
function hsl2rgb(h,s,l){let r,g,b;if(s===0){r=g=b=l;}else{const q=l<0.5?l*(1+s):l+s-l*s;const p=2*l-q;r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);}return[r*255,g*255,b*255];}

// 目標トーン（ゲームのパレット body 色）。色相を寄せ、彩度はその色相の鮮やかさへ寄せる。
const TARGETS={ green:rgb2hsl(0x7a,0xd0,0xa0), blue:rgb2hsl(0x6e,0xc8,0xe0), gold:rgb2hsl(0xf0,0xc0,0x60) };

// SHIFT=色相を完全置換、彩度は目標へ75%寄せ・明度はそのまま（＝陰影/模様を維持）
function recolor(img,tgt){
  const [th,ts]=tgt; const W=img.width,H=img.height,out=Buffer.from(img.data);
  for(let i=0;i<W*H;i++){const a=img.data[i*4+3];if(a<8)continue;
    const [,s,l]=rgb2hsl(img.data[i*4],img.data[i*4+1],img.data[i*4+2]);
    const ns=s*0.25+ts*0.75;                 // 彩度を目標トーンへ寄せる
    const [r,g,b]=hsl2rgb(th,ns,l);
    out[i*4]=r;out[i*4+1]=g;out[i*4+2]=b;}
  return {width:W,height:H,data:out};
}

const jobs=[['緑','green'],['青','blue'],['金','gold']];
const cells=jobs.map(([jp,key])=>{const im=decode('renderer/assets/ニシアフ/最終進化'+jp+'.png');return {im,out:recolor(im,TARGETS[key]),key};});

// 元 vs 変換 を縦2段・3列でグレー下地に合成して1枚に
const PAD=20, CW=Math.max(...cells.map(c=>c.im.width)), CH=Math.max(...cells.map(c=>c.im.height));
const W=PAD+(CW+PAD)*3, H=PAD+(CH+PAD)*2+PAD, BG=[40,40,52];
const sheet=Buffer.alloc(W*H*4);
for(let i=0;i<W*H;i++){sheet[i*4]=BG[0];sheet[i*4+1]=BG[1];sheet[i*4+2]=BG[2];sheet[i*4+3]=255;}
function blit(src,dx,dy){const {width:w,height:h,data:d}=src;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=d[(y*w+x)*4+3]/255;if(a<=0)continue;const sx=dx+x,sy=dy+y;if(sx<0||sx>=W||sy<0||sy>=H)continue;const o=(sy*W+sx)*4;for(let k=0;k<3;k++)sheet[o+k]=Math.round(d[(y*w+x)*4+k]*a+sheet[o+k]*(1-a));}}
cells.forEach((c,col)=>{const dx=PAD+(CW+PAD)*col+((CW-c.im.width)>>1);blit(c.im,dx,PAD);blit(c.out,dx,PAD+CH+PAD);});
encode('tools/_recolor_check.png',{width:W,height:H,data:sheet});
console.log('上段=元(生の色) / 下段=recolor適用。',W+'x'+H);
