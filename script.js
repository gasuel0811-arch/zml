// ========== 页面导航 ==========
function navigateTo(pageId) {
    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // 显示目标页面
    document.getElementById(pageId).classList.add('active');
    
    // 页面切换时滚动到顶部
    window.scrollTo(0, 0);
    
    // 播放点击音效
    playClickSound();
    
    // 如果进入留言板，显示已有留言
    if (pageId === 'wishes') {
        loadWishes();
    }
}

// ========== 背景音乐 ==========
let musicStarted = false;

// 用户点击任意位置时启动音乐
document.addEventListener('click', function initMusic() {
    const bgMusic = document.getElementById('bgMusic');
    if (!musicStarted && bgMusic.src) {
        bgMusic.play().catch(() => {});
        musicStarted = true;
    }
}, { once: true });

// ========== 点击音效（用 Web Audio API 生成） ==========
function playClickSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
        // 忽略音频错误
    }
}
window.onload = function() {
    createCandles();     // 生成蜡烛
    createBalloons();    // 生成气球
    
    // 定时刷新气球
    setInterval(() => {
        const existing = document.querySelectorAll('.balloons > div');
        if (existing.length < 8) {
            createBalloons();
        }
    }, 5000);
    
    // 尝试加载已有留言
    if (document.getElementById('wishWall')) {
        loadWishes();
    }
    
    // 检查视频是否存在
    const video = document.getElementById('birthdayVideo');
    const source = video.querySelector('source');
    if (source) {
        source.onerror = function() {
            video.style.display = 'none';
        };
    }
};
// ========== 🕯️ 蜡烛生成 ==========
const candleColors = ['#ff6b6b', '#ff9800', '#ffeb3b', '#4caf50', '#2196f3', '#9c27b0'];

function createCandles() {
    const container = document.getElementById('candlesContainer');
    container.innerHTML = '';
    
    candleColors.forEach((color, index) => {
        const candle = document.createElement('div');
        candle.className = 'candle';
        candle.style.background = color;
        
        // 火苗
        const flame = document.createElement('div');
        flame.className = 'candle-flame';
        flame.style.animationDelay = `${index * 0.1}s`;
        
        candle.appendChild(flame);
        container.appendChild(candle);
    });
}

// ========== 🎈 气球生成 ==========
const balloonColors = ['#ff6b6b', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#ff4081', '#ff5252', '#ffd740'];

function createBalloons() {
    const balloonArea = document.getElementById('balloonArea');
    const balloonCount = 15;  // 增加数量
    
    for (let i = 0; i < balloonCount; i++) {
        setTimeout(() => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                position: absolute;
                bottom: -130px;
                left: ${Math.random() * 92 + 4}%;
                animation: balloon-rise ${8 + Math.random() * 5}s linear forwards;
                animation-delay: ${Math.random() * 2}s;
                z-index: 0;
                text-align: center;
                opacity: ${0.7 + Math.random() * 0.3};
            `;
            
            // 气球
            const balloon = document.createElement('div');
            balloon.className = 'balloon';
            const color = balloonColors[Math.floor(Math.random() * balloonColors.length)];
            balloon.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), ${color})`;
            
            // 绳子（简洁直线）
            const string = document.createElement('div');
            string.style.cssText = `
                width: 2px;
                height: 30px;
                background: rgba(0,0,0,0.2);
                margin: 0 auto;
            `;
            
            wrapper.appendChild(balloon);
            wrapper.appendChild(string);
            balloonArea.appendChild(wrapper);
            
            // 动画结束后移除
            setTimeout(() => {
                wrapper.remove();
            }, 15000);
        }, i * 250);
    }
}
// ========== 📸 照片数据（编辑这里！） ==========
const memories = [
    {
        title: '回忆 1',
        description: '在这里写下属于你们的第一段回忆故事……',
        photo: 'photos/photo1.jpg'  // 替换成你的照片
    },
    {
        title: '回忆 2',
        description: '写下第二段回忆……',
        photo: 'photos/photo2.jpg'
    },
    {
        title: '回忆 3',
        description: '写下第三段回忆……',
        photo: 'photos/photo3.jpg'
    },
    {
        title: '回忆 4',
        description: '写下第四段回忆……',
        photo: 'photos/photo4.jpg'
    },
    {
        title: '回忆 5',
        description: '写下第五段回忆……',
        photo: 'photos/photo5.jpg'
    },
    {
        title: '回忆 6',
        description: '写下第六段回忆……',
        photo: 'photos/photo6.jpg'
    }
];

// ========== 打开/关闭回忆弹窗 ==========
function openMemory(index) {
    const memory = memories[index];
    if (!memory) return;
    
    document.getElementById('memoryImage').src = memory.photo;
    document.getElementById('memoryTitle').textContent = memory.title;
    document.getElementById('memoryDescription').textContent = memory.description;
    
    document.getElementById('memoryModal').classList.add('show');
}

function closeMemory() {
    document.getElementById('memoryModal').classList.remove('show');
}

// ========== ✨ 留言板功能 ==========
function addWish() {
    const name = document.getElementById('wishName').value.trim();
    const text = document.getElementById('wishText').value.trim();
    
    if (!name || !text) {
        alert('请填写名字和祝福内容哦！💝');
        return;
    }
    
    const wishes = JSON.parse(localStorage.getItem('birthdayWishes') || '[]');
    
    wishes.push({
        name: name,
        text: text,
        time: new Date().toLocaleString('zh-CN')
    });
    
    localStorage.setItem('birthdayWishes', JSON.stringify(wishes));
    
    // 清空输入框
    document.getElementById('wishName').value = '';
    document.getElementById('wishText').value = '';
    
    // 重新加载留言
    loadWishes();
    
    // 播放欢呼特效
    showConfetti();
}

// ========== 加载留言 ==========
function loadWishes() {
    const wishes = JSON.parse(localStorage.getItem('birthdayWishes') || '[]');
    const wall = document.getElementById('wishWall');
    
    wall.innerHTML = '';
    
    if (wishes.length === 0) {
        wall.innerHTML = '<p style="color: #888; text-align: center;">还没有祝福哦，快来写第一条吧！💝</p>';
        return;
    }
    
    wishes.reverse().forEach((wish, index) => {
        const card = document.createElement('div');
        card.className = 'wish-card';
        card.style.animationDelay = index * 0.1 + 's';
        card.innerHTML = `
            <div class="wish-name">💝 ${wish.name}</div>
            <div class="wish-text">${wish.text}</div>
            <div class="wish-time">${wish.time}</div>
        `;
        wall.appendChild(card);
    });
}

// ========== 🎊 彩带撒花效果 ==========
function showConfetti() {
    const colors = ['#ff6b6b', '#ff9800', '#ffeb3b', '#4caf50', '#2196f3', '#9c27b0', '#ff4081'];
    
    for (let i = 0; i < 30; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.style.cssText = `
                position: fixed;
                width: 10px;
                height: 10px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                left: ${Math.random() * 100}%;
                top: -10px;
                border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
                z-index: 1000;
                animation: confettiFall ${1 + Math.random() * 2}s ease-in;
                pointer-events: none;
            `;
            document.body.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 4000);
        }, i * 50);
    }
}

// 添加彩带动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes confettiFall {
        0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
        100% { transform: translateY(100vh) rotate(720deg) scale(0.5); opacity: 0; }
    }
`;
document.head.appendChild(style);


// 页面加载时生成气球
// ========== 初始化 ==========
// (已在上方 window.onload 中处理，这里不重复)
// 删除或保留为空都可以
// ========== 🎮 游戏功能 ==========
function startGame(gameId) {
    if (gameId === 'mario') {
        alert('🎮 马里奥游戏正在开发中！\n\n先看看其他内容吧～');
        playClickSound();
    }
}

// 📌 导航到 game 页面时也播放点击音效
// 修改 navigateTo 函数，添加对 games 页的支持
// 原来的 navigateTo 函数不用改，因为 games 页面已经存在于 DOM 里了

