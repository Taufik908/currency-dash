/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Mic, Camera, X, MoreVertical, LayoutGrid, Settings, TrendingUp, MousePointer2, Trophy, RefreshCw, AlertCircle, Plus, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Core Game Parameters
const SPEED = 2.8;
const WAVE_SPEED = 3.5;
const SHIP_SIZE = 12;

// Sound Engine using Web Audio API
class SoundEngine {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playJump() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playGameOver() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.5);
    
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }

  playGacha(rarity: 'Common' | 'Rare' | 'Legendary') {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const playNote = (freq: number, start: number, duration: number, type: OscillatorType = 'sine') => {
      const g = this.ctx!.createGain();
      const o = this.ctx!.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.08, start);
      g.gain.exponentialRampToValueAtTime(0.01, start + duration);
      o.connect(g);
      g.connect(this.ctx!.destination);
      o.start(start);
      o.stop(start + duration);
    };

    if (rarity === 'Legendary') {
      [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => playNote(f, now + i * 0.1, 0.4, 'square'));
    } else if (rarity === 'Rare') {
      [440, 554.37, 659.25].forEach((f, i) => playNote(f, now + i * 0.1, 0.3));
    } else {
      playNote(440, now, 0.15);
    }
  }
}

const soundEngine = new SoundEngine();

interface TrailPoint {
  x: number;
  y: number;
}

interface Skin {
  id: string;
  name: string;
  color: string;
  rarity: 'Common' | 'Rare' | 'Legendary';
  glow?: string;
  hasParticles?: boolean;
}

const SKINS: Skin[] = [
  { id: 'common', name: 'Koin Rp500', color: '#bdc1c6', rarity: 'Common' },
  { id: 'rare', name: 'Uang Rp50.000', color: '#00529b', rarity: 'Rare' },
  { id: 'legendary', name: 'Uang Rp100.000', color: '#ea4335', rarity: 'Legendary', glow: '#ea4335', hasParticles: true },
];

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GameItem {
  x: number;
  y: number;
  type: 'up' | 'down';
  collected: boolean;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface GameLevel {
  id: string;
  name: string;
  path: string;
  speedMultiplier: number;
}

const GAME_LEVELS: GameLevel[] = [
  { id: '1D', name: '1 Day', path: 'M0,150 L50,145 L100,155 L150,140 L200,148 L250,142 L300,150 L350,145 L400,152', speedMultiplier: 1.0 },
  { id: '5D', name: '5 Days', path: 'M0,160 L40,140 L80,170 L120,130 L160,150 L200,120 L240,160 L280,140 L320,170 L360,130 L400,150', speedMultiplier: 1.1 },
  { id: '1M', name: '1 Month', path: 'M0,180 C50,180 70,120 120,120 S180,160 230,160 S300,100 400,100', speedMultiplier: 1.2 },
  { id: '1Y', name: '1 Year', path: 'M0,200 L100,50 L200,180 L300,30 L400,150', speedMultiplier: 1.5 },
  { id: '5Y', name: '5 Years', path: 'M0,220 Q100,20 200,220 T400,20', speedMultiplier: 1.8 },
  { id: 'Max', name: 'Maximum', path: 'M0,150 L20,50 L40,250 L60,50 L80,250 L100,50 L120,250 L140,50 L160,250 L180,50 L200,250 L220,50 L240,250 L260,50 L280,250 L300,50 L320,250 L340,50 L360,250 L380,50 L400,250', speedMultiplier: 2.2 },
];

const ChartGame = ({ onScoreUpdate, onGameOver, onAction, skin, initialScore, difficulty, levelPath }: { onScoreUpdate: (score: number) => void, onGameOver: () => void, onAction: () => void, skin: Skin, initialScore: number, difficulty: number, levelPath: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle');
  
  const difficultyMultiplier = (1 + (difficulty - 1) * 0.25);
  const currentSpeed = SPEED * difficultyMultiplier;
  const currentWaveSpeed = WAVE_SPEED * difficultyMultiplier;

  const playerRef = useRef({ x: 80, y: 150, vy: 0, score: initialScore, itemBonus: 0 });
  const trailRef = useRef<TrailPoint[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const itemsRef = useRef<GameItem[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const isPressingRef = useRef(false);
  const frameCountRef = useRef(0);

  useEffect(() => {
    setGameState('idle');
    const startY = containerRef.current?.clientHeight ? containerRef.current.clientHeight / 2 : 150;
    playerRef.current = { x: 80, y: startY, vy: 0, score: initialScore, itemBonus: 0 };
    trailRef.current = [];
    obstaclesRef.current = [];
    itemsRef.current = [];
    floatingTextsRef.current = [];
    particlesRef.current = [];
    frameCountRef.current = 0;
  }, [initialScore, levelPath]);

  const resetGame = useCallback(() => {
    const startY = containerRef.current?.clientHeight ? containerRef.current.clientHeight / 2 : 150;
    playerRef.current = { x: 80, y: startY, vy: 0, score: initialScore, itemBonus: 0 };
    trailRef.current = [];
    obstaclesRef.current = [];
    itemsRef.current = [];
    floatingTextsRef.current = [];
    particlesRef.current = [];
    frameCountRef.current = 0;
    setGameState('playing');
    onScoreUpdate(initialScore);
  }, [onScoreUpdate, initialScore]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (gameState === 'playing') {
          isPressingRef.current = true;
          soundEngine.playJump();
          onAction();
        }
        else if (gameState === 'gameover' || gameState === 'idle') resetGame();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') isPressingRef.current = false;
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (gameState === 'playing') {
        isPressingRef.current = true;
        soundEngine.playJump();
        onAction();
      }
      else if (gameState === 'gameover' || gameState === 'idle') resetGame();
    };
    const handleMouseUp = () => isPressingRef.current = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Prevent scrolling while playing
      if (gameState === 'playing') {
        e.preventDefault();
        isPressingRef.current = true;
        soundEngine.playJump();
        onAction();
      } else if (gameState === 'gameover' || gameState === 'idle') {
        resetGame();
      }
    };
    const handleTouchEnd = () => isPressingRef.current = false;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [gameState, resetGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = () => {
      if (gameState !== 'playing') return;

      const player = playerRef.current;
      frameCountRef.current++;
      
      // Wave Physics: Diagonal movement
      player.vy = isPressingRef.current ? -currentWaveSpeed : currentWaveSpeed;
      player.y += player.vy;

      // Obstacle Generation (Creating a jagged corridor)
      if (frameCountRef.current % Math.max(15, Math.floor(45 / difficultyMultiplier)) === 0) {
        const centerY = canvas.height / 2 + Math.sin(frameCountRef.current / 80) * (canvas.height * 0.2);
        const gap = Math.max(80, canvas.height * 0.45);
        
        // Top block
        obstaclesRef.current.push({
          x: canvas.width + 50,
          y: 0,
          width: 45,
          height: Math.max(0, centerY - gap/2)
        });
        
        // Bottom block
        obstaclesRef.current.push({
          x: canvas.width + 50,
          y: centerY + gap/2,
          width: 45,
          height: Math.max(0, canvas.height - (centerY + gap/2))
        });
      }

      // Item Generation: Spawn in the gap between obstacles
      if (frameCountRef.current % Math.max(20, Math.floor(60 / difficultyMultiplier)) === 0) {
        const centerY = canvas.height / 2 + Math.sin(frameCountRef.current / 80) * (canvas.height * 0.2);
        const gap = Math.max(80, canvas.height * 0.45);
        const itemY = centerY + (Math.random() - 0.5) * (gap - 30); // Center within gap with buffer

        itemsRef.current.push({
          x: canvas.width + 50,
          y: itemY,
          type: Math.random() > 0.4 ? 'up' : 'down',
          collected: false
        });
      }

      // Update Obstacles & Collision
      obstaclesRef.current.forEach(obs => {
        obs.x -= currentSpeed;
        
        const px = player.x;
        const py = player.y;
        if (px + SHIP_SIZE/2 > obs.x && px - SHIP_SIZE/2 < obs.x + obs.width &&
            py + SHIP_SIZE/2 > obs.y && py - SHIP_SIZE/2 < obs.y + obs.height) {
          setGameState('gameover');
          soundEngine.playGameOver();
          onGameOver();
        }
      });
      obstaclesRef.current = obstaclesRef.current.filter(o => o.x > -100);

      // Update Items & Collision
      itemsRef.current.forEach(item => {
        item.x -= currentSpeed;
        
        if (!item.collected) {
          const dx = player.x - item.x;
          const dy = player.y - item.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist < 20) {
            item.collected = true;
            // Effect
            const multiplier = item.type === 'up' ? 1 : -1;
            const amount = 5000;
            player.itemBonus += multiplier * amount;
            
            // Add Floating Text
            floatingTextsRef.current.push({
              x: 20, 
              y: 40 + floatingTextsRef.current.length * 20,
              text: `${multiplier > 0 ? '+' : ''}${amount}`,
              life: 1,
              color: item.type === 'up' ? '#81c995' : '#ea4335'
            });

            // Collect particles
            for(let i=0; i<8; i++) {
              particlesRef.current.push({
                x: item.x,
                y: item.y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                life: 1,
                color: item.type === 'up' ? '#81c995' : '#ea4335'
              });
            }
          }
        }
      });
      itemsRef.current = itemsRef.current.filter(i => i.x > -50 && !i.collected);

      // Floating Texts
      floatingTextsRef.current.forEach(ft => {
        ft.life -= 0.02;
        ft.y -= 0.5;
      });
      floatingTextsRef.current = floatingTextsRef.current.filter(ft => ft.life > 0);

      // Trail Update
      trailRef.current.push({ x: player.x, y: player.y });
      if (trailRef.current.length > 250) trailRef.current.shift();
      trailRef.current.forEach(p => p.x -= currentSpeed);

      // Bounds check
      if (player.y > canvas.height || player.y < 0) {
        setGameState('gameover');
        soundEngine.playGameOver();
        onGameOver();
      }

      // Particles
      if (frameCountRef.current % 4 === 0) {
        particlesRef.current.push({
          x: player.x,
          y: player.y,
          vx: (Math.random() - 1) * 2 * difficultyMultiplier,
          vy: (Math.random() - 0.5) * 2 * difficultyMultiplier,
          life: 1,
          color: player.vy < 0 ? '#8ab4f8' : '#81c995'
        });
      }

      // Legendary Skin Special Particles (Flame)
      if (skin.hasParticles && frameCountRef.current % 2 === 0) {
        particlesRef.current.push({
          x: player.x - 5,
          y: player.y + (Math.random() - 0.5) * 5,
          vx: (-2 - Math.random() * 2) * difficultyMultiplier,
          vy: (Math.random() - 0.5) * 2 * difficultyMultiplier,
          life: 0.6,
          color: '#ea4335'
        });
      }

      particlesRef.current.forEach(p => {
        p.x -= currentSpeed;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;
      });
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);

      // Dynamic Score: Tied to verticality
      const targetScore = initialScore + (canvas.height / 2 - player.y) * 15 * difficultyMultiplier + player.itemBonus;
      player.score += (targetScore - player.score) * 0.15;
      onScoreUpdate(player.score);

      // --- Draw ---
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Grid Lines
      ctx.strokeStyle = '#3c404311';
      ctx.lineWidth = 1;
      for(let i=0; i<canvas.width; i+=40) {
        let x = i - (frameCountRef.current * currentSpeed % 40);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Trail (Graph)
      if (trailRef.current.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = '#81c995';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.moveTo(trailRef.current[0].x, trailRef.current[0].y);
        for (let i = 1; i < trailRef.current.length; i++) {
          ctx.lineTo(trailRef.current[i].x, trailRef.current[i].y);
        }
        ctx.stroke();
        
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Obstacles
      ctx.fillStyle = '#3c4043';
      obstaclesRef.current.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.fillStyle = '#ea4335'; // Red death edge
        if (obs.y === 0) {
          ctx.fillRect(obs.x, obs.height - 3, obs.width, 3);
        } else {
          ctx.fillRect(obs.x, obs.y, obs.width, 3);
        }
        ctx.fillStyle = '#3c4043';
      });

      // Items
      itemsRef.current.forEach(item => {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.fillStyle = item.type === 'up' ? '#81c995' : '#ea4335';
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle;
        
        ctx.beginPath();
        if (item.type === 'up') {
          // Up Arrow
          ctx.moveTo(0, -8);
          ctx.lineTo(-6, 2);
          ctx.lineTo(-3, 2);
          ctx.lineTo(-3, 8);
          ctx.lineTo(3, 8);
          ctx.lineTo(3, 2);
          ctx.lineTo(6, 2);
        } else {
          // Down Arrow
          ctx.moveTo(0, 8);
          ctx.lineTo(-6, -2);
          ctx.lineTo(-3, -2);
          ctx.lineTo(-3, -8);
          ctx.lineTo(3, -8);
          ctx.lineTo(3, -2);
          ctx.lineTo(6, -2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      // Floating Texts
      ctx.font = 'bold 16px sans-serif';
      floatingTextsRef.current.forEach(ft => {
        ctx.globalAlpha = ft.life;
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
      });
      ctx.globalAlpha = 1;

      // Particles
      particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Player Arrow
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.vy < 0 ? -Math.PI/4 : Math.PI/4);
      ctx.fillStyle = skin.color;
      if (skin.glow) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = skin.glow;
      } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = skin.color;
      }
      ctx.beginPath();
      ctx.moveTo(SHIP_SIZE, 0);
      ctx.lineTo(-SHIP_SIZE/2, -SHIP_SIZE/2);
      ctx.lineTo(-SHIP_SIZE/5, 0);
      ctx.lineTo(-SHIP_SIZE/2, SHIP_SIZE/2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    if (gameState === 'playing') {
      animationRef.current = requestAnimationFrame(gameLoop);
    }

    return () => cancelAnimationFrame(animationRef.current);
  }, [gameState, onScoreUpdate, onGameOver]);

  const handleResize = useCallback(() => {
    if (containerRef.current && canvasRef.current) {
      canvasRef.current.width = containerRef.current.clientWidth;
      canvasRef.current.height = containerRef.current.clientHeight;
    }
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full cursor-none overflow-hidden rounded-lg bg-[#202124]/50 group"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      <AnimatePresence>
        {gameState === 'idle' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-[#202124]/70 backdrop-blur-sm"
          >
            <div className="p-4 rounded-full bg-[#3c4043] mb-4 group-hover:scale-110 transition-transform">
              <RefreshCw className="w-8 h-8 text-[#8ab4f8]" />
            </div>
            <p className="text-[#e8eaed] font-medium">Klik atau Spasi untuk Mulai</p>
            <p className="text-[#bdc1c6] text-xs mt-2 italic">Game: Jangan jatuh dari grafik!</p>
          </motion.div>
        )}

        {gameState === 'gameover' && (
          <motion.div 
             initial={{ scale: 0.9, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/40 backdrop-blur-md"
          >
            <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
            <h2 className="text-3xl font-bold text-white mb-1">INFLASI!</h2>
            <p className="text-white/80 mb-6">Nilai Rupiah Terlalu Drastis</p>
            <button 
              onClick={(e) => { e.stopPropagation(); resetGame(); }}
              className="px-6 py-2 bg-white text-red-900 rounded-full font-bold hover:bg-red-50 transition-colors shadow-lg"
            >
              Coba Lagi
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [currentDate] = useState(new Date());

  const getInitialPrice = useCallback(() => {
    // Base rate simulation: ~16,250 with slight variations based on time
    const base = 16250.75;
    const daySeed = Math.floor(currentDate.getTime() / 86400000) % 100;
    const hourSeed = currentDate.getHours() * 2;
    return base + daySeed + hourSeed + (currentDate.getMinutes() * 0.1);
  }, [currentDate]);

  const [score, setScore] = useState(getInitialPrice());
  const [usdAmount, setUsdAmount] = useState(1);
  const [currentLevel, setCurrentLevel] = useState<GameLevel>(GAME_LEVELS[2]); // Default to 1M
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [trend, setTrend] = useState<'inflasi' | 'deflasi' | null>(null);
  const [currentSkin, setCurrentSkin] = useState<Skin>(SKINS[0]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [totalClicks, setTotalClicks] = useState(0);
  const [highestPeak, setHighestPeak] = useState(0);

  const formatDisplayDate = (date: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = date.getDate();
    const m = months[date.getMonth()];
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${d} ${m}, ${h}.${min} UTC`;
  };

  const getHistoricalDate = (daysAgo: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - daysAgo);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getDifficultyColor = () => {
    if (usdAmount <= 2) return 'text-green-400';
    if (usdAmount <= 5) return 'text-yellow-400';
    return 'text-red-500 font-black drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse';
  };

  const getDifficultyText = () => {
    if (usdAmount <= 2) return 'EASY';
    if (usdAmount <= 5) return 'MEDIUM';
    return 'HYPER INFLATION / EXTREME DEMON';
  };

  const spinGacha = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    
    // Animation loop for display text
    let counter = 0;
    const interval = setInterval(() => {
      setDisplayText(SKINS[Math.floor(Math.random() * SKINS.length)].name);
      counter++;
      if (counter > 20) {
        clearInterval(interval);
        
        const rand = Math.random() * 100;
        let selectedSkin: Skin;
        
        if (rand < 5) selectedSkin = SKINS.find(s => s.rarity === 'Legendary')!;
        else if (rand < 30) selectedSkin = SKINS.find(s => s.rarity === 'Rare')!;
        else selectedSkin = SKINS.find(s => s.rarity === 'Common')!;
        
        setCurrentSkin(selectedSkin);
        soundEngine.playGacha(selectedSkin.rarity);
        setDisplayText(`Dapat: ${selectedSkin.name}! (${selectedSkin.rarity})`);
        setIsSpinning(false);
        
        setTimeout(() => setDisplayText(null), 3000);
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-[#202124] text-[#e8eaed] font-sans selection:bg-[#8ab4f8]/30 overflow-x-hidden">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-center px-4 md:px-6 pt-4 md:pt-6 pb-2 border-b border-[#3c4043] select-none gap-3 md:gap-4">
        <div className="flex items-center w-full md:w-auto justify-between md:justify-start">
          <div className="text-xl md:text-2xl font-bold md:mr-10 cursor-default text-white">
            Google
          </div>
          <div className="md:hidden flex items-center gap-2">
             <button 
                onClick={spinGacha}
                disabled={isSpinning}
                className="text-[10px] px-3 py-1.5 bg-[#8ab4f8] text-[#202124] rounded-full font-bold hover:bg-white transition-colors disabled:opacity-50"
             >
               Spin
             </button>
             <LayoutGrid className="w-5 h-5 text-[#bdc1c6]" />
             <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-400 to-rose-400 border border-[#3c4043]" />
          </div>
        </div>
        
        <div className="flex items-center bg-[#303134] w-full max-w-[600px] h-11 md:h-12 rounded-full px-4 md:px-5 border border-transparent hover:bg-[#3c4043] transition-colors shadow-sm">
          <input 
            type="text" 
            defaultValue="dollar to rupiah"
            className="flex-1 bg-transparent border-none outline-none text-[14px] md:text-[16px] text-white py-2"
            readOnly
          />
          <div className="flex items-center gap-2 md:gap-4 text-[#8ab4f8] text-xl ml-1 md:ml-2">
            <span className="cursor-pointer text-[#bdc1c6] hover:text-white transition-colors hidden sm:block">✕</span>
            <span className="text-[#3c4043] font-thin hidden sm:block">|</span>
            <Mic className="w-4 h-4 md:w-5 md:h-5 cursor-pointer text-[#bdc1c6] md:text-[#8ab4f8]" />
            <Camera className="w-4 h-4 md:w-5 md:h-5 cursor-pointer text-[#bdc1c6] md:text-[#8ab4f8]" />
            <Search className="w-4 h-4 md:w-5 md:h-5 cursor-pointer" />
            <div className="h-6 w-[1px] bg-[#3c4043] hidden md:block" />
            <button 
              onClick={spinGacha}
              disabled={isSpinning}
              className="hidden md:block text-xs px-4 py-1.5 bg-[#8ab4f8] text-[#202124] rounded-full font-bold hover:bg-white transition-colors disabled:opacity-50 whitespace-nowrap shadow-md active:scale-95"
            >
              Spin Skin
            </button>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 ml-auto">
          <Settings className="w-5 h-5 text-[#bdc1c6] cursor-pointer hover:text-white transition-colors" />
          <LayoutGrid className="w-5 h-5 text-[#bdc1c6] cursor-pointer hover:text-white transition-colors" />
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-400 to-rose-400 border border-[#3c4043] cursor-pointer" />
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="flex gap-4 md:gap-6 ml-0 md:ml-[160px] mt-4 text-[13px] md:text-[14px] text-[#bdc1c6] border-b border-[#3c4043] overflow-x-auto no-scrollbar whitespace-nowrap px-4 md:px-0">
        <span className="pb-3 cursor-pointer hover:text-white transition-colors">AI Mode</span>
        <span className="pb-3 border-b-2 border-[#8ab4f8] text-[#8ab4f8] font-medium cursor-pointer">All</span>
        <span className="pb-3 cursor-pointer hover:text-white transition-colors">Finance</span>
        <span className="pb-3 cursor-pointer hover:text-white transition-colors">Images</span>
        <span className="pb-3 cursor-pointer hover:text-white transition-colors">News</span>
        <span className="pb-3 cursor-pointer hover:text-white transition-colors">Shopping</span>
        <span className="pb-3 cursor-pointer hover:text-white transition-colors flex items-center gap-1">
          More <MoreVertical className="w-3 h-3" />
        </span>
      </nav>

      {/* Main Content */}
      <main className="ml-0 md:ml-[160px] mt-6 md:mt-10 max-w-[900px] px-4 md:px-0 pb-20">
        <div className="text-[13px] md:text-[14px] text-[#bdc1c6] mb-1 flex items-center gap-2 h-6 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.span 
              key={displayText || 'default'}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className={displayText ? "text-[#8ab4f8] font-bold italic" : ""}
            >
              {displayText || "1 United States Dollar equals"}
            </motion.span>
          </AnimatePresence>
        </div>
        
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">
          {/* Left Panel: Converter */}
          <section className="w-full lg:w-[400px]">
            <motion.h1 
              key={score}
              initial={isGameStarted ? { scale: 1.05, color: trend === 'inflasi' ? '#f87171' : '#4ade80' } : {}}
              animate={{ scale: 1, color: '#e8eaed' }}
              className="text-3xl md:text-4xl font-normal mb-1 h-10 md:h-12"
            >
              {formatCurrency(score)}
            </motion.h1>
            <div className="text-3xl md:text-4xl text-white mb-2 transition-all duration-300">Indonesian Rupiah</div>
            
            <div className={`text-[12px] font-bold mb-4 flex items-center gap-2 ${getDifficultyColor()}`}>
              <TrendingUp className="w-4 h-4" />
              Difficulty: {getDifficultyText()}
            </div>
            
            <div className="text-[12px] text-[#bdc1c6] mb-6">
              {formatDisplayDate(currentDate)} · <a href="#" className="text-[#8ab4f8] hover:underline">Disclaimer</a>
            </div>

            <div className="space-y-3">
              <div className="flex border border-[#3c4043] rounded-lg overflow-hidden h-12 bg-transparent">
                <div className="min-w-[130px] sm:w-1/2 flex items-center border-r border-[#3c4043]">
                  <button 
                    type="button"
                    onClick={() => {
                      const val = Math.max(1, usdAmount - 1);
                      setUsdAmount(val);
                      setScore(getInitialPrice() * val);
                    }}
                    className="h-full px-3 hover:bg-[#3c4043] transition-colors text-[#8ab4f8] active:scale-90 flex items-center justify-center border-r border-[#3c4043]/30"
                    title="Decrease Difficulty"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input 
                    type="number" 
                    value={usdAmount} 
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(10, parseFloat(e.target.value) || 1));
                      setUsdAmount(val);
                      setScore(getInitialPrice() * val);
                    }}
                    className="flex-1 bg-transparent text-center text-sm md:text-lg outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-0"
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      const val = Math.min(10, usdAmount + 1);
                      setUsdAmount(val);
                      setScore(getInitialPrice() * val);
                    }}
                    className="h-full px-3 hover:bg-[#3c4043] transition-colors text-[#8ab4f8] active:scale-90 flex items-center justify-center border-l border-[#3c4043]/30"
                    title="Increase Difficulty"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <select className="flex-1 p-2 md:p-3 bg-[#202124] h-full appearance-none text-[13px] md:text-[15px] cursor-pointer outline-none text-[#e8eaed] truncate">
                  <option value="USD">United States Dollar</option>
                </select>
              </div>

              <div className="flex border border-[#3c4043] rounded-lg overflow-hidden h-12 bg-transparent">
                <input 
                  type="text" 
                  value={formatCurrency(score)} 
                  readOnly
                  className="min-w-[130px] sm:w-1/2 p-3 bg-transparent border-r border-[#3c4043] text-sm md:text-lg outline-none text-center"
                />
                <select className="flex-1 p-2 md:p-3 bg-[#202124] h-full appearance-none text-[13px] md:text-[15px] cursor-pointer outline-none text-[#e8eaed] truncate">
                  <option value="IDR">Indonesian Rupiah</option>
                </select>
              </div>
            </div>

            <div className="mt-8 p-4 bg-[#303134] rounded-lg text-sm italic text-[#bdc1c6] border border-[#3c4043]/50">
              Click or press SPACE on the chart to play the Dash Game! Don't let the Rupiah fall!
              <div className="mt-2 text-[12px] text-[#8ab4f8]/70 not-italic">
                Tip: Change the United States Dollar input value (e.g., 2, 5, 10) to increase game speed and scaling difficulty!
              </div>
              <div className="mt-2 text-[#8ab4f8] not-italic font-bold">
                Skin Aktif: {currentSkin.name} ({currentSkin.rarity})
              </div>
            </div>
          </section>

          {/* Right Panel: Game / Chart Area */}
          <section className="flex-1 min-w-0">
            <div className="flex justify-start md:justify-end gap-2 md:gap-3 text-[11px] text-[#bdc1c6] mb-4 overflow-x-auto no-scrollbar py-1">
              {GAME_LEVELS.map((level) => (
                <span 
                  key={level.id}
                  onClick={() => {
                    setCurrentLevel(level);
                    setScore(getInitialPrice() * usdAmount);
                    setIsGameStarted(false);
                  }}
                  className={`px-3 py-1.5 md:px-2 md:py-1 cursor-pointer transition-colors whitespace-nowrap ${
                    level.id === currentLevel.id ? 'bg-[#3c4043] text-white rounded' : 'hover:text-white'
                  }`}
                >
                  {level.id}
                </span>
              ))}
            </div>

            <div className="relative w-full h-[180px] sm:h-[220px] bg-[#202124] border-l border-b border-[#3c4043] group overflow-hidden">
              {/* Background Chart Path */}
              <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none" viewBox="0 0 400 300" preserveAspectRatio="none">
                <path 
                  d={currentLevel.path} 
                  stroke="#81c995" 
                  strokeWidth="4" 
                  fill="none" 
                  className="visual-chart transition-all duration-500"
                />
              </svg>

              <ChartGame 
                onScoreUpdate={(s) => {
                  setTrend(s > score ? 'inflasi' : 'deflasi');
                  setScore(s);
                  if (s > highestPeak) setHighestPeak(s);
                  setIsGameStarted(true);
                }}
                onGameOver={() => {
                  setIsGameStarted(false);
                  setTrend(null);
                }}
                onAction={() => setTotalClicks(prev => prev + 1)}
                skin={currentSkin}
                initialScore={getInitialPrice() * usdAmount}
                difficulty={usdAmount * currentLevel.speedMultiplier}
                levelPath={currentLevel.path}
              />
            </div>
            
            <div className="flex justify-between text-[10px] md:text-[11px] text-[#bdc1c6] mt-2 px-1">
              <span>{formatCurrency(17000).split(',')[0]}</span>
              <span className="hidden sm:inline">{getHistoricalDate(20)}</span>
              <span className="hidden sm:inline">{getHistoricalDate(10)}</span>
              <span>Today</span>
            </div>
          </section>
        </div>
      </main>

      {/* Footer: Game Stats & Achievements */}
      <footer className="mt-10 md:mt-20 border-t border-[#3c4043] px-4 md:ml-[160px] py-10 md:py-12 max-w-[900px]">
        <h3 className="text-lg md:text-xl mb-4 md:mb-6 font-medium text-[#e8eaed]">Game Stats & Achievements</h3>
        <div className="space-y-3 md:space-y-4">
          <div className="flex items-center justify-between py-2 md:py-3 border-b border-[#3c4043] group transition-colors">
            <div className="flex flex-col">
              <span className="text-[#8ab4f8] text-[12px] uppercase font-bold tracking-wider">Current Multiplier</span>
              <span className="text-[#e8eaed] text-[14px] md:text-[15px]">{(score / getInitialPrice()).toFixed(2)}x Boost</span>
            </div>
            <TrendingUp className="w-5 h-5 text-[#81c995]" />
          </div>

          <div className="flex items-center justify-between py-2 md:py-3 border-b border-[#3c4043] group transition-colors">
            <div className="flex flex-col">
              <span className="text-[#8ab4f8] text-[12px] uppercase font-bold tracking-wider">Total Actions</span>
              <span className="text-[#e8eaed] text-[14px] md:text-[15px]">{totalClicks.toLocaleString()} Clicks/Taps</span>
            </div>
            <MousePointer2 className="w-5 h-5 text-[#8ab4f8]" />
          </div>

          <div className="flex items-center justify-between py-2 md:py-3 border-b border-[#3c4043] group transition-colors">
            <div className="flex flex-col">
              <span className="text-[#8ab4f8] text-[12px] uppercase font-bold tracking-wider">Highest Peak Reached</span>
              <span className="text-[#e8eaed] text-[14px] md:text-[15px]">Rp {formatCurrency(highestPeak)}</span>
            </div>
            <Trophy className="w-5 h-5 text-yellow-500" />
          </div>
        </div>
      </footer>
    </div>
  );
}
