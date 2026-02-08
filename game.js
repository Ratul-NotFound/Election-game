const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const p1HealthEl = document.getElementById('p1-health');
const p2HealthEl = document.getElementById('p2-health');
const p1NameEl = document.getElementById('p1-name');
const p2NameEl = document.getElementById('p2-name');
const landingScreen = document.getElementById('landing-screen');
const gameScreen = document.getElementById('game-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const charCards = document.querySelectorAll('.char-card');
const ammoOptions = document.querySelectorAll('.ammo-option');

// --- FIREBASE STATS MANAGER ---
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, runTransaction } from "firebase/database";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

class StatsManager {
    static db = null;
    static totalGamesRef = null;
    static abbasWinsRef = null;
    static nasirWinsRef = null;

    static init() {
        // Check if user has configured keys
        if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY_HERE") {
            console.log("Firebase not configured. Using LocalStorage.");
            this.updateUIFromLocal();
            return;
        }

        try {
            const app = initializeApp(firebaseConfig);
            const db = getDatabase(app);
            this.db = db;

            this.totalGamesRef = ref(db, 'stats/totalGames');
            this.abbasWinsRef = ref(db, 'stats/abbasWins');
            this.nasirWinsRef = ref(db, 'stats/nasirWins');

            // Listen for updates
            onValue(this.totalGamesRef, (snap) => {
                document.getElementById('stat-total').innerText = snap.val() || 0;
            });
            onValue(this.abbasWinsRef, (snap) => {
                document.getElementById('stat-abbas').innerText = snap.val() || 0;
            });
            onValue(this.nasirWinsRef, (snap) => {
                document.getElementById('stat-nasir').innerText = snap.val() || 0;
            });

        } catch (e) {
            console.error("Firebase Init Error:", e);
            this.updateUIFromLocal();
        }
    }

    static recordResult(winner) {
        // LocalStorage (Always update local)
        let localTotal = parseInt(localStorage.getItem('totalGames') || 0) + 1;
        localStorage.setItem('totalGames', localTotal);

        if (winner === 'Abbas') {
            let localWins = parseInt(localStorage.getItem('abbasWins') || 0) + 1;
            localStorage.setItem('abbasWins', localWins);
        } else if (winner === 'Nasir') {
            let localWins = parseInt(localStorage.getItem('nasirWins') || 0) + 1;
            localStorage.setItem('nasirWins', localWins);
        }

        // Firebase (If configured)
        if (this.db) {
            runTransaction(this.totalGamesRef, (current) => (current || 0) + 1);
            if (winner === 'Abbas') {
                runTransaction(this.abbasWinsRef, (current) => (current || 0) + 1);
            } else if (winner === 'Nasir') {
                runTransaction(this.nasirWinsRef, (current) => (current || 0) + 1);
            }
        } else {
            this.updateUIFromLocal();
        }
    }

    static updateUIFromLocal() {
        document.getElementById('stat-total').innerText = localStorage.getItem('totalGames') || 0;
        document.getElementById('stat-abbas').innerText = localStorage.getItem('abbasWins') || 0;
        document.getElementById('stat-nasir').innerText = localStorage.getItem('nasirWins') || 0;
    }
}

// Game State
let gameActive = false;
let player, opponent;
let projectiles = [];
let particles = [];
let clouds = [];
let keys = {}; // Track pressed keys

// Initialize clouds
for (let i = 0; i < 5; i++) {
    clouds.push({
        x: Math.random() * 1200,
        y: 50 + Math.random() * 150,
        speed: 0.2 + Math.random() * 0.5,
        size: 50 + Math.random() * 80
    });
}

class Particle {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'sweat', 'star'
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.life = 60;
        this.size = Math.random() * 5 + 2;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2; // Gravity
        this.life--;
        return this.life > 0;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life / 60;
        if (this.type === 'sweat') {
            ctx.fillStyle = '#00ffff';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'star') {
            ctx.fillStyle = '#ffff00';
            ctx.translate(this.x, this.y);
            ctx.rotate(this.life * 0.1);
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                ctx.lineTo(Math.cos((18 + i * 72) / 180 * Math.PI) * 10, -Math.sin((18 + i * 72) / 180 * Math.PI) * 10);
                ctx.lineTo(Math.cos((54 + i * 72) / 180 * Math.PI) * 4, -Math.sin((54 + i * 72) / 180 * Math.PI) * 4);
            }
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'dust') {
            ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * GAME_SCALE * (2 - this.life / 60), 0, Math.PI * 2); // Expand
            ctx.fill();
        }
        ctx.restore();
    }
}

function spawnParticles(x, y, type, count = 5) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, type));
    }
}
let gravity = 0.5;
let selectedCandidate = 'abbas';
let currentAmmo = 'egg';
let animationFrameId = null;
let gameTimer = 0;



// Assets
const abbasImg = new Image(); abbasImg.src = '/assets/images/Abbas.png';
const nasirImg = new Image(); nasirImg.src = '/assets/images/Nasir.png';

// Audio
const bgMusic = document.getElementById('bg-music');
const hitSound = document.getElementById('hit-sound');
const failSound = document.getElementById('fail-sound');

let audioCtx, gainNode;
function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 2.5; // BOOST FACTOR: Amplifying hit sounds
    gainNode.connect(audioCtx.destination);
}

// Touch & Mouse Controls Logic
const touchMap = {
    'btn-left': 'ArrowLeft',
    'btn-right': 'ArrowRight',
    'btn-jump': ' ',
    'btn-dash': 'Shift'
};

Object.keys(touchMap).forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;

    const activate = (e) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        keys[touchMap[id]] = true;
        btn.classList.add('active');

        // Handle Jump immediately
        if (touchMap[id] === ' ' && player.onGround && gameActive) {
            player.vy = -12 * GAME_SCALE;
        }
    };

    const deactivate = (e) => {
        if (e.cancelable) e.preventDefault();
        keys[touchMap[id]] = false;
        btn.classList.remove('active');
    };

    // Touch Events
    btn.addEventListener('touchstart', activate, { passive: false });
    btn.addEventListener('touchend', deactivate);

    // Mouse Events (For Desktop/Hybrid)
    btn.addEventListener('mousedown', activate);
    btn.addEventListener('mouseup', deactivate);
    btn.addEventListener('mouseleave', deactivate);
});

// Character Selection
charCards.forEach(card => {
    card.addEventListener('click', () => {
        charCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedCandidate = card.dataset.candidate;
    });
});

// Ammo Selection
ammoOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        ammoOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        currentAmmo = opt.dataset.ammo;
    });
});

let GAME_SCALE = 1;
let GROUND_Y = 0;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Calculate scale based on a reference resolution (e.g., 1280x720)
    // We use min to ensure the whole game fits on screen
    GAME_SCALE = Math.min(canvas.width / 1200, canvas.height / 700);
    if (GAME_SCALE > 1.2) GAME_SCALE = 1.2; // Cap scale for huge screens
    if (GAME_SCALE < 0.5) GAME_SCALE = 0.5; // Floor scale for tiny screens

    GROUND_Y = canvas.height * 0.85;

    // Reposition and rescale fighters on resize
    if (player) {
        let pRatioX = player.x / (canvas.width || 1);
        player.width = player.baseWidth * GAME_SCALE;
        player.height = player.baseHeight * GAME_SCALE;
        player.x = Math.max(0, Math.min(pRatioX * canvas.width, canvas.width - player.width));
        player.y = GROUND_Y - player.height;
        mouseX = player.x + player.width / 2;
        mouseY = player.y + player.height / 2;
    }
    if (opponent) {
        let oRatioX = opponent.x / (canvas.width || 1);
        opponent.width = opponent.baseWidth * GAME_SCALE;
        opponent.height = opponent.baseHeight * GAME_SCALE;
        opponent.x = Math.max(0, Math.min(oRatioX * canvas.width, canvas.width - opponent.width));
        opponent.y = GROUND_Y - opponent.height;
    }
}
window.addEventListener('resize', resize);
resize();

class Fighter {
    constructor(isPlayer, type) {
        this.isPlayer = isPlayer;
        this.type = type;
        this.baseWidth = 100;
        this.baseHeight = 200;
        this.width = this.baseWidth * GAME_SCALE;
        this.height = this.baseHeight * GAME_SCALE;

        this.x = isPlayer ? canvas.width * 0.15 : canvas.width * 0.85 - this.width;
        this.y = GROUND_Y - this.height;

        this.maxHealth = 1000;
        this.health = 1000;
        this.img = type === 'abbas' ? abbasImg : nasirImg;
        this.vy = 0;
        this.onGround = true;
        this.cooldown = 0;
        this.throwingTimer = 0;
        this.hitStun = 0;
        this.hitMarks = [];
        this.vx = 0;
        this.rotation = 0;
        this.muzzleFlash = 0;
        this.facing = 1;
    }

    update() {
        const target = this.isPlayer ? opponent : player;
        if (target) {
            const thisCenter = this.x + this.width / 2;
            const targetCenter = target.x + target.width / 2;
            this.facing = targetCenter >= thisCenter ? 1 : -1;
        }

        // Friction / Knockback dampening
        this.vx *= 0.9;
        this.x += this.vx;

        // Boundaries
        if (this.x < 0) this.x = 0;
        if (this.x > canvas.width - this.width) this.x = canvas.width - this.width;

        // Torso Lean (Based on hit stun or velocity)
        if (this.hitStun > 0) {
            this.rotation = (this.vx * -0.05); // Lean back from hit
        } else {
            this.rotation *= 0.8; // Return to upright
        }

        if (this.hitStun > 0) {
            this.hitStun--;
            return; // Stunned!
        }

        if (this.throwingTimer > 0) this.throwingTimer--;
        if (this.muzzleFlash > 0) this.muzzleFlash--;

        // Update hit marks
        this.hitMarks = this.hitMarks.filter(mark => {
            mark.life--;
            return mark.life > 0;
        });

        // Gravity
        this.y += this.vy;
        const groundLimit = GROUND_Y - this.height;
        if (this.y < groundLimit) {
            this.vy += gravity * GAME_SCALE;
            this.onGround = false;
        } else {
            this.y = groundLimit;
            this.vy = 0;
            this.onGround = true;

            // Slide dust
            if (Math.abs(this.vx) > 2) {
                spawnParticles(this.x + this.width / 2, this.y + this.height * 0.95, 'dust', 1);
            }
        }

        // Player Movement Logic
        if (this.isPlayer && gameActive) {
            let speed = 5 * GAME_SCALE;
            if (keys['Shift']) {
                speed = 12 * GAME_SCALE; // SPRINT!
                // Sprint Dust
                if (this.onGround && Math.abs(this.vx) > 0 && Math.random() < 0.3) {
                    spawnParticles(this.x + this.width / 2, this.y + this.height * 0.95, 'dust', 1);
                }
            }

            if (keys['ArrowLeft'] || keys['a'] || keys['A']) this.vx = -speed;
            if (keys['ArrowRight'] || keys['d'] || keys['D']) this.vx = speed;
        }

        // AI Logic
        if (!this.isPlayer && gameActive) {
            this.cooldown++;
            this.reactionTimer = (this.reactionTimer || 0) + 1;
            this.jumpCooldown = (this.jumpCooldown || 0);
            if (this.jumpCooldown > 0) this.jumpCooldown--;
            this.dodgeCooldown = (this.dodgeCooldown || 0);
            if (this.dodgeCooldown > 0) this.dodgeCooldown--;
            this.aiStateTimer = (this.aiStateTimer || 0) + 1;
            if (!this.aiState) this.aiState = 'pace';

            // Direction toward and away from player
            const toPlayerDir = player.x > this.x ? -1 : 1; // away direction
            const towardPlayer = -toPlayerDir; // toward direction
            let distToPlayer = Math.abs(this.x - player.x);

            // 1. SMART MOVEMENT (State Machine)
            if (this.onGround) {
                // Switch AI state periodically
                if (this.aiStateTimer > 60 + Math.random() * 80) {
                    this.aiStateTimer = 0;
                    const rand = Math.random();
                    if (distToPlayer < 250) this.aiState = 'retreat';
                    else if (distToPlayer > 700) this.aiState = 'approach';
                    else if (rand < 0.4) this.aiState = 'pace';
                    else if (rand < 0.7) this.aiState = 'strafe';
                    else this.aiState = 'hold';
                }

                if (this.aiState === 'retreat') {
                    this.vx = toPlayerDir * 3.5; // Back off
                    if (distToPlayer > 450) this.aiState = 'pace';
                } else if (this.aiState === 'approach') {
                    this.vx = towardPlayer * 2.5;
                    if (distToPlayer < 500) this.aiState = 'pace';
                } else if (this.aiState === 'pace') {
                    // Gentle side-to-side pacing
                    if (Math.random() < 0.03) this.vx = (Math.random() - 0.5) * 4;
                } else if (this.aiState === 'strafe') {
                    // Quick lateral movement
                    if (Math.random() < 0.05) this.vx = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 2);
                } else {
                    // 'hold' — stand still, focus on aiming
                    this.vx *= 0.8;
                }
            }

            // 2. SMART DODGE (Mostly sidestep, rare jump)
            if (this.reactionTimer > 8 && this.dodgeCooldown <= 0) {
                const threat = projectiles.find(p => {
                    if (!p.isPlayer || !p.active) return false;
                    let dist = Math.abs(p.x - this.x);
                    if (dist > 300) return false;
                    return (p.vx > 0 && p.x < this.x) || (p.vx < 0 && p.x > this.x);
                });
                if (threat) {
                    const dodgeRoll = Math.random();
                    if (dodgeRoll < 0.55) {
                        // SIDESTEP (most common) — move laterally
                        this.vx = toPlayerDir * (6 + Math.random() * 3);
                        this.dodgeCooldown = 25;
                        if (Math.random() < 0.4) showFloatingText("ধুর!", this.x, this.y - 40);
                    } else if (dodgeRoll < 0.75) {
                        // DUCK/CROUCH dodge — just change nothing visually but avoid
                        this.vx = towardPlayer * 4; // Rush under the projectile
                        this.dodgeCooldown = 30;
                    } else if (dodgeRoll < 0.90 && this.onGround && this.jumpCooldown <= 0) {
                        // JUMP (rare, only if on ground and cooldown is done)
                        this.vy = -12 * GAME_SCALE;
                        this.vx = toPlayerDir * 3;
                        this.jumpCooldown = 90; // Can't jump again for 90 frames (~1.5s)
                        this.dodgeCooldown = 40;
                        showFloatingText("ধুর!", this.x, this.y - 40);
                    } else {
                        // No dodge (miss/fail ~10%)
                        this.dodgeCooldown = 15;
                    }
                }
                this.reactionTimer = 0;
            }

            // 3. OFFENSE (Throw / Gun Mode)
            let isGunMode = this.health < (this.maxHealth * 0.4);
            let aggressionRate = isGunMode ? 35 : (80 - ((this.maxHealth - this.health) / this.maxHealth) * 30);
            aggressionRate = Math.max(aggressionRate, 25); // Minimum cooldown

            if (this.cooldown > aggressionRate) {
                this.throwProjectile();
                this.cooldown = -Math.random() * (isGunMode ? 10 : 25);
            }
        }
    }

    draw() {
        // 1. Draw Shadow (Absolute coordinates, beneath character)
        const groundY = GROUND_Y;
        let shadowWidth = (this.width * 0.6) * (1 - (groundY - (this.y + this.height)) / (400 * GAME_SCALE));
        let shadowAlpha = 0.3 * (1 - (groundY - (this.y + this.height)) / (400 * GAME_SCALE));

        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(this.x + this.width / 2, groundY, Math.max(0, shadowWidth), 10 * GAME_SCALE, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. Main Character Context (Local Space)
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height * 0.75); // Pivot at Hips
        ctx.scale(GAME_SCALE, GAME_SCALE);

        // Body tilt (Knockback/Throw)
        let tilt = this.rotation;
        if (this.throwingTimer > 5) tilt += (this.isPlayer ? -0.1 : 0.1);
        ctx.rotate(tilt);

        // Stun shake
        if (this.hitStun > 0) ctx.translate((Math.random() - 0.5) * 5, 0);

        // Colors
        let mainColor = this.type === 'abbas' ? '#006a4e' : '#f42a41';
        let darkColor = this.type === 'abbas' ? '#004a2e' : '#c41a31';
        let lightColor = this.type === 'abbas' ? '#008a6e' : '#ff4a51';
        let skinColor = '#ffdbac';

        // --- TORSO ---
        let torsoGrad = ctx.createLinearGradient(-25, -70, 25, 0);
        torsoGrad.addColorStop(0, mainColor);
        torsoGrad.addColorStop(0.5, lightColor);
        torsoGrad.addColorStop(1, darkColor);

        ctx.fillStyle = torsoGrad;
        ctx.beginPath();
        ctx.moveTo(-15, -75); // Neck Base (Local 0,0 is hips)
        ctx.quadraticCurveTo(-30, -60, -25, -20); // Left side
        ctx.quadraticCurveTo(-30, 0, -20, 0); // Hem left
        ctx.lineTo(20, 0); // Hem right
        ctx.quadraticCurveTo(45, -30, 25, -75); // Right side (bulge)
        ctx.fill();

        // Collar
        ctx.fillStyle = darkColor;
        ctx.beginPath();
        ctx.moveTo(-15, -75);
        ctx.lineTo(-10, -80);
        ctx.lineTo(10, -80);
        ctx.lineTo(15, -75);
        ctx.quadraticCurveTo(0, -65, -15, -75);
        ctx.fill();

        // Buttons
        ctx.fillStyle = "rgba(0,0,0,0.1)"; // Placket
        ctx.fillRect(-2, -75, 5, 60);
        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.beginPath(); ctx.arc(1, -65 + (i * 14), 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, -66 + (i * 14), 2.5, 0, Math.PI * 2); ctx.fill();
        }

        // --- ARMS ---
        let armGrad = ctx.createLinearGradient(-10, 0, 10, 0);
        armGrad.addColorStop(0, darkColor); armGrad.addColorStop(0.5, mainColor); armGrad.addColorStop(1, darkColor);

        // Left Arm (Relative to torso)
        ctx.save();
        ctx.translate(-30, -70); // Shoulder left
        if (this.hitStun > 0) ctx.rotate(-2.5);
        ctx.fillStyle = armGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.lineTo(22, 35); ctx.quadraticCurveTo(10, 40, -2, 35); ctx.fill();
        ctx.fillStyle = skinColor;
        ctx.beginPath(); ctx.moveTo(2, 35); ctx.lineTo(2, 45); ctx.quadraticCurveTo(8, 55, 18, 45); ctx.lineTo(18, 35); ctx.fill();
        ctx.beginPath(); ctx.moveTo(18, 38); ctx.quadraticCurveTo(24, 42, 18, 48); ctx.fill();
        ctx.restore();

        // Right Arm
        ctx.save();
        ctx.translate(30, -70); // Shoulder right
        if (this.hitStun > 0) ctx.rotate(2.5);
        else if (this.throwingTimer > 0) ctx.rotate(this.isPlayer ? Math.sin((15 - this.throwingTimer) / 10 * Math.PI) * 1.5 : -Math.sin((15 - this.throwingTimer) / 10 * Math.PI) * 1.5);

        let isGunMode = this.health < (this.maxHealth * 0.4);
        // Gun Pointing
        if (isGunMode) {
            let aimAngle = 0;
            if (this.isPlayer) {
                const hand = getThrowOrigin(this);
                let dx = mouseX - hand.x;
                let dy = mouseY - hand.y;
                aimAngle = Math.atan2(dy, dx);
            } else {
                let dx = player.x - this.x;
                let dy = (player.y + 80) - (this.y + 80);
                aimAngle = Math.atan2(dy, dx);
                if (!this.isPlayer) aimAngle = Math.PI - aimAngle; // AI faces left
            }
            // Clamp angle for arm
            if (this.isPlayer) {
                if (this.facing === 1) {
                    aimAngle = Math.max(-0.5, Math.min(0.5, aimAngle));
                } else {
                    const minLeft = Math.PI - 0.5;
                    const maxLeft = Math.PI + 0.5;
                    if (aimAngle < 0) aimAngle += Math.PI * 2;
                    aimAngle = Math.max(minLeft, Math.min(maxLeft, aimAngle));
                }
            }
            ctx.rotate(aimAngle);
        }

        ctx.fillStyle = armGrad;
        ctx.beginPath();
        ctx.moveTo(-20, 0); ctx.lineTo(0, 0); ctx.lineTo(3, 35); ctx.quadraticCurveTo(-10, 40, -22, 35); ctx.fill();
        ctx.fillStyle = skinColor;
        ctx.beginPath(); ctx.moveTo(-2, 35); ctx.lineTo(-2, 45); ctx.quadraticCurveTo(-10, 55, -20, 45); ctx.lineTo(-20, 35); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-20, 38); ctx.quadraticCurveTo(-26, 42, -20, 48); ctx.fill();

        // DRAW AK47
        if (isGunMode) {
            ctx.save();
            ctx.translate(-15, 30); // Hand position
            ctx.rotate(this.isPlayer ? 0 : Math.PI); // Flip for opponent

            // Stock
            ctx.fillStyle = "#8d6e63";
            ctx.fillRect(-10, 0, 15, 8);

            // Body
            ctx.fillStyle = "#222";
            ctx.fillRect(5, -2, 25, 12);

            // Clip (Magazine)
            ctx.fillStyle = "#111";
            ctx.beginPath(); ctx.moveTo(15, 10); ctx.quadraticCurveTo(20, 25, 10, 25); ctx.lineTo(10, 10); ctx.fill();

            // Barrel
            ctx.fillStyle = "#555";
            ctx.fillRect(30, 0, 20, 4);

            // Muzzle Flash
            if (this.muzzleFlash > 0) {
                ctx.fillStyle = `rgba(255, 255, 0, ${this.muzzleFlash / 5})`;
                ctx.beginPath();
                ctx.arc(55, 2, 10 + Math.random() * 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "white";
                ctx.beginPath();
                ctx.arc(55, 2, 5, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }

        ctx.restore();

        // --- LEGS (Attached to hips) ---
        let legGrad = ctx.createLinearGradient(-20, 0, 20, 0);
        legGrad.addColorStop(0, "#eee"); legGrad.addColorStop(0.5, "#fff"); legGrad.addColorStop(1, "#ddd");
        let legOffset = 0;
        if (this.hitStun > 0) legOffset = Math.sin(Date.now() / 50) * 10;
        else if (Math.abs(this.vx) > 1) legOffset = this.vx * 2;

        ctx.save();
        ctx.translate(-15, 0); // Left hip
        ctx.rotate(legOffset * 0.05);
        ctx.fillStyle = legGrad;
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.bezierCurveTo(-25, 10, -15, 30, -5, 42); ctx.lineTo(8, 42); ctx.bezierCurveTo(15, 20, 5, 10, 10, 0); ctx.fill();
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.moveTo(-8, 42); ctx.lineTo(10, 42); ctx.lineTo(12, 50); ctx.lineTo(-12, 52); ctx.quadraticCurveTo(-14, 45, -8, 42); ctx.fill();
        ctx.fillStyle = '#444'; ctx.fillRect(-12, 52, 24, 3);
        ctx.restore();

        ctx.save();
        ctx.translate(15, 0); // Right hip
        ctx.rotate(-legOffset * 0.05);
        ctx.fillStyle = legGrad;
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.bezierCurveTo(-5, 10, -5, 20, -5, 42); ctx.lineTo(13, 42); ctx.bezierCurveTo(25, 30, 20, 10, 15, 0); ctx.fill();
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.moveTo(-8, 42); ctx.lineTo(10, 42); ctx.lineTo(14, 52); ctx.lineTo(-8, 50); ctx.quadraticCurveTo(-10, 45, -8, 42); ctx.fill();
        ctx.fillStyle = '#444'; ctx.fillRect(-8, 50, 24, 3);
        ctx.restore();

        // --- HEAD (Nested in Body transformation) ---
        ctx.save();
        ctx.translate(0, -75); // At neck position

        let headWhiplash = 0;
        if (this.hitStun > 0) headWhiplash = this.rotation; // Recoil tilt
        ctx.rotate(headWhiplash);

        // Bobbing handle
        let bob = (this.throwingTimer > 5) ? 5 : 0;
        ctx.drawImage(this.img, -42.5, -85 + bob, 85, 85);
        ctx.restore();

        // Labels (Absolute-ish but relative to pivot)
        ctx.fillStyle = "white";
        ctx.font = "bold 14px Hind Siliguri";
        ctx.textAlign = "center";
        ctx.fillText(this.isPlayer ? "আপনি" : "র‍্যাইভাল", 0, -165);

        ctx.restore(); // End Character Context

        // Draw Hit Marks (Splats/Scratches)
        // Draw Hit Marks (Splats/Scratches)
        this.hitMarks.forEach(mark => {
            ctx.save();
            let alpha = mark.life / 60;
            ctx.globalAlpha = alpha;

            const mx = this.x + mark.relX * GAME_SCALE;
            const my = this.y + mark.relY * GAME_SCALE;

            if (mark.type === 'egg') {
                // --- HYPER REALISTIC EGG SPLAT ---
                ctx.fillStyle = "#fdfdfd";
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    let angle = (i / 8) * Math.PI * 2;
                    let rad = (15 + Math.sin(mark.seed * i + mark.life) * 5) * GAME_SCALE;
                    let px = mx + Math.cos(angle) * rad;
                    let py = my + Math.sin(angle) * rad * 0.8;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.quadraticCurveTo(mx, my, px, py);
                }
                ctx.fill();

                ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
                ctx.beginPath(); ctx.arc(mx - 2 * GAME_SCALE, my - 5 * GAME_SCALE, 10 * GAME_SCALE, 0, Math.PI * 2); ctx.fill();

                ctx.fillStyle = "#ffb300";
                ctx.beginPath(); ctx.arc(mx, my, 8 * GAME_SCALE, 0, Math.PI * 2); ctx.fill();

                let dripLen = (60 - mark.life) * 0.8 * GAME_SCALE;
                ctx.fillStyle = "rgba(255, 200, 0, 0.8)";
                for (let k = 0; k < 2; k++) {
                    let dx = Math.cos(mark.seed * k) * 8 * GAME_SCALE;
                    ctx.beginPath();
                    ctx.moveTo(mx + dx, my + 5 * GAME_SCALE);
                    ctx.lineTo(mx + dx - 2 * GAME_SCALE, my + dripLen + 10 * GAME_SCALE);
                    ctx.lineTo(mx + dx + 2 * GAME_SCALE, my + dripLen + 10 * GAME_SCALE);
                    ctx.fill();
                }
            } else if (mark.type === 'banana') {
                // --- NANO BANANA PEELED SPLAT ---
                ctx.fillStyle = "#ffd600";
                for (let i = 0; i < 4; i++) {
                    let angle = (i / 4) * Math.PI * 2 + mark.seed;
                    ctx.save();
                    ctx.translate(mx, my);
                    ctx.rotate(angle);
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(15 * GAME_SCALE, -15 * GAME_SCALE, 25 * GAME_SCALE, 0); ctx.quadraticCurveTo(15 * GAME_SCALE, 15 * GAME_SCALE, 0, 0); ctx.fill();
                    ctx.fillStyle = "#5d4037"; ctx.beginPath(); ctx.arc(15 * GAME_SCALE, 2 * GAME_SCALE, 1.5 * GAME_SCALE, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
                ctx.fillStyle = "#fffde7"; ctx.beginPath(); ctx.arc(mx, my, 6 * GAME_SCALE, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "rgba(255, 245, 157, 0.6)";
                for (let j = 0; j < 5; j++) {
                    ctx.beginPath(); ctx.arc(mx + Math.cos(mark.seed * j) * 8 * GAME_SCALE, my + Math.sin(mark.seed * j) * 8 * GAME_SCALE, 4 * GAME_SCALE, 0, Math.PI * 2); ctx.fill();
                }
            } else if (mark.type === 'tomato') {
                // --- TOMATO LYCOPENIC EXPLOSION ---
                ctx.fillStyle = "#c62828";
                ctx.beginPath();
                for (let i = 0; i < 10; i++) {
                    let angle = (i / 10) * Math.PI * 2;
                    let rad = (18 + Math.sin(mark.seed * i) * 7) * GAME_SCALE;
                    let px = mx + Math.cos(angle) * rad;
                    let py = my + Math.sin(angle) * rad;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.quadraticCurveTo(mx, my, px, py);
                }
                ctx.fill();

                ctx.fillStyle = "#ffeb3b";
                for (let s = 0; s < 6; s++) {
                    let sx = mx + (Math.cos(mark.seed + s) * 10 * GAME_SCALE);
                    let sy = my + (Math.sin(mark.seed + s) * 10 * GAME_SCALE);
                    ctx.beginPath(); ctx.ellipse(sx, sy, 3 * GAME_SCALE, 2 * GAME_SCALE, mark.seed + s, 0, Math.PI * 2); ctx.fill();
                }

                ctx.fillStyle = "rgba(183, 28, 28, 0.5)";
                for (let g = 0; g < 4; g++) {
                    let gx = mx + (Math.cos(mark.seed * g) * 20 * GAME_SCALE);
                    let gy = my + (Math.sin(mark.seed * g) * 20 * GAME_SCALE);
                    ctx.beginPath(); ctx.arc(gx, gy, 6 * GAME_SCALE, 0, Math.PI * 2); ctx.fill();
                }
            } else {
                // --- PROCEDURAL BRUISE ---
                let bruiseGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 28 * GAME_SCALE);
                bruiseGrad.addColorStop(0, "rgba(50, 0, 80, 0.4)");
                bruiseGrad.addColorStop(1, "rgba(200, 50, 50, 0)");
                ctx.fillStyle = bruiseGrad;
                ctx.beginPath();
                for (let b = 0; b < 6; b++) {
                    let ang = (b / 6) * Math.PI * 2;
                    let rad = (15 + Math.sin(mark.seed * b) * 5) * GAME_SCALE;
                    ctx.lineTo(mx + Math.cos(ang) * rad, my + Math.sin(ang) * rad);
                }
                ctx.closePath(); ctx.fill();
            }
            ctx.restore();
        });

        ctx.restore();
    }

    throwProjectile(angle = null, power = null) {
        if (this.hitStun > 0) return; // Can't throw if stunned

        // GUN MODE TRIGGER
        let isGunMode = this.health < (this.maxHealth * 0.4);
        const aiAmmoPool = ['egg', 'egg', 'chappal', 'chappal', 'mic', 'banana', 'tomato'];
        let ammoType = isGunMode ? 'bullet' : (this.isPlayer ? currentAmmo : aiAmmoPool[Math.floor(Math.random() * aiAmmoPool.length)]);

        this.throwingTimer = 15;

        const origin = getThrowOrigin(this);
        let startX = origin.x;
        let startY = origin.y;

        let vx, vy;

        if (this.isPlayer && angle !== null && power !== null) {
            if (isGunMode) {
                // BURST FIRE LOGIC
                this.triggerBurst(angle, 35);
                return; // Burst handles the actual projectile creation
            }
            vx = Math.cos(angle) * power;
            vy = Math.sin(angle) * power;
        } else {
            // --- COMPETITIVE AI AIMING ---
            let target = this.isPlayer ? opponent : player;

            if (isGunMode) {
                // --- GUN AIMING (Hitscan-like) ---
                // Predict where they will be in ~5 frames (very fast bullet)
                let predictedX = target.x + (target.vx * 5);
                let predictedY = target.y + 60;

                let dx = predictedX - startX;
                let dy = predictedY - startY;
                let angle = Math.atan2(dy, dx);

                this.triggerBurst(angle, 35);
                return;

            } else {
                // 1. PREDICTION: Lead the target based on their movement
                // Improve accuracy as health drops (Enrage mechanic)
                let accuracy = (this.maxHealth - this.health) / this.maxHealth; // 0.0 to 1.0 (1.0 is mostly accurate)
                let leadFactor = 30 + (accuracy * 20);

                let predictedX = target.x + (target.vx * leadFactor);
                let predictedY = target.y + 60; // Aim for chest/head

                let dx = predictedX - startX;
                let dy = predictedY - startY;

                // 2. BALLISTICS SOLVER
                // We want to hit the target in 't' frames.
                // Short range = low arc (fast), Long range = high arc (lob)
                // Randomize flight time to keep player guessing (60 - 100 frames)
                let timeToHit = 60 + Math.random() * 40;

                // Physics: x = vx * t  =>  vx = dx / t
                // Physics: y = vy * t + 0.5 * g * t^2  =>  vy = (dy - 0.5*g*t^2) / t

                vx = dx / timeToHit;
                vy = (dy - (0.5 * gravity * timeToHit * timeToHit)) / timeToHit;

                // 3. HUMANIZATION (Add slight error so it's not robotic)
                // Error decreases as health decreases (AI gets "Serious")
                let errorMag = Math.max(0.5, (this.health / this.maxHealth) * 3);
                vx += (Math.random() - 0.5) * errorMag;
                vy += (Math.random() - 0.5) * errorMag;
            }
        }

        if (this.isPlayer) playSoundEffect(isGunMode ? 'gun' : 'throw');
        projectiles.push(new Projectile(startX, startY, vx, vy, ammoType, this.isPlayer));
    }

    triggerBurst(angle, power) {
        let shots = 3;
        let delay = 100; // ms between shots

        let fire = (i) => {
            if (!gameActive || this.hitStun > 0) return;

            this.muzzleFlash = 5; // Flash for 5 frames

            // Recoil/Spread
            let spread = (Math.random() - 0.5) * 0.1;
            let finalAngle = angle + spread;

            let vx = Math.cos(finalAngle) * power;
            let vy = Math.sin(finalAngle) * power;

            const origin = getThrowOrigin(this);
            let startX = origin.x;
            let startY = origin.y;

            projectiles.push(new Projectile(startX, startY, vx, vy, 'bullet', this.isPlayer));
            playSoundEffect('gun');

            // Screen Shake on first shot
            if (i === 0) {
                document.body.classList.add('shake');
                setTimeout(() => document.body.classList.remove('shake'), 200);
            }
        };

        for (let i = 0; i < shots; i++) {
            setTimeout(() => fire(i), i * delay);
        }
    }
}

class Projectile {
    constructor(x, y, vx, vy, type, isPlayer) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.type = type;
        this.isPlayer = isPlayer;
        this.active = true;
        this.emoji = this.getEmoji();
    }

    getEmoji() {
        const emojis = { 'egg': '🥚', 'chappal': '👡', 'mic': '🎤', 'banana': '🍌', 'tomato': '🍅', 'bullet': '🔫' };
        return emojis[this.type] || '❓';
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // Bullet pays no respect to gravity
        if (this.type !== 'bullet') {
            this.vy += gravity * GAME_SCALE;
        }

        if (this.y > canvas.height - 100 || this.x < -100 || this.x > canvas.width + 100) {
            this.active = false;
        }

        return this.active;
    }

    draw() {
        if (this.type === 'bullet') {
            // Draw Bullet Trail
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 5 * GAME_SCALE, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.lineWidth = 2 * GAME_SCALE;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x - (this.vx * 2), this.y - (this.vy * 2)); // Trail
            ctx.stroke();
        } else {
            ctx.font = `${40 * GAME_SCALE}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.emoji, this.x, this.y);
        }
    }
}

function checkHit(proj, target) {
    if (proj.x > target.x && proj.x < target.x + target.width &&
        proj.y > target.y && proj.y < target.y + target.height) {

        // Add Visual Mark
        target.hitMarks.push({
            type: proj.type,
            relX: Math.random() * 60 + 20,
            relY: Math.random() * 120 + 40,
            life: 60,
            seed: Math.random() * 10
        });

        // Critical Hit Calculation (20% chance)
        let isCrit = Math.random() < 0.2;
        let damage = 10;

        if (proj.type === 'bullet') damage = 10; // Gun: 3 hits from 30% HP
        else if (proj.type === 'chappal') damage = 8;
        else if (proj.type === 'mic') damage = 3;
        else if (proj.type === 'banana') damage = 6;
        else if (proj.type === 'tomato') damage = 4;

        // Physics Reaction (Knockback)
        let knockbackDir = proj.vx > 0 ? 1 : -1;
        target.vx = knockbackDir * (isCrit ? 15 : 5); // Huge knockback on crit

        // Pain Particles
        spawnParticles(target.x + 50, target.y + 20, 'sweat', 8);
        if (isCrit) spawnParticles(target.x + 50, target.y - 10, 'star', 5);

        if (isCrit) {
            damage *= 2;
            target.hitStun = 45; // Longer stun
            showFloatingText("CRITICAL!", target.x + 50, target.y - 20, true);
        } else {
            target.hitStun = 10; // Short stun
            const reaction = funnyReactions[Math.floor(Math.random() * funnyReactions.length)];
            showFloatingText(reaction, target.x + 50, target.y + 20);
        }

        target.health -= damage;
        showFloatingText(`-${damage}`, target.x + 50, target.y + 50, isCrit);

        playSoundEffect('hit', proj.type);

        // Screen Shake
        let shakeStrength = isCrit ? 'shake-hard' : 'shake';
        document.body.classList.add(shakeStrength);
        setTimeout(() => document.body.classList.remove(shakeStrength), 500);

        updateHealthUI();
        return true;
    }
    return false;
}

function startGame() {
    initAudio(); // Initialize audio on user interaction
    gameActive = true;
    projectiles = [];
    particles = [];
    gameTimer = 0;
    keys = {};

    player = new Fighter(true, selectedCandidate);
    opponent = new Fighter(false, selectedCandidate === 'abbas' ? 'nasir' : 'abbas');

    p1NameEl.innerText = selectedCandidate.charAt(0).toUpperCase() + selectedCandidate.slice(1);
    p2NameEl.innerText = selectedCandidate === 'abbas' ? 'Nasir' : 'Abbas';

    updateHealthUI();

    landingScreen.classList.remove('visible');
    gameOverScreen.classList.remove('visible');
    gameScreen.classList.add('visible');

    if (bgMusic) {
        bgMusic.currentTime = 0;
        bgMusic.volume = 0.4; // Recalibrated for better balance with boosted hits
        bgMusic.play().catch(() => { });
    }

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    requestAnimationFrame(gameLoop);
}

function getHealthColor(percent) {
    if (percent > 60) return 'linear-gradient(90deg, #00ff00, #88ff00)';
    if (percent > 35) return 'linear-gradient(90deg, #ffaa00, #ffcc00)';
    if (percent > 15) return 'linear-gradient(90deg, #ff4400, #ff8800)';
    return 'linear-gradient(90deg, #cc0000, #ff0000)';
}

function updateHealthUI() {
    let pHealth = Math.max(0, (player.health / player.maxHealth) * 100);
    let oHealth = Math.max(0, (opponent.health / opponent.maxHealth) * 100);

    p1HealthEl.style.width = `${pHealth}%`;
    p2HealthEl.style.width = `${oHealth}%`;
    p1HealthEl.style.background = getHealthColor(pHealth);
    p2HealthEl.style.background = getHealthColor(oHealth);

    // Low health warning pulse
    if (pHealth < 20) p1HealthEl.classList.add('health-critical');
    else p1HealthEl.classList.remove('health-critical');
    if (oHealth < 20) p2HealthEl.classList.add('health-critical');
    else p2HealthEl.classList.remove('health-critical');

    if (player.health <= 0 || opponent.health <= 0) {
        endGame(player.health > 0);
    }
}

function gameLoop() {
    if (!gameActive) return;
    gameTimer++;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dynamic Sky Gradient
    let skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(1, '#E0F7FA');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    clouds.forEach(c => {
        c.x += c.speed;
        if (c.x > canvas.width + 100) c.x = -150;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.size * 0.5, 0, Math.PI * 2);
        ctx.arc(c.x + c.size * 0.3, c.y - c.size * 0.2, c.size * 0.4, 0, Math.PI * 2);
        ctx.arc(c.x + c.size * 0.3, c.y + c.size * 0.2, c.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Ground
    ctx.fillStyle = '#444';
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);

    // Road line
    ctx.fillStyle = '#666';
    ctx.fillRect(0, GROUND_Y + 45 * GAME_SCALE, canvas.width, 10 * GAME_SCALE);

    drawTrajectory();

    player.update();
    player.draw();

    opponent.update();
    opponent.draw();

    projectiles = projectiles.filter(p => {
        let active = p.update();
        p.draw();

        let target = p.isPlayer ? opponent : player;
        if (active && checkHit(p, target)) {
            return false;
        }
        return active;
    });

    // Update Particles
    particles = particles.filter(p => {
        let active = p.update();
        p.draw();
        return active;
    });

    // Update Timer Display
    const timerEl = document.getElementById('game-timer');
    if (timerEl) {
        const totalSec = Math.floor(gameTimer / 60);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    animationFrameId = requestAnimationFrame(gameLoop);
}

const throwSounds = ["এই নে!", "ধর!", "যা!", "খা!", "উড়রা!", "দিশুম!", "হেই!", "নে ব্যাটা!"];
const eggSounds = ["প্যাচাত!", "ফুস!", "সড়াত!", "ম্যাচাত!"];
const chappalSounds = ["ফটাস!", "থাপ্পড়!", "ধাপ্পাস!", "ফাতাস!"];
const micSounds = ["ঠক!", "টুং!", "পিউউ!", "ঠাস!"];
const bananaSounds = ["পিচ্ছিল!", "শপ!", "পিছলা!", "আছাড়!"];
const tomatoSounds = ["প্যাচাত!", "চপচপ!", "টমেটো!", "রসেভরপুর!"];

const funnyReactions = ["ওরে বাবা!", "মারবি নাকি?", "ধুর মিয়া!", "আরে আরে!", "মালাইকারি!", "বাপ রে!", "হায় হায়!", "ইজ্জত গেল!", "কি করছিস!"];
const angryReactions = ["ছাড়ব না তোরে!", "অ্যাই কি করোস!", "মারামারি করবি?", "খাইছি তোরে!", "বেয়াদব!", "থাম ব্যাটা!", "অসভ্য!", "চোপ!", "খবর আছে!"];

function playProceduralHit(type) {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;

    // Helper to create a noise burst for "texture" (splat/crunch)
    const playNoise = (freq, decay, vol) => {
        const bufferSize = audioCtx.sampleRate * decay;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = freq;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + decay);
        source.connect(filter); filter.connect(g); g.connect(audioCtx.destination);
        source.start(now); source.stop(now + decay);
    };

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'egg') {
        // --- REALISTIC EGG (Crack + Yolk) ---
        // 1. Crack texture
        playNoise(2000, 0.05, 0.4);
        // 2. Liquid splat
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'tomato') {
        // --- REALISTIC TOMATO (Heavy Juice + Squish) ---
        // 1. Gooey texture
        playNoise(800, 0.2, 0.5);
        // 2. Heavy core impact
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now); osc.stop(now + 0.25);
    } else if (type === 'chappal') {
        // --- REALISTIC CHAPPAL (Sharp Smack + Body) ---
        // 1. Skin slap
        playNoise(1000, 0.03, 1.2);
        // 2. Deep thud
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);
        gain.gain.setValueAtTime(1.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'mic') {
        // --- REALISTIC MIC (Metallic Clang) ---
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else {
        // --- GENERIC THUD ---
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
        gain.gain.setValueAtTime(1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now); osc.stop(now + 0.25);
    }
}

function playProceduralThrow() {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);

    // --- THROW POP (Fast upward frequency sweep) ---
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc.start(now); osc.stop(now + 0.08);
}

function playSoundEffect(type, itemType = 'egg') {
    if (type === 'hit') {
        // 1. Procedural High-Impact Sound
        playProceduralHit(itemType);

        // 2. Angry/Pain Shouting
        const isAngry = Math.random() < 0.7; // 70% chance of angry reaction
        const reactionList = isAngry ? angryReactions : funnyReactions;
        const txt = reactionList[Math.floor(Math.random() * reactionList.length)];

        // Shout it!
        speak(txt, isAngry ? 1.6 : 1.3, isAngry ? 1.4 : 1.1);
    } else if (type === 'throw') {
        // Procedural Pop
        playProceduralThrow();

        const txt = throwSounds[Math.floor(Math.random() * throwSounds.length)];
        speak(txt, 1, 1);
    } else if (type === 'gun') {
        // Procedural BANG
        const now = audioCtx.currentTime;

        // Noise Burst
        const decay = 0.3;
        const bufferSize = audioCtx.sampleRate * decay;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.05));

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.8, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + decay);
        source.connect(g); g.connect(audioCtx.destination);
        source.start(now);

        const txt = ["গুলি মারুম!", "ঢিস্ ক্যাও!", "খবর আছে!"];
        speak(txt[Math.floor(Math.random() * txt.length)], 1.5, 1.5);
    }
}

function speak(text, pitch = 1, rate = 1) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'bn-BD'; // Bengali
    utterance.pitch = pitch + (Math.random() * 0.2 - 0.1);
    utterance.rate = rate + (Math.random() * 0.2 - 0.1);
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
}

function triggerRoast() {
    if (!gameActive) return;
    showFloatingText("খেলা হবে!", player.x + 50, player.y - 50);
    const pushDir = opponent.x > player.x ? 120 : -120;
    opponent.x += pushDir;
    opponent.health -= 1; // Reduced to 1 for max duration
    updateHealthUI();
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 500);
}

function endGame(playerWon) {
    gameActive = false;
    gameScreen.classList.remove('visible');
    gameOverScreen.classList.add('visible');

    const title = document.getElementById('winner-title');
    const meme = document.getElementById('meme-display');
    const statsSummary = document.getElementById('game-stats-summary');

    const totalSec = Math.floor(gameTimer / 60);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const pHealthLeft = Math.max(0, Math.round((player.health / player.maxHealth) * 100));
    const oHealthLeft = Math.max(0, Math.round((opponent.health / opponent.maxHealth) * 100));

    if (playerWon) {
        title.innerText = "বিজয় আপনার!";
        meme.innerHTML = `<h1 style="color:#00ff88; font-size: clamp(1.5rem, 4vh, 2.5rem)">${title.innerText} 🏆</h1>`;
        StatsManager.recordResult(selectedCandidate === 'abbas' ? 'Abbas' : 'Nasir');
    } else {
        title.innerText = "হেরে গেলেন!";
        meme.innerHTML = `<h1 style="color:#ff4444; font-size: clamp(1.5rem, 4vh, 2.5rem)">${title.innerText} 💥</h1>`;
        if (failSound) failSound.play().catch(() => { });
        StatsManager.recordResult(selectedCandidate === 'abbas' ? 'Nasir' : 'Abbas');
    }

    if (statsSummary) {
        statsSummary.innerHTML = `
            <div style="display:flex; justify-content:space-around; gap:10px; flex-wrap:wrap; font-size: clamp(0.7rem, 1.5vh, 1rem);">
                <div>⏱️ <strong>${mins}:${secs.toString().padStart(2, '0')}</strong></div>
                <div>💚 <strong style="color:${pHealthLeft > 30 ? '#0f0' : '#f44'}">${pHealthLeft}%</strong></div>
                <div>💔 <strong style="color:${oHealthLeft > 30 ? '#0f0' : '#f44'}">${oHealthLeft}%</strong></div>
            </div>
        `;
    }

    if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }
}

function showFloatingText(text, x, y, isCrit = false) {
    const div = document.createElement('div');
    div.innerText = text;
    div.style.position = 'absolute';
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.color = isCrit ? '#ff0000' : '#fff';
    div.style.fontWeight = 'bold';
    div.style.fontSize = isCrit ? '3rem' : '2rem';
    div.style.textShadow = isCrit ? '0 0 10px yellow' : '0 0 5px black';
    div.style.zIndex = isCrit ? '2000' : '1000';
    div.style.pointerEvents = 'none';
    div.className = 'damage-text';
    document.body.appendChild(div);

    let op = 1;
    let topPos = y;
    let timer = setInterval(() => {
        if (op <= 0.1) {
            clearInterval(timer);
            div.remove();
        }
        div.style.opacity = op;
        div.style.top = topPos + 'px';
        op -= 0.1;
        topPos -= 2;
    }, 50);
}

// Controls (Point & Click)
let mouseX = 0, mouseY = 0;

let isDragging = false;
let dragX = 0;
let dragY = 0;

function getAimData(inputX, inputY) {
    // Shot origin should be near the character's hand/midsection
    const origin = getThrowOrigin(player);
    let startX = origin.x;
    let startY = origin.y;

    let dx = inputX - startX;
    let dy = inputY - startY;

    let angle = Math.atan2(dy, dx);
    let dist = Math.sqrt(dx * dx + dy * dy);

    // Increase power sensitivity slightly for mobile
    let power = Math.min(dist * 0.15, 45 * GAME_SCALE);
    power = Math.max(power, 8 * GAME_SCALE);

    return { angle, power, startX, startY, dx, dy };
}

function getThrowOrigin(fighter) {
    const handOffsetX = fighter.facing === -1 ? fighter.width * 0.2 : fighter.width * 0.8;
    const handOffsetY = fighter.height * 0.4;
    return {
        x: fighter.x + handOffsetX,
        y: fighter.y + handOffsetY
    };
}

// Mouse Aim/Shoot
canvas.addEventListener('mousemove', (e) => {
    let rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', (e) => {
    if (!gameActive) return;
    const aim = getAimData(mouseX, mouseY);
    player.throwProjectile(aim.angle, aim.power);
});

// Mobile Drag-to-Aim
canvas.addEventListener('touchstart', (e) => {
    if (!gameActive) return;
    e.preventDefault();
    isDragging = true;
    let rect = canvas.getBoundingClientRect();
    let touch = e.touches[0];
    dragX = touch.clientX - rect.left;
    dragY = touch.clientY - rect.top;

    // Update global mouseX/mouseY for trajectory drawing
    mouseX = dragX;
    mouseY = dragY;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (!gameActive || !isDragging) return;
    e.preventDefault();
    let rect = canvas.getBoundingClientRect();
    let touch = e.touches[0];
    dragX = touch.clientX - rect.left;
    dragY = touch.clientY - rect.top;

    mouseX = dragX;
    mouseY = dragY;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    if (!gameActive || !isDragging) return;
    e.preventDefault();
    isDragging = false;

    const aim = getAimData(dragX, dragY);
    player.throwProjectile(aim.angle, aim.power);
}, { passive: false });

function drawTrajectory() {
    if (gameActive) {
        let isGunMode = player.health < (player.maxHealth * 0.4);
        const aim = getAimData(mouseX, mouseY);

        ctx.save();
        ctx.strokeStyle = isGunMode ? '#ff0000' : '#00ffff';
        ctx.lineWidth = 4 * GAME_SCALE;
        if (isGunMode) ctx.setLineDash([]);
        else ctx.setLineDash([8 * GAME_SCALE, 8 * GAME_SCALE]);

        let startX = aim.startX;
        let startY = aim.startY;

        let vx, vy;

        if (isGunMode) {
            // Straight line trajectory
            vx = Math.cos(aim.angle) * 30 * GAME_SCALE;
            vy = Math.sin(aim.angle) * 30 * GAME_SCALE;
        } else {
            vx = Math.cos(aim.angle) * aim.power;
            vy = Math.sin(aim.angle) * aim.power;
        }

        // Only draw if we have a real input (not the default (0,0))
        if (!isDragging && mouseX === 0 && mouseY === 0) {
            ctx.restore();
            return;
        }

        ctx.beginPath();
        ctx.moveTo(startX, startY);

        let simX = startX;
        let simY = startY;
        let tempVy = vy;

        for (let i = 0; i < 30; i++) {
            simX += vx;
            simY += tempVy;

            if (!isGunMode) {
                tempVy += gravity * GAME_SCALE;
            }

            ctx.lineTo(simX, simY);
            if (simY > GROUND_Y || simX > canvas.width || simX < 0) break;
        }
        ctx.stroke();

        // Landing indicator
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(simX, simY, 12 * GAME_SCALE, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2 * GAME_SCALE;
        ctx.stroke();

        ctx.restore();
    }
}

window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ' && player && player.onGround && gameActive) {
        player.vy = -12 * GAME_SCALE;
    }
    if (e.code === 'Space') triggerRoast();
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});


startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// Initialize Stats
StatsManager.init();
