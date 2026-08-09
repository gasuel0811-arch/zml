/* ================================================================
   SUPER MARIO ADVENTURE — Complete 2D Platformer Engine
   Pure JavaScript + HTML5 Canvas
   
   Architecture:
     AudioManager  — Web Audio API sound synthesis
     Particle       — visual effects
     ParticleSystem — manages particle pools
     Camera         — smooth scrolling viewport
     Player         — sprite-animated hero with power-up states
     Enemy          — Goomba, Koopa, Boss variants
     PowerUp        — Mushroom, Star, Coin power-ups
     Platform       — static & moving platforms
     Level          — level data + builder
     Game           — main controller & state machine
   ================================================================ */

'use strict';

/* ── Canvas Setup ─────────────────────────────────────────── */
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const W      = 800;
const H      = 500;
// 兼容不支持 roundRect 的浏览器
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (typeof r === 'number') r = {tl: r, tr: r, br: r, bl: r};
        else r = r || {tl: 0, tr: 0, br: 0, bl: 0};
        this.beginPath();
        this.moveTo(x + r.tl, y);
        this.lineTo(x + w - r.tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r.tr);
        this.lineTo(x + w, y + h - r.br);
        this.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
        this.lineTo(x + r.bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r.bl);
        this.lineTo(x, y + r.tl);
        this.quadraticCurveTo(x, y, x + r.tl, y);
        this.closePath();
        return this;
    };
}
/* ── 图片加载 ─────────────────────────────────────────── */
const Images = {};
const imageFiles = ['津威', '冰红茶', '烙锅', '方便面', '洋芋', '白狗', '蛇','蔬菜','小兵','塞巴斯蒂安','新娘'];
imageFiles.forEach(name => {
    Images[name] = new Image();
    Images[name].src = 'images/' + name + '.png';
});
/* ── Physics Constants ────────────────────────────────────── */
const GRAVITY      = 0.52;
const MAX_FALL     = 16;
const JUMP_FORCE   = -13.5;
const BIG_JUMP     = -15;
const WALK_SPEED   = 2.5;
const RUN_SPEED    = 5;
const FRICTION     = 0.82;

/* ================================================================
   AUDIO MANAGER  (all sounds synthesised — zero external files)
   ================================================================ */
class AudioManager {
  constructor() {
    this.ctx     = null;
    this.enabled = true;
    this._init();
  }

  _init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { this.enabled = false; }
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /**
   * Generic oscillator beep
   * @param {number} freq - start frequency
   * @param {string} type - oscillator type
   * @param {number} dur  - duration seconds
   * @param {number} vol  - volume 0-1
   * @param {number} delay - start delay
   * @param {number|null} freqEnd - sweep to frequency
   */
  _tone(freq, type = 'square', dur = 0.1, vol = 0.18, delay = 0, freqEnd = null) {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g);
    g.connect(this.ctx.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== null) o.frequency.linearRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  jump()    { this._tone(420, 'sine', 0.08, 0.22, 0, 700); }
  bigJump() { this._tone(320, 'sine', 0.1,  0.25, 0, 800); }
  coin()    { this._tone(988, 'sine', 0.06, 0.2);  this._tone(1319, 'sine', 0.12, 0.18, 0.05); }
  stomp()   { this._tone(120, 'square', 0.15, 0.3, 0, 60); }
  hit()     { this._tone(440, 'sawtooth', 0.08, 0.3); this._tone(200, 'sawtooth', 0.15, 0.25, 0.07); }
  die()     { [523,392,330,262].forEach((f,i) => this._tone(f,'square',0.12,0.25,i*0.13)); }
  powerup() { [392,523,659,784,1047].forEach((f,i) => this._tone(f,'sine',0.1,0.2,i*0.07)); }
  boss()    { this._tone(80,'sawtooth',0.3,0.4,0,60); }
  bossHit() { this._tone(200,'square',0.2,0.35,0,100); }
  levelWin(){ [523,659,784,1047,1319,1568].forEach((f,i) => this._tone(f,'sine',0.15,0.2,i*0.09)); }
  gameWin() { [523,659,784,523,659,784,1047].forEach((f,i) => this._tone(f,'triangle',0.18,0.25,i*0.11)); }
  block()   { this._tone(220,'square',0.06,0.2); }
  star()    { [784,988,1175,1319].forEach((f,i)=>this._tone(f,'sine',0.08,0.25,i*0.06)); }
}

const Audio = new AudioManager();

/* ================================================================
   PARTICLE SYSTEM
   ================================================================ */
class Particle {
  constructor(x, y, vx, vy, color, size, life, gravity = 0.2) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.size  = size;
    this.life  = life;
    this.maxLife = life;
    this.gravity = gravity;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.3;
  }
  update() {
    this.vx *= 0.97;
    this.vy += this.gravity;
    this.x  += this.vx;
    this.y  += this.vy;
    this.life--;
    this.rotation += this.rotSpeed;
    return this.life > 0;
  }
  draw(ctx, camX) {
    const alpha = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = this.color;
    ctx.translate(this.x - camX, this.y);
    ctx.rotate(this.rotation);
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

class ParticleSystem {
  constructor() { this.particles = []; }

  burst(x, y, color, count = 10, speedMult = 1) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
      const spd   = (2 + Math.random() * 4) * speedMult;
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * spd,
        Math.sin(angle) * spd - 2,
        color,
        4 + Math.random() * 6,
        30 + Math.random() * 20
      ));
    }
  }

  coinBurst(x, y) {
    const colors = ['#FFD700', '#FFA500', '#FFEC3D', '#fff'];
    for (let i = 0; i < 12; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const angle = (Math.PI * 2 / 12) * i;
      const spd   = 2 + Math.random() * 5;
      this.particles.push(new Particle(x, y, Math.cos(angle)*spd, Math.sin(angle)*spd - 3, color, 5+Math.random()*4, 35+Math.random()*15));
    }
  }

  smokeBurst(x, y) {
    for (let i = 0; i < 8; i++) {
      this.particles.push(new Particle(
        x + (Math.random()-0.5)*20, y + (Math.random()-0.5)*10,
        (Math.random()-0.5)*3, -1 - Math.random()*2,
        `rgba(${180+Math.random()*60|0},${180+Math.random()*60|0},${180+Math.random()*60|0},0.8)`,
        8+Math.random()*8, 25+Math.random()*20, -0.05
      ));
    }
  }

  update() { 
// 防止粒子过多导致性能问题
if (this.particles.length > 500) {
this.particles.splice(0, this.particles.length - 500);
}
this.particles = this.particles.filter(p => p.update()); 
}
  draw(ctx, camX) { this.particles.forEach(p => p.draw(ctx, camX)); }
  clear() { this.particles = []; }
}

/* ================================================================
   CAMERA
   ================================================================ */
class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.targetX = 0; this.targetY = 0;
    this.shake = 0;
  }
  follow(player, levelWidth) {
    this.targetX = player.x - W * 0.35;
    this.targetX = Math.max(0, Math.min(this.targetX, levelWidth - W));
    this.x += (this.targetX - this.x) * 0.1;
    this.x = Math.floor(this.x);
  }
  addShake(amount) { this.shake = amount; }
  getOffsetX() {
    if (this.shake > 0) {
      const s = (Math.random() - 0.5) * this.shake;
      this.shake *= 0.75;
      if (this.shake < 0.5) this.shake = 0;
      return s;
    }
    return 0;
  }
}

/* ================================================================
   SPRITE DRAWING HELPERS
   All characters drawn procedurally using Canvas2D primitives
   ================================================================ */
const Sprites = {

 
//小兵角色
mario(ctx, x, y, w, h, frame, facing, jumping) {
    const img = Images['小兵'];
    if (img && img.complete) {
        // 小兵: 320x96, 每帧32x32
        const fw = 32;
        const fh = 32;
        let col, row;
        if (jumping) {
            // 跳跃用第3行（索引2），9帧循环
            row = 2;
            col = Math.floor(frame / 4) % 9;
        } else {
            // 跑步用第2行（索引1），5帧循环
            row = 1;
            col = Math.floor(frame / 4) % 5;
        }
        // 绘制放大1.5倍（只是显示大小，碰撞还是原来的w/h）
const scale = 1.5;
const dw = w * scale;
const dh = h * scale;
const dx = x - (dw - w) / 2;
const dy = y + h - dh + 12;  // 底部对齐再往上提升8px
        ctx.save();
        // 朝向翻转
        if (facing < 0) {
            ctx.translate(dx + dw, dy);
            ctx.scale(-1, 1);
            ctx.drawImage(img, col * fw, row * fh, fw, fh, 0, 0, dw, dh);
        } else {
            ctx.drawImage(img, col * fw, row * fh, fw, fh, dx, dy, dw, dh);
        }
        ctx.restore();
        return;
    }
    // 图片没加载出来时兜底
    ctx.fillStyle = '#CC0000';
    ctx.fillRect(x, y, w, h);
},
marioBig(ctx, x, y, w, h, frame, facing, jumping) {
    this.mario(ctx, x, y, w, h, frame, facing, jumping);
},

/* ── 白狗敌人（替换Goomba）── */
goomba(ctx, x, y, w, h, frame, standing, facing) {
    const img = Images['白狗'];
    if (img && img.complete) {
        // 白狗: 96x80, 横向6帧, 竖向5行, 最后一行只有4帧
        const fw = img.width / 6;   // 16px
        const fh = img.height / 5;  // 16px
        
        let col, row;
        if (standing) {
            // 站立：用第0行第0帧（正面站立）
            col = 0;
            row = 0;
        } else {
            // 行走：用第1行（跑步帧），横向循环4帧
            col = Math.floor(frame / 4) % 4;
            row = 1;
        }
        
        ctx.save();
        // 面向左边时翻转
        if (facing && facing < 0) {
            ctx.translate(x + w/2, y + h/2);
            ctx.scale(-1, 1);
            ctx.drawImage(img, col * fw, row * fh, fw, fh, -w/2, -h/2, w, h);
        } else {
            ctx.drawImage(img, col * fw, row * fh, fw, fh, x, y, w, h);
        }
        ctx.restore();
        return;
    }
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x, y, w, h);
},

koopa(ctx, x, y, w, h, frame, isShell, facing, standing) {
    const img = Images['蛇'];
    if (img && img.complete) {
        // 蛇: 320x160, 横向10帧, 每帧32x32
        const fw = img.width / 10;  // 32px
        const fh = img.height / 5;  // 32px
        let animFrame, row;
        if (standing) {
            // 站立帧用第1行第0帧（假设第1行第0帧是站立）
            animFrame = 0;
            row = 0;
        } else {
            // 行走：用第4行（索引3）
            animFrame = Math.floor(frame / 4) % 10;
            row = 3;
        }
        // 放大2倍（和狗差不多大）
        const scale = 2;
        const dw = 32 * scale;  // 64px
        const dh = 32 * scale;  // 64px
        // 居中绘制，修正位置偏移
        const dx = x + (w - dw) / 2;
const dy = y - 30;  // 往上提15px
        ctx.save();
        // 翻转：面向右边时翻转（因为素材默认朝左）
        if (facing && facing > 0) {
            ctx.translate(dx + dw/2, dy + dh/2);
            ctx.scale(-1, 1);
            ctx.drawImage(img, animFrame * fw, row * fh, fw, fh, -dw/2, -dh/2, dw, dh);
        } else {
            ctx.drawImage(img, animFrame * fw, row * fh, fw, fh, dx, dy, dw, dh);
        }
        ctx.restore();
        return;
    }
    ctx.fillStyle = '#27AE60';
    ctx.fillRect(x, y, w, h);
},

 /* ── Boss 蔬菜（替换Boss）── */
boss(ctx, x, y, w, h, frame, hp) {
    const img = Images['蔬菜'];
    if (img && img.complete) {
        // 蔬菜素材，直接绘制
        // Boss大小是80x80
        ctx.save();
        // 添加受伤闪烁
        if (hp < 3) {
            ctx.globalAlpha = 0.85;
        }
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();
        
        // HP indicator（保持原样）
        ctx.fillStyle='rgba(0,0,0,0.5)';
        ctx.fillRect(x, y-22, w, 12);
        for (let i=0;i<3;i++) {
            ctx.fillStyle = i < hp ? '#FF4444' : '#333';
            ctx.fillRect(x+4+i*(w/3-4), y-20, w/3-8, 8);
        }
        return;
    }
    // 图片未加载时兜底
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x, y, w, h);
},

 
 /* ── 津威道具（替换蘑菇）── */
mushroom(ctx, x, y, w, h) {
    const img = Images['津威'];
    if (img && img.complete) {
        ctx.drawImage(img, x, y, w, h);
        return;
    }
    // 图片没加载出来时兜底画个红色方块
    ctx.fillStyle = '#FF4444';
    ctx.fillRect(x, y, w, h);
},

/* ── 烙锅道具（替换星星）── */
star(ctx, x, y, w, h, t) {
    const img = Images['烙锅'];
    if (img && img.complete) {
        // 烙锅放大1.3倍
        const scale = 1.3;
        const dw = w * scale;
        const dh = h * scale;
        const dx = x - (dw - w) / 2;
        const dy = y - (dh - h) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
        return;
    }
    // 图片没加载出来时兜底画个金色方块
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x, y, w, h);
},
noodle(ctx, x, y, w, h) {
    const img = Images['方便面'];
    if (img && img.complete) {
        // 放大1.4倍
        const scale = 1.4;
        const dw = w * scale;
        const dh = h * scale;
        const dx = x - (dw - w) / 2;
        const dy = y - (dh - h) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
        return;
    }
    // 图片没加载出来时兜底
    ctx.fillStyle = '#F5A623';
    ctx.fillRect(x, y, w, h);
},
/* ── 洋芋道具 ── */
potato(ctx, x, y, w, h) {
    const img = Images['洋芋'];
    if (img && img.complete) {
        ctx.drawImage(img, x, y, w, h);
        return;
    }
    // 图片没加载出来时兜底
    ctx.fillStyle = '#C8A24B';
    ctx.fillRect(x, y, w, h);
},
/* ── 冰红茶道具（加速）── */
tea(ctx, x, y, w, h) {
    const img = Images['冰红茶'];
    if (img && img.complete) {
        ctx.drawImage(img, x, y, w, h);
        return;
    }
    // 图片没加载出来时兜底
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x, y, w, h);
},
  /* ── Coin ── */
  coin(ctx, x, y, w, h, t) {
    const scaleX = Math.abs(Math.cos(t * 0.08));
    ctx.save();
    ctx.translate(x+w/2, y+h/2);
    ctx.scale(scaleX, 1);
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#FFA500';
    ctx.beginPath(); ctx.ellipse(0,0,w*0.32,h*0.38,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(-w*0.1,-h*0.15,w*0.1,h*0.1,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  },

  /* ── Flag pole ── */
  flag(ctx, x, y, reached) {
    // Pole
    ctx.fillStyle = '#888';
    ctx.fillRect(x+28, y, 4, H - y);
    // Ball top
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(x+30, y, 8, 0,Math.PI*2); ctx.fill();
    // Flag
    ctx.fillStyle = reached ? '#27AE60' : '#CC0000';
    ctx.beginPath();
    ctx.moveTo(x+32, y+4);
    ctx.lineTo(x+32, y+40);
    ctx.lineTo(x+60, y+22);
    ctx.closePath(); ctx.fill();
    // Star on flag
    ctx.fillStyle='#FFD700';
    ctx.font='bold 14px sans-serif';
    ctx.fillText('★', x+37, y+27);
  },

  /* ── Question block ── */
  questionBlock(ctx, x, y, s, hit) {
    const grad = ctx.createLinearGradient(x,y,x,y+s);
    if(hit){
      grad.addColorStop(0,'#888'); grad.addColorStop(1,'#666');
    } else {
      grad.addColorStop(0,'#FFA500'); grad.addColorStop(1,'#CC7000');
    }
    ctx.fillStyle=grad;
    ctx.fillRect(x,y,s,s);
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=2;
    ctx.strokeRect(x+1,y+1,s-2,s-2);
    // Highlight top-left
    ctx.fillStyle='rgba(255,255,255,0.3)';
    ctx.fillRect(x+2,y+2,s-4,4);
    ctx.fillRect(x+2,y+2,4,s-4);
    // '?' or nothing
    if(!hit){
      ctx.fillStyle='#fff';
      ctx.font=`bold ${s*0.6}px sans-serif`;
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText('?',x+s/2,y+s/2+2);
    }
  },

  /* ── Brick block ── */
  brick(ctx, x, y, s, theme) {
    const cols = {
      grass:  ['#C0392B','#922B21'],
      desert: ['#D4AC0D','#9A7D0A'],
      snow:   ['#7FB3D3','#5499BB'],
      boss:   ['#555','#333']
    };
    const [c1,c2] = cols[theme]||cols.grass;
    ctx.fillStyle=c1; ctx.fillRect(x,y,s,s);
    ctx.fillStyle=c2;
    // Mortar lines
    ctx.fillRect(x,y+s/2-1,s,2);
    ctx.fillRect(x+s/2-1,y,2,s/2);
    ctx.fillRect(x+s/4*3-1,y+s/2,2,s/2);
    ctx.fillRect(x+s/4-1,y+s/2,2,s/2);
  },

  /* ── Ground tile ── */
  ground(ctx, x, y, w, h, theme) {
    const themes = {
      grass:  { top:'#5DBB63', main:'#6B3A2A' },
      desert: { top:'#F0C040', main:'#C8860C' },
      snow:   { top:'#DDEEFF', main:'#7799BB' },
      boss:   { top:'#444',    main:'#222'    }
    };
    const t = themes[theme]||themes.grass;
    ctx.fillStyle=t.main; ctx.fillRect(x,y,w,h);
    if(theme==='grass') {
      ctx.fillStyle=t.top; ctx.fillRect(x,y,w,8);
    } else if(theme==='snow'){
      ctx.fillStyle=t.top; ctx.fillRect(x,y,w,10);
    } else {
      ctx.fillStyle=t.top; ctx.fillRect(x,y,w,6);
    }
    // Grid lines
    ctx.strokeStyle='rgba(0,0,0,0.15)'; ctx.lineWidth=1;
    for(let gx=x; gx<x+w; gx+=32) {
      ctx.beginPath(); ctx.moveTo(gx,y); ctx.lineTo(gx,y+h); ctx.stroke();
    }
    for(let gy=y; gy<y+h; gy+=32) {
      ctx.beginPath(); ctx.moveTo(x,gy); ctx.lineTo(x+w,gy); ctx.stroke();
    }
  },

  /* ── Pipe ── */
  pipe(ctx, x, y, w, h) {
    // Body
    const g1 = ctx.createLinearGradient(x,0,x+w,0);
    g1.addColorStop(0,'#196F3D'); g1.addColorStop(0.4,'#27AE60');
    g1.addColorStop(0.7,'#1E8449'); g1.addColorStop(1,'#145A32');
    ctx.fillStyle=g1; ctx.fillRect(x+4,y+24,w-8,h-24);
    // Head
    const g2 = ctx.createLinearGradient(x,0,x+w,0);
    g2.addColorStop(0,'#1E8449'); g2.addColorStop(0.4,'#2ECC71');
    g2.addColorStop(0.7,'#27AE60'); g2.addColorStop(1,'#196F3D');
    ctx.fillStyle=g2; ctx.fillRect(x,y,w,24);
    // Sheen
    ctx.fillStyle='rgba(255,255,255,0.15)';
    ctx.fillRect(x+6,y+2,8,h-4);
  },

  /* ── Cloud background ── */
  cloud(ctx, x, y, scale=1) {
    ctx.fillStyle='rgba(255,255,255,0.88)';
    const draw=(cx,cy,r)=>{ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();};
    draw(x+30*scale, y+20*scale, 20*scale);
    draw(x+55*scale, y+12*scale, 26*scale);
    draw(x+80*scale, y+20*scale, 20*scale);
    draw(x+55*scale, y+28*scale, 16*scale);
  },

  /* ── Cactus (desert deco) ── */
  cactus(ctx, x, y) {
    ctx.fillStyle='#2E8B57';
    ctx.fillRect(x+12,y,10,60);
    ctx.fillRect(x,y+16,14,8);
    ctx.fillRect(x+24,y+24,14,8);
    ctx.fillRect(x,y+8,12,8);
    ctx.fillRect(x+26,y+18,12,8);
  },

  /* ── Snow tree ── */
  snowTree(ctx, x, y) {
    ctx.fillStyle='#5C3317';
    ctx.fillRect(x+10,y+40,10,20);
    ctx.fillStyle='#2E8B57';
    ctx.beginPath(); ctx.moveTo(x,y+50); ctx.lineTo(x+30,y+50); ctx.lineTo(x+15,y+20); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+4,y+32); ctx.lineTo(x+26,y+32); ctx.lineTo(x+15,y+8); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.moveTo(x+4,y+32); ctx.lineTo(x+26,y+32); ctx.lineTo(x+15,y+8); ctx.closePath(); ctx.fill();
    // Snow on lower branches
    ctx.fillStyle='rgba(255,255,255,0.6)';
    ctx.fillRect(x,y+47,30,5);
  
 },

/* ── 塞巴斯蒂安（终点NPC）── */
sebastian(ctx, x, y, w, h) {
    const img = Images['塞巴斯蒂安'];
    if (img && img.complete) {
        ctx.drawImage(img, x, y, w, h);
        return;
    }
    // 兜底
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('塞', x+w/2-8, y+h/2+5);
},
/* ── 新娘（小兵变身）── */
bride(ctx, x, y, w, h) {
    const img = Images['新娘'];
    if (img && img.complete) {
        ctx.drawImage(img, x, y, w, h);
        return;
    }
    // 兜底
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#FFD700';
    ctx.fillText('👰', x+w/2-8, y+h/2+5);
}
};
/* ================================================================
   SCORE POPUP  (floating score text)
   ================================================================ */
class ScorePopup {
  constructor(x, y, text, color='#FFD700') {
    this.x=x; this.y=y; this.text=text; this.color=color;
    this.life=60; this.maxLife=60; this.vy=-1.2;
  }
  update() { this.y+=this.vy; this.vy*=0.95; this.life--; return this.life>0; }
  draw(ctx, camX) {
    ctx.save();
    ctx.globalAlpha=this.life/this.maxLife;
    ctx.fillStyle=this.color;
    ctx.font='bold 14px monospace';
    ctx.textAlign='center';
    ctx.fillText(this.text, this.x-camX, this.y);
    ctx.restore();
  }
}

/* ================================================================
   PLATFORM  (static and moving)
   ================================================================ */
class Platform {
  /**
   * @param {number} x y w h
   * @param {string} type  'ground'|'brick'|'question'|'pipe'|'invisible'
   * @param {string} theme 'grass'|'desert'|'snow'|'boss'
   * @param {object} [move] { axis, dist, speed }
   * @param {boolean} [hasItem] question block has item
   */
  constructor(x, y, w, h, type='ground', theme='grass', move=null, hasItem=false) {
    this.x=x; this.y=y; this.w=w; this.h=h;
    this.type=type; this.theme=theme;
    this.move=move;
    this.hasItem=hasItem;
    this.hit=false;
    this.bumpTimer=0;
    this.origX=x; this.origY=y;
    this.moveT=0;
    this.moveDir=1;
  }

  update() {
    if (this.bumpTimer > 0) this.bumpTimer--;
    if (!this.move) return;
    const m = this.move;
    if (m.axis==='x') {
      this.x += m.speed * this.moveDir;
      if (Math.abs(this.x - this.origX) >= m.dist) this.moveDir *= -1;
    } else {
      this.y += m.speed * this.moveDir;
      if (Math.abs(this.y - this.origY) >= m.dist) this.moveDir *= -1;
    }
  }

  bump(game) {
    if (this.type === 'question' && !this.hit) {
      this.hit=true; this.bumpTimer=12;
      Audio.block();
      if (this.hasItem==='mushroom') {
        game.spawnMushroom(this.x, this.y-40);
        game.particles.burst(this.x+16, this.y, '#FF4444', 8);
      } else if (this.hasItem==='star') {
    game.spawnStar(this.x, this.y-40);
    game.particles.burst(this.x+16, this.y, '#FFD700', 10, 1.5);
} else if (this.hasItem==='noodle') {
    game.spawnNoodle(this.x, this.y-40);
    game.particles.burst(this.x+16, this.y, '#F5A623', 10, 1.5);
} else if (this.hasItem==='potato') {
    game.spawnPotato(this.x, this.y-40);
    game.particles.burst(this.x+16, this.y, '#C8A24B', 10, 1.5);
    } else if (this.hasItem==='tea') {
    game.spawnTea(this.x, this.y-40);
    game.particles.burst(this.x+16, this.y, '#8B4513', 10, 1.5);
} else {
        game.addScore(200, this.x, this.y);
        game.addCoins(1);
        game.particles.coinBurst(this.x+16, this.y);
        Audio.coin();
      }
    }
  }

  draw(ctx, camX) {
    const sx = this.x - camX;
    if (sx + this.w < -10 || sx > W + 10) return; // cull
    const by = this.bumpTimer > 0 ? this.y - Math.sin(this.bumpTimer/12*Math.PI)*8 : this.y;

    if (this.type==='ground')    { Sprites.ground(ctx, sx, by, this.w, this.h, this.theme); }
    else if(this.type==='brick') { for(let i=0;i<this.w;i+=32) Sprites.brick(ctx,sx+i,by,32,this.theme); }
    else if(this.type==='question') { Sprites.questionBlock(ctx,sx,by,32,this.hit); }
    else if(this.type==='pipe')  { Sprites.pipe(ctx,sx,by,this.w,this.h); }
    else if(this.type==='invisible') { /* no draw */ }
    // Moving platform highlight
    if (this.move) {
      ctx.fillStyle='rgba(255,255,255,0.15)';
      ctx.fillRect(sx+2,by+2,this.w-4,6);
    }
  }
}

/* ================================================================
   ENEMY
   ================================================================ */
class Enemy {
  /**
   * @param {number} x y
   * @param {string} type  'goomba'|'koopa'|'boss'
   * @param {string} theme
   */
 constructor(x, y, type='goomba', theme='grass') {
    this.x=x; this.y=y;
    this.type=type; this.theme=theme;
    this.vx = type==='koopa' ? -1.5 : -1.8;
    this.vy=0;
    this.facing = this.vx > 0 ? 1 : -1;  // 现在 vx 有值了
    this._lastReverse = 0;  // 上次反转方向的帧数，防止卡住
    this.standTimer = 0;   // 连续不动帧数
this.lastX = this.x;   // 上次位置
    this.w = type==='boss' ? 80 : 36;
    this.h = type==='boss' ? 80 : 36;
    this.alive=true;
    this.dying=false;
    this.dieTimer=0;
    this.onGround=false;
    this.frame=0;
    this.frameTimer=0;
    this.isShell=false;
    this.shellKicked=false;
    // Boss
    this.hp = type==='boss' ? 3 : 1;
    this.hitInvincible=0;
    this.bossAttackTimer=0;
    this.bossDir=1;
    this.active=false; // boss starts inactive
    // 对话气泡
this.bubble = null;        // 当前气泡文字
this.bubbleTimer = 0;      // 气泡显示计时
this.bubbleCooldown = 0;   // 下次说话冷却
}

  activate() { this.active=true; }

  update(platforms, player, game) {
    if (!this.alive) return;
    if (this.dying) { this.dieTimer--; if(this.dieTimer<=0) this.alive=false; return; }
    if (this.type==='boss' && !this.active) return;
    if (this.hitInvincible>0) this.hitInvincible--;

    // Frame animation
    this.frameTimer++;
    if(this.frameTimer>=8){this.frameTimer=0;this.frame++;}
// 对话气泡
if (this.bubbleTimer > 0) this.bubbleTimer--;
if (this.bubbleCooldown > 0) this.bubbleCooldown--;
if (this.bubbleTimer <= 0 && this.bubbleCooldown <= 0) {
    // 随机触发说话
    if (Math.random() < 0.003) {
        const phrases = this.type === 'goomba' ? ['你气不气？'] :
                       this.type === 'koopa' ? ['我才是贵州地头蛇！'] :
                       ['你竟然不爱吃蔬菜！'];
        this.bubble = phrases[Math.floor(Math.random() * phrases.length)];
        this.bubbleTimer = 90;          // 显示1.5秒
        this.bubbleCooldown = 240;      // 冷却4秒
    }
}
if (this.bubbleTimer <= 0) this.bubble = null;
    // Boss special movement
    if (this.type==='boss') {
      this.bossAttackTimer++;
      if(this.bossAttackTimer>120){
        this.bossAttackTimer=0;
        this.vx = this.bossDir * (3 + (3-this.hp)*1.5);
        this.bossDir*=-1;
        Audio.boss();
        game.camera.addShake(4);
      }
      this.vx*=0.92;
    }
// 检测位置是否变化（判断是否卡住）— 位置完全没变化才算卡住
if (this.x === this.lastX) {
    this.standTimer++;
} else {
    this.standTimer = 0;
}
this.lastX = this.x;
    // Gravity
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
    this.x += this.vx;
    this.y += this.vy;

   // Platform collisions
this.onGround = false;
for (const p of platforms) {
if (!this.intersects(p)) continue;
const overlapX = Math.min(this.x+this.w, p.x+p.w) - Math.max(this.x,p.x);
const overlapY = Math.min(this.y+this.h, p.y+p.h) - Math.max(this.y,p.y);
if (overlapY < overlapX) {
// 从上方落下，站到平台上
if (this.vy>=0 && this.y+this.h > p.y && this.y < p.y + p.h*0.5) {
this.y=p.y-this.h; this.vy=0; this.onGround=true;
// 当站在移动平台上时，跟随平台移动
if(p.move && p.move.axis==='x') this.x += p.move.speed * p.moveDir;
}
} else {
// 碰到侧面 - 反转方向，但只在确实被夹住时才反转
// 检查是否真的应该反转（避免在柱子两侧反复横跳）
if(this.type!=='boss'){
// 记录玩家在哪个方向
const fromLeft = this.x + this.w/2 < p.x + p.w/2;
// 只有在移动方向是朝向平台时才反转
if((this.vx > 0 && fromLeft) || (this.vx < 0 && !fromLeft)){
// 但如果不是卡在两个平台之间，才反转
if(this.y + this.h <= p.y + 8 || this.y >= p.y + p.h - 8){
// 顶部或底部接触，不反转（让物理效果自然解决）
} else {
this.vx *= -1;
}
}
}
}
}

  // Reverse at edges
if (this.vx > 0) this.facing = 1;
else if (this.vx < 0) this.facing = -1;
if (this.type!=='boss') {
const tileAhead = { x: this.x+(this.vx>0?this.w+2:-4), y: this.y+this.h+4 };
let supported=false;
for(const p of platforms){
if(p.type==='invisible') continue;
if(tileAhead.x>p.x&&tileAhead.x<p.x+p.w&&tileAhead.y>p.y&&tileAhead.y<p.y+p.h){
supported=true;break;
}
}
// 只有当确实在地面时并且前面没有支撑物时才反转
// 添加防抖：如果刚反转过（短时间内），不要再次反转
if(!supported && this.onGround){
// 检查是否在短时间内重复反转（防卡死）
if(this._lastReverse===undefined || this.frame - this._lastReverse > 30){
this.vx*=-1;
this._lastReverse=this.frame;
}
}
}

    
    // Shell slide collision with other enemies
if(this.isShell&&this.shellKicked){
    const enemies = game.levelData.enemies;
    enemies.forEach(e=>{
        if(e!==this&&e.alive&&!e.dying&&this.intersectsEnemy(e)){
            e.die(game,true);
            game.addScore(500,e.x,e.y);
        }
    });
}

    // Screen bounds reverse
    if(this.x<0){this.x=0;this.vx=Math.abs(this.vx);}
  }

  intersects(p) {
    return this.x<p.x+p.w && this.x+this.w>p.x && this.y<p.y+p.h && this.y+this.h>p.y;
  }
  intersectsEnemy(e) {
    return this.x<e.x+e.w && this.x+this.w>e.x && this.y<e.y+e.h && this.y+this.h>e.y;
  }

  stomp(game) {
    if(this.type==='boss'){
      if(this.hitInvincible>0) return false;
      this.hp--;
      this.hitInvincible=60;
      Audio.bossHit();
      game.camera.addShake(8);
      game.particles.burst(this.x+this.w/2,this.y+this.h/2,'#FF4444',16,1.5);
      game.addScore(1000,this.x,this.y);
      if(this.hp<=0){ this.die(game,false); return true; }
      return true;
    }
   
    this.die(game, false);
    return true;
  }

  kickShell(fromLeft) {
    if(!this.isShell) return;
    this.shellKicked=true;
    this.vx=fromLeft ? 8 : -8;
  }

  die(game, fromShell=false) {
    this.dying=true;
    this.dieTimer=fromShell?30:40;
    this.vy=-6; this.vx=0;
    if(this.type==='boss'){
      this.dieTimer=80;
      game.particles.burst(this.x+this.w/2,this.y+this.h/2,'#FF4444',30,2);
      game.particles.smokeBurst(this.x+this.w/2,this.y+this.h/2);
      game.camera.addShake(12);
      Audio.die();
    } else {
      Audio.stomp();
    }
  }

  draw(ctx, camX) {
    if(!this.alive) return;
    const sx=this.x-camX;
    if(sx+this.w<-10||sx>W+10) return;
    if(this.dying){
      ctx.save();
      ctx.globalAlpha=Math.max(0,this.dieTimer/40);
      if(this.type==='goomba'){
        Sprites.goomba(ctx,sx,this.y+this.h*0.5,this.w,this.h*0.5,this.frame);
      } else if(this.type==='koopa'){
        ctx.translate(sx+this.w/2,this.y+this.h/2);
        ctx.rotate(Math.PI);
        ctx.translate(-this.w/2,-this.h/2);
        Sprites.koopa(ctx,0,0,this.w,this.h,this.frame,false);
      } else {
        Sprites.boss(ctx,sx,this.y,this.w,this.h,this.frame,this.hp);
      }
      ctx.restore();
      return;
    }
    if(this.hitInvincible>0&&Math.floor(this.hitInvincible/5)%2===0) return; // blink
    // 对话气泡
if (this.bubble && this.bubbleTimer > 0) {
    ctx.save();
    ctx.font = 'bold 12px monospace';
    const textW = ctx.measureText(this.bubble).width + 16;
    const bx = sx + this.w/2 - textW/2;
    const by = this.y - 30;
    // 气泡背景
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.roundRect(bx, by, textW, 24, 6);
    ctx.fill();
    // 小三角
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(sx + this.w/2 - 5, by + 24);
    ctx.lineTo(sx + this.w/2 + 5, by + 24);
    ctx.lineTo(sx + this.w/2, by + 32);
    ctx.closePath();
    ctx.fill();
    // 边框
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, textW, 24, 6);
    ctx.stroke();
    // 文字
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.bubble, sx + this.w/2, by + 13);
    ctx.restore();
}
    if(this.type==='goomba') Sprites.goomba(ctx,sx,this.y,this.w,this.h,this.frame,this.standTimer > 3, this.facing);
else if(this.type==='koopa') Sprites.koopa(ctx,sx,this.y,this.w,this.h,this.frame,this.isShell,this.facing,this.standTimer > 3);
    else if(this.type==='boss') Sprites.boss(ctx,sx,this.y,this.w,this.h,this.frame,this.hp);
  }
}

/* ================================================================
   POWER-UP
   ================================================================ */
class PowerUp {
  constructor(x, y, type='mushroom') {
    this.x=x; this.y=y;
    this.type=type;
    this.w=28; this.h=28;
    this.vx=type==='star'?2.5:1.5;
this.vy=type==='star'?-6:0;
    this.alive=true;
    this.t=0;
    this.collected=false;
  }

  update(platforms) {
    this.t++;
    if(this.type==='star'){
      this.vy+=GRAVITY;
      this.vy=Math.min(this.vy,MAX_FALL);
    }
    this.x+=this.vx;
    this.y+=this.vy;

    // Platform collisions
    for(const p of platforms){
      if(p.type==='invisible') continue;
      if(this.x<p.x+p.w&&this.x+this.w>p.x&&this.y<p.y+p.h&&this.y+this.h>p.y){
        const overlapX=Math.min(this.x+this.w,p.x+p.w)-Math.max(this.x,p.x);
        const overlapY=Math.min(this.y+this.h,p.y+p.h)-Math.max(this.y,p.y);
        if(overlapY<overlapX){
          if(this.vy>=0){this.y=p.y-this.h;this.vy=this.type==='star'?-9:0;}
        } else {
          this.vx*=-1;
        }
      }
    }
    if(this.y>H+50) this.alive=false;
  }

 draw(ctx,camX) {
    if(!this.alive||this.collected) return;
    const sx=this.x-camX;
    if(sx+this.w<-10||sx>W+10) return;
    if(this.type==='mushroom') Sprites.mushroom(ctx,sx,this.y,this.w,this.h);
    else if(this.type==='star') Sprites.star(ctx,sx,this.y,this.w,this.h,this.t);
    else if(this.type==='noodle') Sprites.noodle(ctx,sx,this.y,this.w,this.h);
    else if(this.type==='potato') Sprites.potato(ctx,sx,this.y,this.w,this.h);
    else if(this.type==='tea') Sprites.tea(ctx,sx,this.y,this.w,this.h);
}
}

/* ================================================================
   COIN ENTITY  (collectible in world)
   ================================================================ */
class CoinEntity {
  constructor(x, y) {
    this.x=x; this.y=y; this.w=20; this.h=20;
    this.alive=true; this.t=Math.random()*100;
    this.bobY=y;
  }
  update(){
    this.t++;
    this.y=this.bobY+Math.sin(this.t*0.08)*4;
  }
  draw(ctx,camX){
    if(!this.alive) return;
    const sx=this.x-camX;
    if(sx+this.w<-10||sx>W+10) return;
    Sprites.coin(ctx,sx,this.y,this.w,this.h,this.t);
  }
}

/* ================================================================
   PLAYER
   ================================================================ */
class Player {
constructor(startX, startY) {
this.startX=startX; this.startY=startY;
this.deathHandled = false;  // 添加这一行
this.reset();
}

  reset() {
    this.x=this.startX; this.y=this.startY;
    this.deathHandled = false;  // 添加这一行
    this.vx=0; this.vy=0;
    this.w=30; this.h=30;
    this.onGround=false;
    this.facing=1;
    this.alive=true;
    this.dying=false;
    this.dieTimer=0;
    this.big=false;
    this.star=false;
    this.starTimer=0;
    this.invincible=0;
    this.frame=0;
    this.frameTimer=0;
    this.jumping=false;
    this.wasOnGround=false;
    this.jumpCount=0;    // 跳跃次数
this.maxJumps=2;     // 最大跳跃次数（二段跳）
this.speedBoost=false;   // 加速状态
this.speedTimer=0;       // 加速持续时间
  }

  makeSmall() {
    if(!this.big) return false;
    this.big=false;
    this.w=24; this.h=32;
    this.invincible=120;
    return true;
  }

  growBig() {
    this.big=true;
    this.w=28; this.h=48;
    Audio.powerup();
  }

update(input, platforms, game) {
if(game.flagReached && game.brideTimer > 0){
this.vx=0; this.vy=0;
return;
}
if(this.dying || !this.alive){
// 死亡动画期间也限制位置
this.dieTimer--;
    if(this.dieTimer > 0){
        this.vy += 0.4;
        this.y = Math.min(this.y + this.vy, H - 10); // 不让掉出屏幕
    }
    if(this.dieTimer <= 0){
        this.alive = false;
        this.y = this.startY; // 重置位置
        this.x = this.startX;
        this.vy = 0;
    }
    return;
}
    if(!this.alive) return;

    // Star timer
    if(this.star){
      this.starTimer--;
      if(this.starTimer<=0){this.star=false;}
    }
    // 加速计时
if(this.speedBoost){
    this.speedTimer--;
    if(this.speedTimer<=0){this.speedBoost=false;}
}
    if(this.invincible>0) this.invincible--;
    if(input.invincible){
    this.invincible = 10; // 每帧都刷新无敌
    }
    // Horizontal
const running = input.run;
let maxSpd = running ? RUN_SPEED : WALK_SPEED;
if (this.speedBoost) maxSpd *= 1.5;  // 加速1.5倍
    if(input.left){
      this.vx=Math.max(this.vx-0.6,-maxSpd);
      this.facing=-1;
    } else if(input.right){
      this.vx=Math.min(this.vx+0.6,maxSpd);
      this.facing=1;
    } else {
      this.vx*=FRICTION;
      if(Math.abs(this.vx)<0.1) this.vx=0;
    }

    // Jump（支持二段跳）
if(input.jumpPressed){
    if(this.onGround){
        this.vy=this.big ? BIG_JUMP : JUMP_FORCE;
        this.onGround=false;
        this.jumping=true;
        this.jumpCount=1;
        this.big ? Audio.bigJump() : Audio.jump();
    } else if(this.jumpCount < this.maxJumps){
        // 二段跳：力减半
        this.vy=this.big ? -8 : -7;
        this.jumpCount++;
        this.jumping=true;
        Audio.jump();
    }
}
    // Variable jump height
    if(!input.jump&&this.vy<-4) this.vy+=1.5;

    // Gravity
    this.vy=Math.min(this.vy+GRAVITY, MAX_FALL);

    // Move X
    this.x+=this.vx;
    this.resolveX(platforms,game);

    // Move Y
    this.wasOnGround=this.onGround;
this.onGround=false;
this.y+=this.vy;
this.resolveY(platforms,game);
if(this.onGround&&!this.wasOnGround){
    this.jumping=false;
    this.jumpCount=0;   // 落地重置跳跃次数
}
    // World bounds (left)
    if(this.x<0){this.x=0;this.vx=0;}

    // Fall death
if(this.y > H + 60) {
    this.startDie(game);
    return;
}
// 防止数值溢出（安全网）
if(this.y > 10000) {
    this.y = -500;
    this.vy = 0;
}
    // Frame anim
    this.frameTimer++;
    if(this.frameTimer>=6){this.frameTimer=0;this.frame++;}
  }

  resolveX(platforms, game) {
    for(const p of platforms){
      if(p.type==='invisible') continue;
      if(!this.intersects(p)) continue;
      const mid=(p.y+p.h/2);
      if(this.y+this.h>p.y+8&&this.y<p.y+p.h-8){
        if(this.vx>0&&this.x+this.w>p.x&&this.x<p.x){
          this.x=p.x-this.w; this.vx=0;
        } else if(this.vx<0&&this.x<p.x+p.w&&this.x+this.w>p.x+p.w){
          this.x=p.x+p.w; this.vx=0;
        }
      }
    }
  }

  resolveY(platforms, game) {
    for(const p of platforms){
      if(p.type==='invisible') continue;
      if(!this.intersects(p)) continue;
      if(this.vy>0&&this.y+this.h>p.y&&this.y<p.y){
        // Land on top
        this.y=p.y-this.h;
        this.vy=0;
        this.onGround=true;
        // Moving platform carry
        if(p.move&&p.move.axis==='x') this.x+=p.move.speed*p.moveDir;
      } else if(this.vy<0&&this.y<p.y+p.h&&this.y+this.h>p.y+p.h){
        // Hit from below
        this.y=p.y+p.h;
        this.vy=Math.abs(this.vy)*0.3;
        p.bump(game);
      }
    }
  }

  intersects(p){
    return this.x<p.x+p.w&&this.x+this.w>p.x&&this.y<p.y+p.h&&this.y+this.h>p.y;
  }

  startDie(game){
    if(this.dying||this.invincible>0) return;
    if(this.deathHandled) return;
    this.deathHandled = true;
    this.dying=true;
    this.dieTimer=80;
    this.vy=-10;
    this.vx=0;
    Audio.die();
    game.lives--;
    game.updateHUD();
}

  draw(ctx, camX) {
    if(!this.alive&&!this.dying) return;
    const sx=this.x-camX;
    // Invincible blink
    if(this.invincible>0&&Math.floor(this.invincible/6)%2===0) return;
    // Star rainbow（改成闪烁效果）
if(this.star){
    if(Math.floor(Date.now()/100)%2===0){
        ctx.save();
        ctx.globalAlpha=0.3;
        ctx.fillStyle=`hsl(${Date.now()*0.3%360},100%,60%)`;
        ctx.fillRect(sx-2,this.y-2,this.w+4,this.h+4);
        ctx.restore();
    }
}
    if(this.big){
      Sprites.marioBig(ctx,sx,this.y,this.w,this.h,this.frame,this.facing,this.jumping);
    } else {
      Sprites.mario(ctx,sx,this.y,this.w,this.h,this.frame,this.facing,this.jumping);
    }
  }
}

/* ================================================================
   LEVEL DATA  (3 levels + boss)
   ================================================================ */
function buildLevel1() {
  // Grassland

  const W_LVL = 4000;
  const platforms = [];
  const enemies   = [];
  const coins     = [];

  // Ground
  platforms.push(new Platform(0,450,1200,50,'ground','grass'));
  platforms.push(new Platform(1300,450,600,50,'ground','grass'));
  platforms.push(new Platform(2050,450,800,50,'ground','grass'));
  platforms.push(new Platform(3000,450,1000,50,'ground','grass'));

  // Floating bricks / question blocks
  platforms.push(new Platform(200,330,32,32,'question','grass',null,'noodle'));
  platforms.push(new Platform(300,330,32,32,'brick','grass'));
  platforms.push(new Platform(332,330,32,32,'question','grass',null,'mushroom'));
  platforms.push(new Platform(364,330,32,32,'brick','grass'));
  platforms.push(new Platform(500,280,32,32,'question','grass',null,'star'));

  platforms.push(new Platform(700,350,96,32,'brick','grass'));
  platforms.push(new Platform(750,290,32,32,'question','grass',null,'tea'));

  platforms.push(new Platform(950,330,128,32,'brick','grass'));
  platforms.push(new Platform(1050,270,32,32,'question','grass',null,'coin'));

  // Moving platform
  platforms.push(new Platform(1400,320,96,20,'ground','grass',{axis:'x',dist:120,speed:1.5}));
  platforms.push(new Platform(1650,280,96,20,'ground','grass',{axis:'y',dist:80,speed:1.2}));

  // Pipes
  platforms.push(new Platform(600,370,64,80,'pipe','grass'));
  platforms.push(new Platform(900,386,64,64,'pipe','grass'));
  platforms.push(new Platform(2200,354,64,96,'pipe','grass'));

  // Second section
  platforms.push(new Platform(2100,380,32,32,'question','grass',null,'potato'));
  platforms.push(new Platform(2250,340,64,32,'brick','grass'));
  platforms.push(new Platform(2400,300,32,32,'question','grass',null,'mushroom'));
  platforms.push(new Platform(2500,360,128,32,'brick','grass'));

  platforms.push(new Platform(2700,300,96,20,'ground','grass',{axis:'x',dist:150,speed:2}));
  platforms.push(new Platform(2950,340,128,32,'brick','grass'));

  // Final stretch
  platforms.push(new Platform(3100,380,32,32,'question','grass',null,'coin'));
  platforms.push(new Platform(3200,340,32,32,'question','grass',null,'star'));
  platforms.push(new Platform(3400,400,32,32,'brick','grass'));
  platforms.push(new Platform(3450,360,32,32,'brick','grass'));
  platforms.push(new Platform(3500,320,32,32,'brick','grass'));
  platforms.push(new Platform(3550,280,32,32,'brick','grass'));

  // Enemies
  enemies.push(new Enemy(650,418,'goomba','grass'));
  enemies.push(new Enemy(750,418,'goomba','grass'));
  enemies.push(new Enemy(850,418,'koopa','grass'));
  enemies.push(new Enemy(1500,418,'goomba','grass'));
  enemies.push(new Enemy(2150,418,'goomba','grass'));
  enemies.push(new Enemy(2300,418,'koopa','grass'));
  enemies.push(new Enemy(2600,418,'goomba','grass'));
  enemies.push(new Enemy(2700,418,'goomba','grass'));
  enemies.push(new Enemy(3100,418,'koopa','grass'));
  enemies.push(new Enemy(3300,418,'goomba','grass'));

  // Coins
  for(let cx=200;cx<400;cx+=40) coins.push(new CoinEntity(cx,300));
  for(let cx=700;cx<900;cx+=40) coins.push(new CoinEntity(cx,310));
  for(let cx=1400;cx<1600;cx+=40) coins.push(new CoinEntity(cx,290));
  for(let cx=2600;cx<2800;cx+=40) coins.push(new CoinEntity(cx,320));
  for(let cx=3100;cx<3300;cx+=40) coins.push(new CoinEntity(cx,350));

  // Clouds (background decorations)
  const clouds=[{x:100,y:80,s:1},{x:400,y:60,s:1.3},{x:800,y:90,s:0.9},
    {x:1200,y:70,s:1.1},{x:1700,y:80,s:1},{x:2100,y:60,s:1.2},
    {x:2600,y:90,s:0.8},{x:3000,y:70,s:1.1},{x:3500,y:80,s:1}];

  const decos=[{type:'cactus',x:560,y:390},{type:'cactus',x:870,y:390}];

  return { platforms, enemies, coins, clouds, decos,
    width:W_LVL, theme:'grass', name:'World 1-1: 草地',
    bgTop:'#5C94FC', bgBottom:'#5C94FC',
    flagX:3880, playerStart:{x:80,y:380} };
}

function buildLevel2() {
  // Desert
  const W_LVL=4500;
  const platforms=[];
  const enemies=[];
  const coins=[];

  // Ground (with gaps)
  platforms.push(new Platform(0,450,1000,50,'ground','desert'));
  platforms.push(new Platform(1100,450,700,50,'ground','desert'));
  platforms.push(new Platform(1950,450,600,50,'ground','desert'));
  platforms.push(new Platform(2700,450,500,50,'ground','desert'));
  platforms.push(new Platform(3350,450,1150,50,'ground','desert'));

  // Platforms
  platforms.push(new Platform(150,360,32,32,'question','desert',null,'potato'));
  platforms.push(new Platform(250,360,32,32,'question','desert',null,'mushroom'));
  platforms.push(new Platform(350,310,96,32,'brick','desert'));
  platforms.push(new Platform(420,310,32,32,'question','desert',null,'star'));

  platforms.push(new Platform(600,340,128,32,'brick','desert'));
  platforms.push(new Platform(750,280,32,32,'question','desert',null,'tea'));
  platforms.push(new Platform(850,340,64,32,'brick','desert'));

  // Pipes
  platforms.push(new Platform(500,370,64,80,'pipe','desert'));
  platforms.push(new Platform(1000,386,64,64,'pipe','desert'));
  platforms.push(new Platform(2100,354,64,96,'pipe','desert'));
  platforms.push(new Platform(3200,386,64,64,'pipe','desert'));

  // Moving platforms (more in desert)
  platforms.push(new Platform(1150,340,80,20,'ground','desert',{axis:'x',dist:180,speed:2.5}));
  platforms.push(new Platform(1400,300,80,20,'ground','desert',{axis:'y',dist:100,speed:2}));
  platforms.push(new Platform(1700,260,80,20,'ground','desert',{axis:'x',dist:160,speed:2.2}));
  platforms.push(new Platform(2000,350,80,20,'ground','desert',{axis:'y',dist:120,speed:1.8}));

  platforms.push(new Platform(2750,360,32,32,'question','desert',null,'coin'));
  platforms.push(new Platform(2850,300,96,32,'brick','desert'));
  platforms.push(new Platform(2950,260,32,32,'question','desert',null,'mushroom'));
  platforms.push(new Platform(3050,380,64,32,'brick','desert'));

  platforms.push(new Platform(3400,360,32,32,'question','desert',null,'star'));
  platforms.push(new Platform(3500,320,128,32,'brick','desert'));
  platforms.push(new Platform(3700,280,32,32,'question','desert',null,'noodle'));

  // Pyramid staircase
  for(let s=0;s<5;s++){
    platforms.push(new Platform(4100+s*36,450-s*36,36,36+s*36,'ground','desert'));
  }
  for(let s=0;s<5;s++){
    platforms.push(new Platform(4100+5*36-s*36+36,450-s*36,36,36+s*36,'ground','desert'));
  }

  // Enemies (faster, more)
  enemies.push(new Enemy(400,418,'goomba','desert'));
  enemies.push(new Enemy(500,418,'koopa','desert'));
  enemies.push(new Enemy(700,418,'goomba','desert'));
  enemies.push(new Enemy(900,418,'goomba','desert'));
  enemies.push(new Enemy(1200,418,'koopa','desert'));
  enemies.push(new Enemy(2100,418,'goomba','desert'));
  enemies.push(new Enemy(2200,418,'goomba','desert'));
  enemies.push(new Enemy(2500,418,'koopa','desert'));
  enemies.push(new Enemy(2750,418,'goomba','desert'));
  enemies.push(new Enemy(2900,418,'koopa','desert'));
  enemies.push(new Enemy(3400,418,'goomba','desert'));
  enemies.push(new Enemy(3600,418,'koopa','desert'));
  enemies.push(new Enemy(3800,418,'goomba','desert'));
  // Faster goombas
  enemies.forEach(e=>{e.vx*=1.3;});

  // Coins
  for(let cx=150;cx<450;cx+=40) coins.push(new CoinEntity(cx,330));
  for(let cx=600;cx<850;cx+=40) coins.push(new CoinEntity(cx,310));
  for(let cx=2750;cx<3000;cx+=40) coins.push(new CoinEntity(cx,330));
  for(let cx=3500;cx<3700;cx+=40) coins.push(new CoinEntity(cx,290));

  const clouds=[{x:200,y:60,s:1},{x:600,y:80,s:1.2},{x:1100,y:60,s:0.9},
    {x:1600,y:80,s:1},{x:2200,y:60,s:1.1},{x:2800,y:80,s:0.8},
    {x:3300,y:60,s:1},{x:4000,y:70,s:1.2}];

  return { platforms, enemies, coins, clouds, decos:[],
    width:W_LVL, theme:'desert', name:'第2关：沙漠',
    bgTop:'#F4D03F', bgBottom:'#E67E22',
    flagX:4430, playerStart:{x:80,y:380} };
}

function buildLevel3() {
  // Snow
  const W_LVL=4500;
  const platforms=[];
  const enemies=[];
  const coins=[];

  // Ground (more gaps)
  platforms.push(new Platform(0,450,800,50,'ground','snow'));
  platforms.push(new Platform(900,450,500,50,'ground','snow'));
  platforms.push(new Platform(1550,450,400,50,'ground','snow'));
  platforms.push(new Platform(2100,450,350,50,'ground','snow'));
  platforms.push(new Platform(2600,450,300,50,'ground','snow'));
  platforms.push(new Platform(3050,450,400,50,'ground','snow'));
  platforms.push(new Platform(3600,450,300,50,'ground','snow'));
  platforms.push(new Platform(4050,450,450,50,'ground','snow'));

  // Platforms (icy - more moving)
  platforms.push(new Platform(200,370,32,32,'question','snow',null,'mushroom'));
  platforms.push(new Platform(300,330,96,32,'brick','snow'));
  platforms.push(new Platform(420,290,32,32,'question','snow',null,'star'));

  platforms.push(new Platform(550,340,80,20,'ground','snow',{axis:'x',dist:100,speed:2.5}));
  platforms.push(new Platform(750,300,80,20,'ground','snow',{axis:'y',dist:100,speed:2}));

  // Pipes
  platforms.push(new Platform(700,370,64,80,'pipe','snow'));
  platforms.push(new Platform(1000,386,64,64,'pipe','snow'));
  platforms.push(new Platform(1700,354,64,96,'pipe','snow'));
  platforms.push(new Platform(2200,386,64,64,'pipe','snow'));
  platforms.push(new Platform(3000,370,64,80,'pipe','snow'));

  // More moving platforms in gaps
  platforms.push(new Platform(850,350,70,20,'ground','snow',{axis:'x',dist:100,speed:3}));
  platforms.push(new Platform(1200,300,70,20,'ground','snow',{axis:'y',dist:120,speed:2.5}));
  platforms.push(new Platform(1600,260,70,20,'ground','snow',{axis:'x',dist:200,speed:3}));
  platforms.push(new Platform(2150,310,70,20,'ground','snow',{axis:'y',dist:90,speed:2.8}));
  platforms.push(new Platform(2700,280,70,20,'ground','snow',{axis:'x',dist:150,speed:3.5}));
  platforms.push(new Platform(3100,330,70,20,'ground','snow',{axis:'y',dist:100,speed:2.5}));
  platforms.push(new Platform(3700,300,70,20,'ground','snow',{axis:'x',dist:180,speed:3}));

  // Floating platforms
  platforms.push(new Platform(1100,380,32,32,'question','snow',null,'potato'));
  platforms.push(new Platform(1800,340,64,32,'brick','snow'));
  platforms.push(new Platform(1900,280,32,32,'question','snow',null,'mushroom'));
  platforms.push(new Platform(2250,350,32,32,'question','snow',null,'tea'));
  platforms.push(new Platform(2800,310,96,32,'brick','snow'));
  platforms.push(new Platform(2900,260,32,32,'question','snow',null,'star'));
  platforms.push(new Platform(3200,360,32,32,'question','snow',null,'noodle'));
  platforms.push(new Platform(3800,330,64,32,'brick','snow'));
  platforms.push(new Platform(3900,280,32,32,'question','snow',null,'mushroom'));
  platforms.push(new Platform(4100,360,128,32,'brick','snow'));

  // Enemies (more, faster)
  enemies.push(new Enemy(350,418,'goomba','snow'));
  enemies.push(new Enemy(450,418,'koopa','snow'));
  enemies.push(new Enemy(920,418,'goomba','snow'));
  enemies.push(new Enemy(1020,418,'goomba','snow'));
  enemies.push(new Enemy(1600,418,'koopa','snow'));
  enemies.push(new Enemy(2150,418,'goomba','snow'));
  enemies.push(new Enemy(2650,418,'koopa','snow'));
  enemies.push(new Enemy(2750,418,'goomba','snow'));
  enemies.push(new Enemy(3100,418,'goomba','snow'));
  enemies.push(new Enemy(3200,418,'koopa','snow'));
  enemies.push(new Enemy(3650,418,'goomba','snow'));
  enemies.push(new Enemy(3750,418,'goomba','snow'));
  enemies.push(new Enemy(4100,418,'koopa','snow'));
  enemies.push(new Enemy(4200,418,'goomba','snow'));
  enemies.forEach(e=>{e.vx*=1.5;});

  // Coins (scattered)
  for(let cx=200;cx<500;cx+=40) coins.push(new CoinEntity(cx,340));
  for(let cx=950;cx<1150;cx+=40) coins.push(new CoinEntity(cx,360));
  for(let cx=1650;cx<1900;cx+=40) coins.push(new CoinEntity(cx,310));
  for(let cx=2700;cx<2950;cx+=40) coins.push(new CoinEntity(cx,280));
  for(let cx=3650;cx<3900;cx+=40) coins.push(new CoinEntity(cx,300));
  for(let cx=4100;cx<4350;cx+=40) coins.push(new CoinEntity(cx,330));

  const clouds=[{x:100,y:50,s:1},{x:500,y:70,s:0.9},{x:900,y:55,s:1.2},
    {x:1400,y:60,s:1},{x:1900,y:80,s:0.8},{x:2500,y:50,s:1.1},
    {x:3000,y:70,s:0.9},{x:3600,y:55,s:1},{x:4100,y:65,s:1.2}];

  const decos=[{type:'tree',x:120,y:410},{type:'tree',x:520,y:410},
    {type:'tree',x:1580,y:410},{type:'tree',x:2680,y:410},
    {type:'tree',x:3680,y:410}];

  return { platforms, enemies, coins, clouds, decos,
    width:W_LVL, theme:'snow', name:'World 3-1: 雪地',
    bgTop:'#B0C8E8', bgBottom:'#D6EAF8',
    flagX:4430, playerStart:{x:80,y:380} };
}

function buildLevelBoss() {
  // Boss level — dark castle
  const W_LVL=2000;
  const platforms=[];
  const enemies=[];
  const coins=[];

  // Ground
  platforms.push(new Platform(0,450,2000,50,'ground','boss'));

  // Castle platforms
  platforms.push(new Platform(200,380,128,32,'brick','boss'));
  platforms.push(new Platform(400,320,96,32,'brick','boss'));
  platforms.push(new Platform(600,360,128,32,'brick','boss'));
  platforms.push(new Platform(800,300,64,32,'brick','boss'));
  platforms.push(new Platform(1000,380,96,32,'brick','boss'));
  platforms.push(new Platform(1200,330,128,32,'brick','boss'));
  platforms.push(new Platform(1400,360,96,32,'brick','boss'));

  // Some question blocks for the fight
  platforms.push(new Platform(500,250,32,32,'question','boss',null,'mushroom'));
  platforms.push(new Platform(800,230,32,32,'question','boss',null,'star'));
  platforms.push(new Platform(1200,260,32,32,'question','boss',null,'noodle'));

  // Moving platforms
  platforms.push(new Platform(300,280,80,20,'ground','boss',{axis:'y',dist:100,speed:2}));
  platforms.push(new Platform(900,250,80,20,'ground','boss',{axis:'y',dist:80,speed:2.5}));
  platforms.push(new Platform(1500,270,80,20,'ground','boss',{axis:'x',dist:120,speed:3}));

  // BOSS enemy
  const boss=new Enemy(1400,370,'boss','boss');
  boss.vx=0; boss.hp=3;
  enemies.push(boss);

  // Guard goombas
  enemies.push(new Enemy(600,418,'goomba','boss'));
  enemies.push(new Enemy(800,418,'goomba','boss'));
  enemies.push(new Enemy(1000,418,'koopa','boss'));
  enemies.forEach(e=>{if(e.type!=='boss')e.vx*=2;});

  // Coins everywhere
  for(let cx=200;cx<1800;cx+=80) coins.push(new CoinEntity(cx,400));

  const clouds=[];

  return { platforms, enemies, coins, clouds, decos:[],
    width:W_LVL, theme:'boss', name:'World 4-1: 黑暗城堡',
    bgTop:'#1a1a2e', bgBottom:'#16213e',
    flagX:1880, playerStart:{x:80,y:380}, isBoss:true };
}

/* ================================================================
   GAME  — main controller / state machine
   ================================================================ */
class Game {
  constructor() {
    this.state='start'; // start|playing|paused|levelclear|gameover|win
    this.score=0;
    this.coins=0;
    this.lives=3;
    this.levelIndex=0;
    this.levels=[buildLevel1,buildLevel2,buildLevel3,buildLevelBoss];
    this.timer=300;
    this.timerTick=0;
    this.popups=[];
    this.particles=new ParticleSystem();
    this.camera=new Camera();
    this.powerups=[];
    this.input={left:false,right:false,jump:false,jumpPressed:false,run:false,invincible:false};
    this._prevJump=false;
    this.animT=0;
    this.levelData=null;
    this.player=null;
    this.flagReached=false;
    this.flagTimer=0;
    this.bossActivated=false;
    this.itemMessage = '';    // 道具提示文字
this.itemMsgTimer = 0;    // 提示显示时间
this.brideTimer = 0;    // 变身计时
    this._bindInput();
    this._buildHUD();
    this._loadLevel(0);
  }

  /* ── Input binding ─────────────────────────────────── */
  _bindInput() {
    const keyMap={
      ArrowLeft:'left', KeyA:'left',
      ArrowRight:'right', KeyD:'right',
      ArrowUp:'jump', KeyW:'jump', Space:'jump', KeyZ:'jump',
      ShiftLeft:'run', ShiftRight:'run', ArrowDown:'run',
      KeyG:'invincible'   // ← 按 G 键无敌
    };
    window.addEventListener('keydown',e=>{
      const k=keyMap[e.code];
      if(k){
        if(k==='jump'&&!this.input.jump) this.input.jumpPressed=true;
        this.input[k]=true;
        e.preventDefault();
      }
      if(e.code==='Escape'&&this.state==='playing') this._setState('paused');
      else if(e.code==='Escape'&&this.state==='paused') this._setState('playing');
    });
    window.addEventListener('keyup',e=>{
      const k=keyMap[e.code];
      if(k) this.input[k]=false;
    });
    // Touch controls
    const bindBtn=(id,key)=>{
      const btn=document.getElementById(id);
      if(!btn) return;
      const press=e=>{
        e.preventDefault();
        if(key==='jump'&&!this.input.jump) this.input.jumpPressed=true;
        this.input[key]=true;
        btn.classList.add('pressed');
      };
      const release=e=>{
        e.preventDefault();
        this.input[key]=false;
        btn.classList.remove('pressed');
      };
      btn.addEventListener('touchstart',press,{passive:false});
      btn.addEventListener('touchend',release,{passive:false});
      btn.addEventListener('mousedown',press);
      btn.addEventListener('mouseup',release);
    };
    bindBtn('btn-left','left');
    bindBtn('btn-right','right');
    bindBtn('btn-jump','jump');
  }

  /* ── HUD ────────────────────────────────────────────── */
  _buildHUD() {
    // HUD is drawn on canvas, not DOM (for pixel-perfect look)
  }

  updateHUD() { /* canvas-drawn HUD updated each frame */ }

  /* ── State management ──────────────────────────────── */
  _setState(s) {
    this.state=s;
    // Resume audio context on first interaction
    if(Audio.ctx&&Audio.ctx.state==='suspended') Audio.ctx.resume();
  }

  /* ── Level loading ─────────────────────────────────── */
  _loadLevel(idx) {
    this.levelIndex=idx;
    const builder=this.levels[idx]||this.levels[this.levels.length-1];
    this.levelData=builder();
    const ps=this.levelData.playerStart;
    this.player=new Player(ps.x, ps.y);
    this.timer=300;
    this.timerTick=0;
    this.powerups=[];
    this.particles.clear();
    this.popups=[];
    this.camera.x=0;
    this.flagReached=false;
    this.flagTimer=0;
    this.bossActivated=false;
    // Set enemy theme correctly
    this.levelData.enemies.forEach(e=>e.theme=this.levelData.theme);
  }

  /* ── Score helpers ─────────────────────────────────── */
  addScore(val, x, y) {
    this.score+=val;
    this.popups.push(new ScorePopup(x,y,'+'+val));
  }
  addCoins(n) {
    this.coins+=n;
    this.score+=n*50;
  }

  /* ── Power-up spawning ─────────────────────────────── */
  spawnMushroom(x,y) { this.powerups.push(new PowerUp(x,y,'mushroom')); }
  spawnStar(x,y)     { this.powerups.push(new PowerUp(x,y,'star'));     }
spawnNoodle(x,y)   { this.powerups.push(new PowerUp(x,y,'noodle'));   }
spawnPotato(x,y)   { this.powerups.push(new PowerUp(x,y,'potato'));   }
spawnTea(x,y)      { this.powerups.push(new PowerUp(x,y,'tea'));      }
  /* ── Save/load leaderboard ─────────────────────────── */
  saveScore() {
    const key='marioAdventure_lb';
    const entries=JSON.parse(localStorage.getItem(key)||'[]');
    entries.push({score:this.score,coins:this.coins,level:this.levelIndex+1,time:300-this.timer});
    entries.sort((a,b)=>b.score-a.score);
    entries.splice(10);
    localStorage.setItem(key,JSON.stringify(entries));
  }
  getLeaderboard() {
    return JSON.parse(localStorage.getItem('marioAdventure_lb')||'[]');
  }

  /* ================================================================
     MAIN UPDATE
     ================================================================ */
  update() {
    this.animT++;
if(this._respawnPending && this.state !== 'playing'){
        this._respawnPending = false;
        this._loadLevel(this.levelIndex);
        this._setState('playing');
        return;
    }
    // jumpPressed is a single-frame signal
    if(this._prevJump&&!this.input.jump) { /* released */ }
    this.input.jumpPressed = this.input.jump && !this._prevJump;
    this._prevJump=this.input.jump;

    if(this.state!=='playing') return;

    const ld=this.levelData;
    const pl=this.player;

    // Timer
    this.timerTick++;
    if(this.timerTick>=60){this.timerTick=0;this.timer=Math.max(0,this.timer-1);}
    if(this.timer===0&&!pl.dying&&pl.alive) pl.startDie(this);

    // Player
    pl.update(this.input,ld.platforms,this);

    // Camera
    this.camera.follow(pl,ld.width);

    // Platforms
    ld.platforms.forEach(p=>p.update());

    // Enemies
    ld.enemies.forEach(e=>e.update(ld.platforms,pl,this));

    // Boss activation
    if(ld.isBoss&&!this.bossActivated){
      const boss=ld.enemies.find(e=>e.type==='boss');
      if(boss&&pl.x>800){boss.activate();this.bossActivated=true;}
    }

    // Player-enemy collision
    if(pl.alive&&!pl.dying){
      ld.enemies.forEach(e=>{
        if(!e.alive||e.dying) return;
        if(pl.x<e.x+e.w&&pl.x+pl.w>e.x&&pl.y<e.y+e.h&&pl.y+pl.h>e.y){
          if(pl.star){
            // Star kills enemy
            e.die(this,false);
            this.addScore(e.type==='boss'?5000:300,e.x,e.y);
            return;
          }
          // Stomp from above?
          const stompable=pl.vy>0&&pl.y+pl.h<e.y+e.h*0.55;
          if(stompable){
            if(e.stomp(this)){
              pl.vy=pl.big?-10:-8;
              this.addScore(e.type==='boss'?1000:200,e.x,e.y-20);
            }
          } else if(e.isShell&&e.shellKicked===false){
            e.kickShell(pl.x<e.x);
          } else {
            // Player takes damage
            if(!pl.star&&pl.invincible===0){
              if(!pl.makeSmall()) pl.startDie(this);
            }
          }
        }
      });
    }
// 道具提示文字计时
if (this.itemMsgTimer > 0) this.itemMsgTimer--;
    // Power-up updates & collision
this.powerups.forEach(pu=>{
    if(!pu.alive||pu.collected) return;
    pu.update(ld.platforms);
    if(pl.alive&&!pl.dying){
        if(pl.x<pu.x+pu.w&&pl.x+pl.w>pu.x&&pl.y<pu.y+pu.h&&pl.y+pl.h>pu.y){
            pu.collected=true;
            if(pu.type==='mushroom'){
                if(!pl.big){ pl.growBig(); this.lives=Math.min(this.lives+1,9); }
                else this.addScore(500,pu.x,pu.y);
                this.particles.burst(pu.x,pu.y,'#FF4444',12);
                this.itemMessage = '你喝到了津威，yummy！';
                this.itemMsgTimer = 120;
            } else if(pu.type==='star'){
    pl.star=true; pl.starTimer=300;
    Audio.coin();
    this.particles.burst(pu.x,pu.y,'#FFD700',16,1.5);
    this.itemMessage = '你吃到了烙锅，yummy！';
    this.itemMsgTimer = 120;
} else if(pu.type==='noodle'){
    this.lives = Math.min(this.lives+1, 9);  // 加命
    Audio.powerup();
    this.particles.burst(pu.x,pu.y,'#F5A623',16,1.2);
    this.itemMessage = '你吃到了麻辣牛肉面，+1生命！';
    this.itemMsgTimer = 120;
}
 else if(pu.type==='potato'){
    this.addScore(500, pu.x, pu.y);  // 加500分
    Audio.coin();
    this.particles.burst(pu.x,pu.y,'#C8A24B',12,1.2);
    this.itemMessage = '你吃到了洋芋，+500分！';
    this.itemMsgTimer = 120;
    }
    else if(pu.type==='tea'){
    pl.speedBoost=true; pl.speedTimer=300;  // 加速5秒
    Audio.powerup();
    this.particles.burst(pu.x,pu.y,'#8B4513',16,1.5);
    this.itemMessage = '你喝到了冰红茶，加速！';
    this.itemMsgTimer = 120;
}
    
this.addScore(1000,pu.x,pu.y);
this.updateHUD();
        }
    }
});

    // Coin collection
    ld.coins.forEach(c=>{
      if(!c.alive) return;
      c.update();
      if(pl.alive&&!pl.dying){
        if(pl.x<c.x+c.w&&pl.x+pl.w>c.x&&pl.y<c.y+c.h&&pl.y+pl.h>c.y){
          c.alive=false;
          this.addCoins(1);
          this.particles.coinBurst(c.x,c.y);
          Audio.coin();
          this.popups.push(new ScorePopup(c.x,c.y,'COIN!','#FFD700'));
        }
      }
    });

// Flag / end goal
if(!this.flagReached&&pl.alive&&!pl.dying){
    const fx=ld.flagX;
    if(pl.x+pl.w>fx+20&&pl.x<fx+80&&pl.y+pl.h>100){
        this.flagReached=true;
        this.flagTimer=360;
        this.addScore(Math.max(0,this.timer)*40,pl.x,pl.y-30);
        Audio.levelWin();
        this.particles.burst(fx+30,200,'#FFD700',20,1.5);
        this.particles.burst(fx+30,250,'#27AE60',15,1.2);
        this.saveScore();
        // 最后一关：小兵变成新娘
        if(this.levelIndex === this.levels.length - 1){
            // 变身动画：把玩家位置替换成新娘
            this.brideTimer = 60;  // 变身过渡时间
            this.particles.burst(pl.x+pl.w/2, pl.y+pl.h/2, '#FFD700', 30, 2);
            this.particles.burst(pl.x+pl.w/2, pl.y+pl.h/2, '#fff', 20, 1.5);
            Audio.powerup();
        }
    }
}
    
if(this.flagReached){
this.flagTimer--;
if(this.brideTimer > 0){
// 新娘不动
pl.vx=0; pl.vy=0;
} else {
pl.vx=2; pl.vy=0; // walk to flag
}
    if(this.flagTimer<=0){
        if(this.levelIndex>=this.levels.length-1){
          this._setState('win'); Audio.gameWin();
        } else {
          this._setState('levelclear');
        }
      }
    }


// Player dead → game over or respawn
if(!pl.alive && pl.deathHandled){
    if(this.lives <= 0){
        this.saveScore();
        this._setState('gameover');
    } else {
        // 完全重置玩家
        pl.alive = true;
        pl.dying = false;
        pl.deathHandled = false;
        pl.x = pl.startX;
        pl.y = pl.startY;
        pl.vx = 0;
        pl.vy = 0;
        pl.onGround = false;
        pl.invincible = 120;
        pl.facing = 1;
    }
}

    // Particles & popups
    this.particles.update();
    this.popups=this.popups.filter(p=>p.update());
  }

  /* ================================================================
     MAIN DRAW
     ================================================================ */
  draw() {
    ctx.clearRect(0,0,W,H);
    const camX=this.camera.x+this.camera.getOffsetX();

    if(this.state==='start')      { this._drawStart(); return; }
    if(this.state==='gameover')   { this._drawGameOver(); return; }
    if(this.state==='win')        { this._drawWin(); return; }
    if(this.state==='levelclear') { this._drawLevelClear(); return; }

    const ld=this.levelData;

    /* ── Background ── */
    const grad=ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,ld.bgTop);
    grad.addColorStop(1,ld.bgBottom);
    ctx.fillStyle=grad;
    ctx.fillRect(0,0,W,H);

    /* ── Background decorations ── */
    this._drawBgDecos(ld, camX);

    /* ── Platforms ── */
    ld.platforms.forEach(p=>p.draw(ctx,camX));

    /* ── Flag ── */
    const fy=ld.platforms.find(p=>p.type==='ground'&&p.x<100)?.y||450;
    Sprites.flag(ctx, ld.flagX-camX, fy-220, this.flagReached);
/* ── 塞巴斯蒂安（只在最后一关出现）── */
if (this.levelIndex === this.levels.length - 1) {
    Sprites.sebastian(ctx, ld.flagX - camX - 20, fy - 80, 50, 80);
}
    /* ── Coins ── */
    ld.coins.forEach(c=>c.draw(ctx,camX));

    /* ── Power-ups ── */
    this.powerups.forEach(pu=>{if(!pu.collected)pu.draw(ctx,camX);});

    /* ── Enemies ── */
    ld.enemies.forEach(e=>e.draw(ctx,camX));

 /* ── Player ── */
if(this.brideTimer > 0 && this.levelIndex === this.levels.length - 1){
    // 画新娘（放大2倍）
    const bw = this.player.w * 2;
    const bh = this.player.h * 2;
    const bx = this.player.x - camX - (bw - this.player.w) / 2;
    const by = this.player.y + this.player.h - bh;
    Sprites.bride(ctx, bx, by, bw, bh);
} else {
    this.player.draw(ctx,camX);
}
    /* ── Particles ── */
    this.particles.draw(ctx,camX);

    /* ── Score popups ── */
    this.popups.forEach(p=>p.draw(ctx,camX));

    /* ── HUD ── */
    this._drawHUD(ld);

    /* ── Pause overlay ── */
    if(this.state==='paused') this._drawPause();
  }

  /* ── Background decorations ─────────────────────────── */
  _drawBgDecos(ld, camX) {
    // Clouds (parallax)
    ld.clouds.forEach(c=>{
      const px=(c.x-camX*0.4+ld.width*2)%(ld.width+200)-100;
      Sprites.cloud(ctx,px,c.y,c.s);
    });

    // Decorations (cactus, trees, etc.)
    ld.decos&&ld.decos.forEach(d=>{
      const dx=d.x-camX;
      if(dx>-80&&dx<W+80){
        if(d.type==='cactus') Sprites.cactus(ctx,dx,d.y);
        else if(d.type==='tree') Sprites.snowTree(ctx,dx,d.y);
      }
    });

    // Snow flakes
    if(ld.theme==='snow'){
      ctx.fillStyle='rgba(255,255,255,0.75)';
      for(let i=0;i<30;i++){
        const fx=((i*137+this.animT*0.5)%W);
        const fy=((i*89+this.animT*(0.5+i*0.03))%H);
        ctx.beginPath();ctx.arc(fx,fy,1.5+Math.sin(i)*1,0,Math.PI*2);ctx.fill();
      }
    }
    // Boss level lightning
    if(ld.theme==='boss'&&Math.random()<0.005){
      ctx.fillStyle='rgba(200,200,255,0.08)';
      ctx.fillRect(0,0,W,H);
    }
  }

  /* ── HUD ─────────────────────────────────────────────── */
_drawHUD(ld) {
    ctx.fillStyle='rgba(0,0,0,0.55)';
    ctx.fillRect(0,0,W,44);
    ctx.strokeStyle='rgba(255,215,0,0.3)';
    ctx.lineWidth=1;
    ctx.strokeRect(0,44,W,1);

    const pf='bold 13px monospace';
    ctx.font=pf; ctx.textBaseline='middle';

    // Score
    ctx.fillStyle='#aaa'; ctx.textAlign='left';  ctx.fillText('得分',10,13);
    ctx.fillStyle='#FFD700'; ctx.fillText(String(this.score).padStart(7,'0'),10,31);

    // Lives
    ctx.fillStyle='#aaa'; ctx.textAlign='center'; ctx.fillText('生命',120,13);
    ctx.fillStyle='#FF6B6B';
    for(let i=0;i<Math.min(this.lives,5);i++){
      Sprites.mario(ctx,100+i*22,20,16,20,0,1,false,true);
    }

    // Coins
    ctx.fillStyle='#aaa'; ctx.textAlign='center'; ctx.fillText('金币',280,13);
    Sprites.coin(ctx,255,20,16,16,this.animT);
    ctx.fillStyle='#FFD700'; ctx.fillText('×'+this.coins,285,31);

    // Level name
    ctx.fillStyle='#aaa'; ctx.textAlign='center'; ctx.fillText(ld.name,W/2,13);

    // Timer
    ctx.fillStyle='#aaa'; ctx.textAlign='right'; ctx.fillText('时间',W-10,13);
    ctx.fillStyle=this.timer<60?'#FF4444':'#00DDFF';
    ctx.fillText(String(this.timer).padStart(3,'0'),W-10,31);
// 道具提示
if (this.itemMsgTimer > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(W/2 - 140, 70, 280, 36);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.itemMessage, W/2, 88);
}
    // Star indicator
    if(this.player.star){
      ctx.fillStyle=`hsl(${this.animT*5%360},100%,70%)`;
      ctx.textAlign='center';
      ctx.font='bold 11px monospace';
      ctx.fillText('★ 无敌状态 ★',W/2,H-14);
    }

    // Big indicator
    // 加速状态
if(this.player.speedBoost){
    ctx.fillStyle = '#8B4513';
    ctx.textAlign = 'right';
    ctx.font = '11px monospace';
    ctx.fillText('☕ 加速!', W-10, H-14);
}
    if(this.player.big){
      ctx.fillStyle='#FF4444';
      ctx.textAlign='right';
      ctx.font='11px monospace';
      ctx.fillText('强化',W-10,H-14);
    }
  }

  /* ================================================================
     SCREENS
     ================================================================ */
  _drawStart() {
    // Animated sky background
    const grad=ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'#0f3460');
    grad.addColorStop(1,'#16213e');
    ctx.fillStyle=grad;
    ctx.fillRect(0,0,W,H);

    // Stars
    ctx.fillStyle='rgba(255,255,255,0.8)';
    for(let i=0;i<60;i++){
      const sx=(i*137)%W, sy=(i*89)%200;
      const r=Math.sin(this.animT*0.05+i)*0.5+0.7;
      ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fill();
    }

    // Ground
    Sprites.ground(ctx,0,420,W,80,'grass');

    // Clouds
    Sprites.cloud(ctx,50,80,1.2);
    Sprites.cloud(ctx,350,60,1);
    Sprites.cloud(ctx,600,90,1.4);

    // Walking Mario animation on start screen
    const mx=((this.animT*1.5)%900)-50;
    Sprites.mario(ctx,mx,390,28,36,this.animT,1,false);

    // Title panel
    ctx.fillStyle='rgba(0,0,0,0.75)';
    this._roundRect(ctx,W/2-240,130,480,200,16);
    ctx.fill();
    ctx.strokeStyle='rgba(255,215,0,0.6)';ctx.lineWidth=2;
    this._roundRect(ctx,W/2-240,130,480,200,16);
    ctx.stroke();

    // ★ SUPER ★
    ctx.fillStyle='#ccc';
    ctx.font='bold 18px monospace';
    ctx.textAlign='center';
    ctx.fillText('✦  张 嘎 的 冒 险  ✦',W/2,168);

    // MARIO ADVENTURE
    
    ctx.font='bold 44px monospace';
    const tg=ctx.createLinearGradient(W/2-200,180,W/2+200,230);
    tg.addColorStop(0,'#FFD700'); tg.addColorStop(0.5,'#FF6B35'); tg.addColorStop(1,'#FFD700');
    ctx.fillStyle=tg;
    ctx.fillText('张嘎的冒险',W/2,218);

    // Features
    ctx.font='11px monospace'; ctx.fillStyle='#99BBFF';
    ctx.fillText('收集金币 • 躲避小狗 • 送给塞巴斯蒂安',W/2,286);

    // Press SPACE
    const blink=Math.floor(this.animT/30)%2===0;
    if(blink){
      ctx.font='bold 15px monospace'; ctx.fillStyle='#FFD700';
     ctx.fillText('▶  按空格键或点击跳跃开始  ◀',W/2,316);
    }

    // Controls hint
    ctx.font='11px monospace'; ctx.fillStyle='rgba(255,255,255,0.5)';
   ctx.fillText('方向键/WASD：移动  空格/Z：跳跃  ESC：暂停',W/2,356);

    // Leaderboard preview
    const lb=this.getLeaderboard();
    if(lb.length>0){
      ctx.fillStyle='rgba(0,0,0,0.5)';
      this._roundRect(ctx,W/2-120,370,240,110,10);ctx.fill();
      ctx.fillStyle='#FFD700';ctx.font='bold 11px monospace';
      ctx.fillText('🏆 最高得分',W/2,388);
      lb.slice(0,3).forEach((e,i)=>{
        ctx.fillStyle=['#FFD700','#C0C0C0','#CD7F32'][i];
        ctx.font='10px monospace';
        ctx.fillText(`${i+1}. ${String(e.score).padStart(7,'0')}  W${e.level}  ${e.time}s`,W/2,408+i*18);
      });
    }

    // Start on space / jump input
    if(this.input.jumpPressed||this.input.jump){
      this._setState('playing');
      Audio.ctx&&Audio.ctx.resume();
    }
  }

  _drawGameOver() {
    ctx.fillStyle='rgba(10,0,0,0.92)';ctx.fillRect(0,0,W,H);

    ctx.font='bold 56px monospace';
    ctx.textAlign='center';
    const rg=ctx.createLinearGradient(0,160,0,230);
    rg.addColorStop(0,'#FF4444');rg.addColorStop(1,'#880000');
    ctx.fillStyle=rg;
    ctx.fillText('游戏结束',W/2,200);

    ctx.font='18px monospace';ctx.fillStyle='#aaa';
    ctx.fillText('最终得分: '+this.score,W/2,250);
    ctx.fillText('金币: '+this.coins+'   World: '+(this.levelIndex+1),W/2,278);

    // Leaderboard
    ctx.font='bold 14px monospace';ctx.fillStyle='#FFD700';
    ctx.fillText('── 最高得分 ──',W/2,315);
    const lb=this.getLeaderboard();
    lb.slice(0,5).forEach((e,i)=>{
      ctx.font='12px monospace';
      ctx.fillStyle=['#FFD700','#C0C0C0','#CD7F32','#fff','#aaa'][i];
      ctx.fillText(`${i+1}. ${String(e.score).padStart(7,'0')}  ×${e.coins}  W${e.level}`,W/2,338+i*19);
    });

    const blink=Math.floor(this.animT/35)%2===0;
    if(blink){ctx.font='bold 14px monospace';ctx.fillStyle='#fff';ctx.fillText('按空格键重新开始',W/2,H-40);}

    if(this.input.jumpPressed){
      this.score=0;this.coins=0;this.lives=3;
      this._loadLevel(0);this._setState('playing');
    }
  }

  _drawLevelClear() {
    // Background
    const ld=this.levelData;
    const grad=ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,ld.bgTop);grad.addColorStop(1,ld.bgBottom);
    ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(0,0,W,H);

    ctx.textAlign='center';
    ctx.font='bold 48px monospace';
    const cg=ctx.createLinearGradient(0,150,0,220);
    cg.addColorStop(0,'#FFD700');cg.addColorStop(1,'#FFA500');
    ctx.fillStyle=cg;
    ctx.fillText('关卡完成!',W/2,190);

    ctx.font='18px monospace';ctx.fillStyle='#fff';
    ctx.fillText('得分: '+this.score,W/2,240);
    ctx.fillText('金币: '+this.coins,W/2,268);
    ctx.fillText('剩余时间: '+this.timer,W/2,296);

    const blink=Math.floor(this.animT/30)%2===0;
    if(blink){ctx.font='bold 15px monospace';ctx.fillStyle='#FFD700';ctx.fillText('按空格进入下一关',W/2,H-50);}

    this.particles.update();
    this.particles.draw(ctx,0);
    if(Math.random()<0.15){
      this.particles.burst(Math.random()*W,Math.random()*H/2,
        `hsl(${Math.random()*360|0},100%,60%)`,6,0.8);
    }

    if(this.input.jumpPressed){
      this.levelIndex++;
      this._loadLevel(this.levelIndex);
      this._setState('playing');
    }
  }

  _drawWin() {
    ctx.fillStyle='rgba(0,10,0,0.92)';ctx.fillRect(0,0,W,H);

    // Rainbow text
    ctx.font='bold 52px monospace';
    ctx.textAlign='center';
    const wg=ctx.createLinearGradient(W/2-220,0,W/2+220,0);
    wg.addColorStop(0,'#FFD700');wg.addColorStop(0.33,'#FF4444');
    wg.addColorStop(0.66,'#4444FF');wg.addColorStop(1,'#44FF44');
    ctx.fillStyle=wg;
    ctx.fillText('你赢了! 🎉',W/2,160);

    ctx.font='22px monospace';ctx.fillStyle='#FFD700';
    ctx.fillText('恭喜通关!',W/2,210);
    ctx.font='16px monospace';ctx.fillStyle='#fff';
    ctx.fillText('最终得分: '+this.score,W/2,250);
    ctx.fillText('收集金币: '+this.coins,W/2,276);

    ctx.font='bold 13px monospace';ctx.fillStyle='#FFD700';
    ctx.fillText('── 光荣榜 ──',W/2,310);
    const lb=this.getLeaderboard();
    lb.slice(0,5).forEach((e,i)=>{
      ctx.font='12px monospace';
      ctx.fillStyle=['#FFD700','#C0C0C0','#CD7F32','#fff','#aaa'][i];
      ctx.fillText(`${i+1}. ${String(e.score).padStart(7,'0')}  ×${e.coins}  W${e.level}  ${e.time}s`,W/2,332+i*18);
    });

    const blink=Math.floor(this.animT/35)%2===0;
    if(blink){ctx.font='bold 14px monospace';ctx.fillStyle='#fff';ctx.fillText('按空格再玩一次呀',W/2,H-35);
        }

    this.particles.update();this.particles.draw(ctx,0);
    if(Math.random()<0.18){
      this.particles.burst(Math.random()*W,Math.random()*H,
        `hsl(${Math.random()*360|0},100%,65%)`,5,0.7);
    }

    if(this.input.jumpPressed){
      this.score=0;this.coins=0;this.lives=3;
      this._loadLevel(0);this._setState('playing');
    }
  }

  _drawPause() {
    ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(0,0,W,H);
    ctx.textAlign='center';
    ctx.font='bold 44px monospace';ctx.fillStyle='#fff';
    ctx.fillText('⏸ 已暂停',W/2,210);
    ctx.font='16px monospace';ctx.fillStyle='#aaa';
    ctx.fillText('按esc继续',W/2,260);
    ctx.fillText('得分: '+this.score+'   Lives: '+this.lives,W/2,295);
  }

  /* ── Rounded rect helper ─────────────────────────────── */
  _roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.closePath();
  }

  /* ================================================================
     GAME LOOP
     ================================================================ */
  run() {
    const loop=()=>{
      this.update();
      this.draw();
      requestAnimationFrame(loop);
    };
    loop();
  }
}

/* ── Bootstrap ────────────────────────────────────────── */
window.addEventListener('load', () => {
    window.game = new Game();
    window.game.run();
  // Resume audio on any click
  document.addEventListener('click', ()=>{
    if(Audio.ctx&&Audio.ctx.state==='suspended') Audio.ctx.resume();
  },{once:true});
});