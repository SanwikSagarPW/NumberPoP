export type Position = { r: number; c: number };

export type TileData = {
  id: string;
  r: number;
  c: number;
  value: number;
  isFrozen?: boolean;
  isFloating?: boolean;
};

export type Objective = {
  type: 'CREATE_VALUE' | 'CLEAR_FROZEN';
  targetValue?: number;
  targetCount: number;
};

export type LevelData = {
  level: number;
  gridSize: number;
  tiles: TileData[];
  moves: number;
  objective: Objective;
};

export function findPath(
  start: Position,
  end: Position,
  tiles: TileData[],
  gridSize: number
): Position[] | null {
  const grid = Array(gridSize)
    .fill(null)
    .map(() => Array(gridSize).fill(false));
  
  tiles.forEach((t) => {
    grid[t.r][t.c] = true;
  });

  if (grid[end.r][end.c]) return null;

  const queue: { pos: Position; path: Position[] }[] = [{ pos: start, path: [] }];
  const visited = new Set<string>();
  visited.add(`${start.r},${start.c}`);

  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  while (queue.length > 0) {
    const { pos, path } = queue.shift()!;

    if (pos.r === end.r && pos.c === end.c) {
      return path;
    }

    for (const [dr, dc] of dirs) {
      const nr = pos.r + dr;
      const nc = pos.c + dc;

      if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && !grid[nr][nc]) {
        const key = `${nr},${nc}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({ pos: { r: nr, c: nc }, path: [...path, { r: nr, c: nc }] });
        }
      }
    }
  }
  return null;
}

export function getConnected(
  start: Position,
  value: number,
  tiles: TileData[],
  gridSize: number
): TileData[] {
  const connected: TileData[] = [];
  const visited = new Set<string>();
  const queue: Position[] = [start];
  visited.add(`${start.r},${start.c}`);

  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  while (queue.length > 0) {
    const pos = queue.shift()!;
    const tile = tiles.find((t) => t.r === pos.r && t.c === pos.c && t.value === value);

    if (tile) {
      connected.push(tile);
      for (const [dr, dc] of dirs) {
        const nr = pos.r + dr;
        const nc = pos.c + dc;
        const key = `${nr},${nc}`;
        if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && !visited.has(key)) {
          visited.add(key);
          queue.push({ r: nr, c: nc });
        }
      }
    }
  }
  return connected;
}

export function resolveMerges(
  initialTiles: TileData[],
  targetR: number,
  targetC: number,
  gridSize: number
): { newTiles: TileData[]; merged: boolean; createdValues: number[]; destroyedFrozenCount: number } {
  let currentTiles = [...initialTiles];
  let checkQueue = [{ r: targetR, c: targetC }];
  let mergedAny = false;
  
  const createdValues: number[] = [];
  let destroyedFrozenCount = 0;

  while (checkQueue.length > 0) {
    const { r, c } = checkQueue.shift()!;
    const tile = currentTiles.find((t) => t.r === r && t.c === c);
    if (!tile) continue;

    const connected = getConnected({ r, c }, tile.value, currentTiles, gridSize);

    if (connected.length >= 3) {
      mergedAny = true;
      
      destroyedFrozenCount += connected.filter(t => t.isFrozen).length;

      currentTiles = currentTiles.filter(
        (t) => !connected.some((conn) => conn.id === t.id)
      );

      const newValue = tile.value + 1;
      createdValues.push(newValue);

      const newTile: TileData = {
        id: Math.random().toString(36).substring(2, 9),
        r,
        c,
        value: newValue,
        isFrozen: false
      };
      currentTiles.push(newTile);

      checkQueue.push({ r, c });
    }
  }

  return { newTiles: currentTiles, merged: mergedAny, createdValues, destroyedFrozenCount };
}

export function getEmptySpots(tiles: TileData[], gridSize: number): Position[] {
  const spots: Position[] = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (!tiles.find((t) => t.r === r && t.c === c)) {
        spots.push({ r, c });
      }
    }
  }
  return spots;
}

export function generateSpawns(
  currentTiles: TileData[],
  count: number,
  level: number,
  gridSize: number
): TileData[] {
  const emptySpots = getEmptySpots(currentTiles, gridSize);
  emptySpots.sort(() => Math.random() - 0.5);

  const newTiles: TileData[] = [];
  const maxVal = Math.min(6, 3 + Math.floor((level - 1) / 4));

  for (let i = 0; i < Math.min(count, emptySpots.length); i++) {
    newTiles.push({
      id: `spawn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      r: emptySpots[i].r,
      c: emptySpots[i].c,
      value: Math.floor(Math.random() * maxVal) + 1,
      isFrozen: false,
      isFloating: false,
    });
  }

  return newTiles;
}

export function generateLevel(level: number): LevelData {
  const gridSize = 7;
  const tiles: TileData[] = [];
  
  // Reduced density: start with fewer tiles and scale up slower
  const numTiles = Math.min(30, 14 + Math.floor(level * 1.5));
  const maxVal = Math.min(6, 3 + Math.floor((level - 1) / 4)); // Levels 1-4 will spawn 1, 2, and 3
  const numFrozen = level >= 2 ? Math.min(10, Math.floor(level * 1.2)) : 0;
  
  const positions: Position[] = [];
  for(let r=0; r<gridSize; r++) {
    for(let c=0; c<gridSize; c++) {
      if (r===3 && c===3) continue; // Keep center open to avoid immediate blocks
      positions.push({r, c});
    }
  }
  // Shuffle positions
  positions.sort(() => Math.random() - 0.5);

  const hasFloating = Math.random() < 0.25;
  const floatingIndex = hasFloating && numTiles > numFrozen 
    ? numFrozen + Math.floor(Math.random() * (numTiles - numFrozen)) 
    : -1;

  for(let i=0; i<numTiles; i++) {
    const pos = positions[i];
    const isFrozen = i < numFrozen;
    const isFloating = i === floatingIndex;
    tiles.push({
      id: `gen-${level}-${i}`,
      r: pos.r,
      c: pos.c,
      value: Math.floor(Math.random() * maxVal) + 1,
      isFrozen,
      isFloating
    });
  }

  let objective: Objective;
  // Alternate objective types
  if (level % 3 === 0 && numFrozen > 0) {
    objective = { type: 'CLEAR_FROZEN', targetCount: numFrozen };
  } else {
    // Target value is 1 higher than the max naturally spawning value
    objective = { type: 'CREATE_VALUE', targetValue: maxVal + 1, targetCount: 1 + Math.floor(level / 5) };
  }

  return {
    level,
    gridSize,
    tiles,
    moves: Math.max(20, 45 - Math.floor(level * 1.5)),
    objective
  };
}
