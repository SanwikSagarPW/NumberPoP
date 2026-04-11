import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeftRight, Pause, Trash2, Timer, Undo, RotateCcw, Snowflake, ChevronRight, Trophy, Star, Play, HelpCircle, Home as HomeIcon } from 'lucide-react';
import { TileData, Objective, resolveMerges, generateLevel, generateSpawns, getEmptySpots, Position, findPath } from './lib/gameLogic';

const GRID_SIZE = 7;
const CELL_SIZE = 50;
const CELL_GAP = 8;
const STEP = CELL_SIZE + CELL_GAP;
const BOARD_SIZE = GRID_SIZE * STEP - CELL_GAP;

const getTileStyle = (val: number) => {
  switch (val) {
    case 1: return 'from-[#ff5c77] to-[#e03a55] text-white';
    case 2: return 'from-[#ffea40] to-[#e0c820] text-amber-900';
    case 3: return 'from-[#ff9f40] to-[#e07a20] text-white';
    case 4: return 'from-[#4ade80] to-[#28b860] text-white';
    case 5: return 'from-[#20a0ff] to-[#1080e0] text-white';
    case 6: return 'from-[#8a20ff] to-[#6a10e0] text-white';
    case 7: return 'from-[#c56cf0] to-[#a54cd0] text-white';
    case 8: return 'from-[#ff4081] to-[#e02060] text-white';
    case 9: return 'from-[#1de9b6] to-[#00bfa5] text-teal-900';
    default: return 'from-gray-400 to-gray-600 text-white';
  }
};

type GameState = {
  tiles: TileData[];
  upcomingSpawns: TileData[];
  moves: number;
  objectiveProgress: number;
  score: number;
};

export default function App() {
  const [level, setLevel] = useState(1);
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [upcomingSpawns, setUpcomingSpawns] = useState<TileData[]>([]);
  const [moves, setMoves] = useState(0);
  const [objective, setObjective] = useState<Objective>({ type: 'CREATE_VALUE', targetCount: 1 });
  const [objectiveProgress, setObjectiveProgress] = useState(0);
  const [score, setScore] = useState(0);
  
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  const [status, setStatus] = useState<'home' | 'how-to-play' | 'playing' | 'won' | 'lost'>('home');
  
  const [isAnimating, setIsAnimating] = useState(false);
  const [movingTileId, setMovingTileId] = useState<string | null>(null);
  const [movingPath, setMovingPath] = useState<Position[] | null>(null);

  const loadLevel = (lvl: number, keepScore = false) => {
    const data = generateLevel(lvl);
    setLevel(lvl);
    setTiles(data.tiles);
    setUpcomingSpawns(generateSpawns(data.tiles, 3, lvl, GRID_SIZE));
    setMoves(data.moves);
    setObjective(data.objective);
    setObjectiveProgress(0);
    if (!keepScore) setScore(0);
    setStatus('playing');
    setSelected(null);
    setHistory([]);
    setIsAnimating(false);
    setMovingTileId(null);
    setMovingPath(null);
  };

  const handleCellClick = (r: number, c: number) => {
    if (status !== 'playing' || isAnimating) return;

    const clickedTile = tiles.find((t) => t.r === r && t.c === c);

    if (clickedTile) {
      if (clickedTile.isFrozen) return; // Cannot select frozen tiles
      setSelected(clickedTile.id);
    } else if (selected) {
      const selectedTile = tiles.find((t) => t.id === selected);
      if (!selectedTile) return;

      let fullPath: Position[];
      if (selectedTile.isFloating) {
        fullPath = [
          { r: selectedTile.r, c: selectedTile.c },
          { r, c }
        ];
      } else {
        const path = findPath({ r: selectedTile.r, c: selectedTile.c }, { r, c }, tiles, GRID_SIZE);
        if (!path) return; // Must have a valid path
        fullPath = [{ r: selectedTile.r, c: selectedTile.c }, ...path];
      }

      // Start move animation
      setIsAnimating(true);
      setMovingTileId(selected);
      setMovingPath(fullPath);
      
      setHistory((prev) => [...prev, { tiles, upcomingSpawns, moves, objectiveProgress, score }]);

      const movedTiles = tiles.map((t) =>
        t.id === selected ? { ...t, r, c } : t
      );
      
      setSelected(null);
      const currentMoves = moves;
      setMoves(currentMoves - 1);

      const animDuration = selectedTile.isFloating ? 400 : fullPath.length * 100;

      // Wait for path animation to complete
      setTimeout(() => {
        setMovingTileId(null);
        setMovingPath(null);

        let currentTiles = movedTiles;
        const { newTiles, merged, createdValues, destroyedFrozenCount } = resolveMerges(currentTiles, r, c, GRID_SIZE);
        currentTiles = newTiles;
        
        let totalCreated = [...createdValues];
        let totalDestroyed = destroyedFrozenCount;

        // Spawn new tiles if no merge happened
        if (!merged) {
          let spawnsToPlace = [...upcomingSpawns];
          const emptySpots = getEmptySpots(currentTiles, GRID_SIZE);
          emptySpots.sort(() => Math.random() - 0.5);
          
          for (let spawn of spawnsToPlace) {
            if (currentTiles.find(t => t.r === spawn.r && t.c === spawn.c)) {
              if (emptySpots.length > 0) {
                const newSpot = emptySpots.pop()!;
                spawn.r = newSpot.r;
                spawn.c = newSpot.c;
              } else {
                spawn.r = -1;
              }
            } else {
              const idx = emptySpots.findIndex(s => s.r === spawn.r && s.c === spawn.c);
              if (idx !== -1) emptySpots.splice(idx, 1);
            }
          }
          
          spawnsToPlace = spawnsToPlace.filter(s => s.r !== -1);
          currentTiles = [...currentTiles, ...spawnsToPlace];

          // Resolve merges for any newly spawned tiles
          for (const st of spawnsToPlace) {
            if (currentTiles.find(t => t.id === st.id)) {
              const res = resolveMerges(currentTiles, st.r, st.c, GRID_SIZE);
              if (res.merged) {
                currentTiles = res.newTiles;
                totalCreated.push(...res.createdValues);
                totalDestroyed += res.destroyedFrozenCount;
              }
            }
          }
          
          setUpcomingSpawns(generateSpawns(currentTiles, 3, level, GRID_SIZE));
        }
        
        setTiles(currentTiles);
        
        let progressDelta = 0;
        if (objective.type === 'CREATE_VALUE') {
          progressDelta = totalCreated.filter(v => v === objective.targetValue).length;
        } else if (objective.type === 'CLEAR_FROZEN') {
          progressDelta = totalDestroyed;
        }
        
        const newProgress = objectiveProgress + progressDelta;
        if (progressDelta > 0) {
          setObjectiveProgress(newProgress);
        }

        if (totalCreated.length > 0 || totalDestroyed > 0) {
          const points = totalCreated.reduce((a, b) => a + b * 10, 0) + totalDestroyed * 25;
          setScore((s) => s + points);
        }

        // Check win/loss conditions
        if (newProgress >= objective.targetCount) {
          setStatus('won');
        } else if (currentTiles.length >= GRID_SIZE * GRID_SIZE || currentMoves - 1 <= 0) {
          setStatus('lost');
        }

        setIsAnimating(false);
      }, animDuration); // Match animation duration
    }
  };

  const handleUndo = () => {
    if (history.length === 0 || status !== 'playing') return;
    const previousState = history[history.length - 1];
    setTiles(previousState.tiles);
    setUpcomingSpawns(previousState.upcomingSpawns);
    setMoves(previousState.moves);
    setObjectiveProgress(previousState.objectiveProgress);
    setScore(previousState.score);
    setHistory((prev) => prev.slice(0, -1));
    setSelected(null);
  };

  const handleRestart = () => {
    loadLevel(level, true);
  };

  const handleNextLevel = () => {
    loadLevel(level + 1, true);
  };

  if (status === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#e0f7fa] to-[#e1f5fe] flex flex-col items-center justify-center p-4 font-sans select-none overflow-hidden relative">
        {/* Decorative background tiles */}
        <motion.div 
          animate={{ y: [-10, 10, -10] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          className="absolute top-10 left-10 md:top-20 md:left-32 opacity-60 scale-125 pointer-events-none"
        >
          <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getTileStyle(3)} flex items-center justify-center font-black text-3xl shadow-lg`}>3</div>
        </motion.div>
        
        <motion.div 
          animate={{ y: [10, -10, 10] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
          className="absolute bottom-20 left-10 md:bottom-32 md:left-40 opacity-60 scale-150 pointer-events-none"
        >
          <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getTileStyle(5)} flex items-center justify-center font-black text-3xl shadow-lg`}>5</div>
        </motion.div>

        <motion.div 
          animate={{ y: [-15, 15, -15] }}
          transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
          className="absolute top-20 right-10 md:top-32 md:right-40 opacity-60 scale-110 pointer-events-none"
        >
          <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getTileStyle(2)} flex items-center justify-center font-black text-3xl shadow-lg`}>2</div>
        </motion.div>

        <motion.div 
          animate={{ y: [15, -15, 15] }}
          transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut" }}
          className="absolute bottom-32 right-10 md:bottom-40 md:right-32 opacity-60 scale-125 pointer-events-none"
        >
          <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getTileStyle(7)} flex items-center justify-center font-black text-3xl shadow-lg`}>7</div>
        </motion.div>

        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className="z-10 flex flex-col items-center"
        >
          <div className="bg-white/40 p-8 rounded-[3rem] backdrop-blur-sm border border-white/50 shadow-2xl flex flex-col items-center mb-8">
            <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-cyan-400 to-blue-600 mb-2 drop-shadow-sm text-center leading-tight">
              Number<br/>Pop!
            </h1>
            <p className="text-cyan-700 font-bold text-xl md:text-2xl mb-8">A magical matching puzzle!</p>
            
            <div className="flex flex-col gap-4 w-full max-w-xs">
              <button 
                onClick={() => loadLevel(1)}
                className="w-full py-5 bg-gradient-to-b from-green-400 to-emerald-500 text-white rounded-full font-black text-3xl shadow-[0_8px_0_rgb(4,120,87)] hover:shadow-[0_6px_0_rgb(4,120,87)] hover:translate-y-[2px] active:shadow-[0_0px_0_rgb(4,120,87)] active:translate-y-[8px] transition-all flex items-center justify-center gap-3"
              >
                <Play className="w-8 h-8 fill-current" /> PLAY!
              </button>
              
              <button 
                onClick={() => setStatus('how-to-play')}
                className="w-full py-4 mt-4 bg-white text-cyan-600 rounded-full font-bold text-xl shadow-[0_6px_0_rgb(165,243,252)] hover:shadow-[0_4px_0_rgb(165,243,252)] hover:translate-y-[2px] active:shadow-[0_0px_0_rgb(165,243,252)] active:translate-y-[6px] transition-all border-2 border-cyan-100 flex items-center justify-center gap-3"
              >
                <HelpCircle className="w-6 h-6" /> How to Play
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (status === 'how-to-play') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#e0f7fa] to-[#e1f5fe] flex flex-col items-center justify-center p-4 font-sans select-none overflow-hidden">
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-6 md:p-10 shadow-2xl border border-white/60 max-w-2xl w-full"
        >
          <h2 className="text-4xl md:text-5xl font-black text-cyan-600 mb-8 text-center drop-shadow-sm">How to Play!</h2>
          
          <div className="flex flex-col gap-6 mb-10">
            <div className="flex items-center gap-4 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
              <div className="w-14 h-14 shrink-0 rounded-full bg-blue-200 flex items-center justify-center text-3xl shadow-inner">👆</div>
              <p className="text-lg md:text-xl font-bold text-gray-700 leading-snug">Tap a number, then tap an empty spot to move it there!</p>
            </div>
            
            <div className="flex items-center gap-4 bg-green-50/50 p-4 rounded-2xl border border-green-100">
              <div className="w-14 h-14 shrink-0 rounded-full bg-green-200 flex items-center justify-center text-3xl shadow-inner">✨</div>
              <p className="text-lg md:text-xl font-bold text-gray-700 leading-snug">Match 3 of the same numbers together to make a bigger number!</p>
            </div>
            
            <div className="flex items-center gap-4 bg-cyan-50/50 p-4 rounded-2xl border border-cyan-100">
              <div className="w-14 h-14 shrink-0 rounded-full bg-cyan-200 flex items-center justify-center shadow-inner"><Snowflake className="w-8 h-8 text-cyan-600"/></div>
              <p className="text-lg md:text-xl font-bold text-gray-700 leading-snug">Ice blocks are stuck! Match numbers next to them to break the ice!</p>
            </div>
            
            <div className="flex items-center gap-4 bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
              <div className="w-14 h-14 shrink-0 rounded-full bg-purple-200 flex items-center justify-center text-3xl shadow-inner">☁️</div>
              <p className="text-lg md:text-xl font-bold text-gray-700 leading-snug">Bouncy numbers can jump over anything! Look for the floating ones!</p>
            </div>
          </div>
          
          <button 
            onClick={() => setStatus('home')}
            className="w-full py-5 bg-gradient-to-b from-cyan-400 to-blue-500 text-white rounded-full font-black text-2xl shadow-[0_8px_0_rgb(29,78,216)] hover:shadow-[0_6px_0_rgb(29,78,216)] hover:translate-y-[2px] active:shadow-[0_0px_0_rgb(29,78,216)] active:translate-y-[8px] transition-all"
          >
            Got it! Let's Play!
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e0f7fa] to-[#e1f5fe] flex items-center justify-center p-4 font-sans select-none overflow-hidden">
      
      {/* Top Bar - Mobile only */}
      <div className="absolute top-6 left-0 right-0 flex justify-center md:hidden px-6">
        <div className="bg-white/80 backdrop-blur-md rounded-full px-6 py-2 shadow-sm flex items-center gap-6 font-bold text-gray-700">
          <div className="flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500" /> {score}</div>
          <div className="w-px h-4 bg-gray-300" />
          <div>Level {level}</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-12 items-center md:items-start mt-16 md:mt-0">
        
        {/* Left Panel - Stats */}
        <div className="flex flex-row md:flex-col gap-4 w-full md:w-auto justify-center">
          <div className="bg-white/80 backdrop-blur-md rounded-[2rem] p-6 shadow-sm flex flex-col items-center gap-6 min-w-[140px] border border-white/50">
            
            <div className="hidden md:flex flex-col items-center gap-1 w-full">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Level</span>
              <span className="text-3xl font-black text-gray-800">{level}</span>
              <div className="w-full h-px bg-gray-200 my-2" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Score</span>
              <span className="text-xl font-bold text-yellow-500 flex items-center gap-1"><Star className="w-4 h-4 fill-yellow-500" />{score}</span>
            </div>

            <div className="hidden md:block w-full h-px bg-gray-200" />

            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Moves</span>
              <div className={`flex items-center gap-2 font-black text-4xl ${moves <= 5 ? 'text-red-500' : 'text-gray-700'}`}>
                <ArrowLeftRight className="w-6 h-6" strokeWidth={3} /> {moves}
              </div>
            </div>

            <div className="w-full h-px bg-gray-200" />

            <div className="flex flex-col items-center gap-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Objective</span>
              <div className="flex items-center gap-3 font-bold text-2xl">
                {objective.type === 'CREATE_VALUE' ? (
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getTileStyle(objective.targetValue!)} flex items-center justify-center text-xl shadow-md border-2 border-white/50`}>
                    {objective.targetValue}
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-cyan-100 border-2 border-cyan-300 flex items-center justify-center shadow-md">
                    <Snowflake className="w-6 h-6 text-cyan-500" />
                  </div>
                )}
                <span className={objectiveProgress >= objective.targetCount ? 'text-green-500' : 'text-gray-600'}>
                  {Math.min(objectiveProgress, objective.targetCount)}<span className="text-gray-400 text-lg mx-1">/</span>{objective.targetCount}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Center - Board */}
        <div className="relative bg-white/90 backdrop-blur-md rounded-[2rem] p-4 shadow-xl border border-white/60">
          <div
            className="relative"
            style={{ width: BOARD_SIZE, height: BOARD_SIZE }}
          >
            {/* Grid Background */}
            {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
              const r = Math.floor(i / GRID_SIZE);
              const c = i % GRID_SIZE;
              return (
                <div
                  key={i}
                  className="absolute bg-gray-100/80 rounded-full shadow-inner"
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    left: c * STEP,
                    top: r * STEP,
                  }}
                  onClick={() => handleCellClick(r, c)}
                />
              );
            })}

            {/* Path Visualization */}
            <AnimatePresence>
              {movingPath && (
                <svg className="absolute inset-0 pointer-events-none z-15" style={{ width: BOARD_SIZE, height: BOARD_SIZE }}>
                  <motion.polyline
                    points={movingPath.map(p => `${p.c * STEP + CELL_SIZE / 2},${p.r * STEP + CELL_SIZE / 2}`).join(' ')}
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="8"
                    strokeDasharray={movingTileId && tiles.find(t => t.id === movingTileId)?.isFloating ? "0 16" : "8 8"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.8 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: movingTileId && tiles.find(t => t.id === movingTileId)?.isFloating ? 0.4 : movingPath.length * 0.1, ease: movingTileId && tiles.find(t => t.id === movingTileId)?.isFloating ? "easeInOut" : "linear" }}
                    style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.2))' }}
                  />
                </svg>
              )}
            </AnimatePresence>

            {/* Upcoming Spawns */}
            <AnimatePresence>
              {upcomingSpawns.map((spawn) => (
                <motion.div
                  key={`upcoming-${spawn.id}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1, y: spawn.isFloating ? [-2, 2, -2] : 0 }}
                  transition={spawn.isFloating ? { y: { repeat: Infinity, duration: 2, ease: "easeInOut" } } : {}}
                  exit={{ scale: 0, opacity: 0 }}
                  className={`absolute rounded-full bg-gradient-to-br ${getTileStyle(spawn.value)} opacity-50 shadow-inner border border-white/50 ${spawn.isFloating ? 'border-b-2 border-white/80' : ''}`}
                  style={{
                    width: CELL_SIZE * 0.3,
                    height: CELL_SIZE * 0.3,
                    left: spawn.c * STEP + CELL_SIZE * 0.35,
                    top: spawn.r * STEP + CELL_SIZE * 0.35,
                    zIndex: 5,
                  }}
                />
              ))}
            </AnimatePresence>

            {/* Tiles */}
            <AnimatePresence>
              {tiles.map((tile) => {
                const isMoving = movingTileId === tile.id;
                const isSelected = selected === tile.id;

                let xAnim: any = tile.c * STEP;
                let yAnim: any = tile.r * STEP;
                
                if (isMoving && movingPath) {
                  xAnim = movingPath.map(p => p.c * STEP);
                  yAnim = movingPath.map(p => p.r * STEP);
                }

                return (
                  <motion.div
                    key={tile.id}
                    layout={!isMoving}
                    initial={{ scale: 0, opacity: 0, x: tile.c * STEP, y: tile.r * STEP }}
                    animate={{
                      scale: isMoving ? (tile.isFloating ? 1.3 : 1.1) : (isSelected ? 1.15 : 1),
                      opacity: 1,
                      x: xAnim,
                      y: yAnim,
                      zIndex: isMoving ? 50 : (isSelected ? 20 : 10),
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={
                      isMoving 
                        ? { duration: tile.isFloating ? 0.4 : movingPath!.length * 0.1, ease: tile.isFloating ? "easeInOut" : "linear" }
                        : { type: 'spring', stiffness: 400, damping: 25, mass: 0.8 }
                    }
                    className={`absolute flex items-center justify-center ${tile.isFrozen ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    style={{ width: CELL_SIZE, height: CELL_SIZE }}
                    onClick={() => handleCellClick(tile.r, tile.c)}
                  >
                    <motion.div
                      animate={tile.isFloating && !isMoving ? { y: [-4, 4, -4] } : { y: 0 }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                      className={`relative w-full h-full rounded-full flex items-center justify-center font-black text-2xl shadow-md bg-gradient-to-br ${getTileStyle(tile.value)} ${isSelected ? 'ring-4 ring-black/10 shadow-xl' : 'border-2 border-white/30'} ${tile.isFloating ? 'shadow-[0_10px_15px_rgba(0,0,0,0.3)] border-b-4 border-white/60' : ''} ${isMoving ? 'shadow-2xl ring-4 ring-white/80' : ''}`}
                    >
                      <span className="drop-shadow-md relative z-30">{tile.value}</span>

                      {/* Frozen Ice Cube Overlay */}
                      {tile.isFrozen && (
                        <div className="absolute inset-[-4px] bg-cyan-50/40 backdrop-blur-[3px] rounded-xl border-[3px] border-cyan-200/90 shadow-[inset_0_4px_12px_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.15)] pointer-events-none flex items-start justify-end p-1 z-20">
                          <Snowflake className="w-5 h-5 text-cyan-600 drop-shadow-sm" />
                        </div>
                      )}
                    </motion.div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Overlays */}
          <AnimatePresence>
            {status !== 'playing' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-[2rem] flex flex-col items-center justify-center z-30 shadow-2xl border border-white"
              >
                {status === 'won' ? (
                  <>
                    <Trophy className="w-20 h-20 text-yellow-400 mb-4 drop-shadow-lg" />
                    <h2 className="text-4xl font-black text-gray-800 mb-2">Level Cleared!</h2>
                    <p className="text-gray-500 font-bold mb-8 text-lg">Score: {score}</p>
                    <button
                      onClick={handleNextLevel}
                      className="px-8 py-4 bg-gradient-to-r from-green-400 to-emerald-500 text-white rounded-full font-black text-xl shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                      Next Level <ChevronRight className="w-6 h-6" strokeWidth={3} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
                      <Timer className="w-10 h-10 text-red-500" />
                    </div>
                    <h2 className="text-4xl font-black text-gray-800 mb-2">Out of Moves!</h2>
                    <p className="text-gray-500 font-bold mb-8 text-lg">Keep trying!</p>
                    <button
                      onClick={handleRestart}
                      className="px-8 py-4 bg-gradient-to-r from-gray-800 to-gray-900 text-white rounded-full font-black text-xl shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <RotateCcw className="w-6 h-6" strokeWidth={3} /> Try Again
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Panel - Controls */}
        <div className="flex flex-row md:flex-col gap-4">
          <ControlButton icon={<HomeIcon className="w-7 h-7" />} onClick={() => setStatus('home')} />
          <ControlButton icon={<Pause className="w-7 h-7" />} onClick={() => {}} />
          <ControlButton icon={<Trash2 className="w-7 h-7" />} onClick={handleRestart} />
          <ControlButton 
            icon={<Undo className="w-7 h-7" />} 
            onClick={handleUndo} 
            disabled={history.length === 0 || status !== 'playing'} 
          />
        </div>
      </div>
    </div>
  );
}

function ControlButton({ icon, onClick, disabled }: { icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-16 h-16 bg-white/80 backdrop-blur-md rounded-[1.5rem] flex items-center justify-center text-gray-500 shadow-sm border border-white/50 transition-all
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white hover:text-gray-800 hover:shadow-md hover:-translate-y-1 active:translate-y-0 active:scale-95'}`}
    >
      {icon}
    </button>
  );
}
