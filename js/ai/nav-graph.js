import { rooms, hallways } from '../facility/layout-data.js';

/**
 * Auto-generates a waypoint navigation graph from facility layout data.
 * Waypoints are placed at room centers, hallway endpoints, and hallway midpoints.
 * Edges connect adjacent waypoints with Euclidean distance weights.
 */

function dist(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

export function buildNavGraph() {
  const nodes = [];
  const edges = [];
  const nodeMap = new Map(); // id → node index

  // Helper to add a node (deduplicates by id)
  function addNode(id, x, z) {
    if (nodeMap.has(id)) return nodeMap.get(id);
    const idx = nodes.length;
    nodes.push({ id, x, z });
    nodeMap.set(id, idx);
    return idx;
  }

  // Helper to add a bidirectional edge
  function addEdge(fromIdx, toIdx) {
    const a = nodes[fromIdx];
    const b = nodes[toIdx];
    const cost = dist(a.x, a.z, b.x, b.z);
    edges.push({ from: fromIdx, to: toIdx, cost });
    edges.push({ from: toIdx, to: fromIdx, cost });
  }

  // 1. Room centers
  const roomNodeMap = new Map(); // roomId → node index
  for (const room of rooms) {
    const [cx, cz] = room.center;
    const idx = addNode(`room_${room.id}`, cx, cz);
    roomNodeMap.set(room.id, idx);
  }

  // 2. Hallway endpoints + midpoints, with connections
  // Build a map of which rooms connect to which hallway endpoints
  // We need to figure out which room each hallway endpoint belongs to
  for (const hall of hallways) {
    const [sx, sz] = hall.start;
    const [ex, ez] = hall.end;
    const mx = (sx + ex) / 2;
    const mz = (sz + ez) / 2;

    const startIdx = addNode(`${hall.id}_start`, sx, sz);
    const midIdx = addNode(`${hall.id}_mid`, mx, mz);
    const endIdx = addNode(`${hall.id}_end`, ex, ez);

    // Connect: start ↔ mid ↔ end
    addEdge(startIdx, midIdx);
    addEdge(midIdx, endIdx);

    // Connect hallway endpoints to nearest room center
    // Hallway endpoints sit at room walls, so find which room is closest
    const startRoom = findNearestRoom(sx, sz);
    const endRoom = findNearestRoom(ex, ez);

    if (startRoom !== null) {
      addEdge(startIdx, roomNodeMap.get(startRoom));
    }
    if (endRoom !== null) {
      addEdge(endIdx, roomNodeMap.get(endRoom));
    }
  }

  // 3. Connect nearby hallway endpoints (handles L-joint corners and ring continuity)
  // Hallway endpoints that are geographically close should be linked
  const PROXIMITY_THRESHOLD = 3.0;
  const hallNodeIds = [];
  for (const hall of hallways) {
    hallNodeIds.push(nodeMap.get(`${hall.id}_start`));
    hallNodeIds.push(nodeMap.get(`${hall.id}_end`));
  }
  for (let i = 0; i < hallNodeIds.length; i++) {
    for (let j = i + 1; j < hallNodeIds.length; j++) {
      const a = nodes[hallNodeIds[i]];
      const b = nodes[hallNodeIds[j]];
      const d = dist(a.x, a.z, b.x, b.z);
      if (d > 0.01 && d < PROXIMITY_THRESHOLD) {
        addEdge(hallNodeIds[i], hallNodeIds[j]);
      }
    }
  }

  // Build adjacency list for fast lookup
  const adjacency = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) adjacency[i] = [];
  for (const edge of edges) {
    adjacency[edge.from].push({ to: edge.to, cost: edge.cost });
  }

  return { nodes, edges, adjacency };
}

/**
 * Find which room a point is closest to (by checking if it's near a room's boundary).
 * Hallway endpoints sit at room walls, so the nearest room center wins.
 */
function findNearestRoom(x, z) {
  let bestId = null;
  let bestDist = Infinity;

  for (const room of rooms) {
    const [cx, cz] = room.center;
    const [w, h] = room.size;

    // Check if point is near this room's boundary (within a small margin)
    const halfW = w / 2 + 2; // small margin for hallway connections
    const halfH = h / 2 + 2;

    if (Math.abs(x - cx) <= halfW && Math.abs(z - cz) <= halfH) {
      const d = dist(x, z, cx, cz);
      if (d < bestDist) {
        bestDist = d;
        bestId = room.id;
      }
    }
  }

  return bestId;
}

/**
 * Find the nearest nav graph node to a world position.
 */
export function getNearestNode(graph, x, z) {
  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    const d = dist(x, z, node.x, node.z);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  return bestIdx;
}
