import { rooms, hallways, doorways } from '../facility/layout-data.js';

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

  }

  // 3. Doorway waypoints — connect rooms to hallways through their doors
  const allHallNodeIndices = [];
  for (const hall of hallways) {
    allHallNodeIndices.push(nodeMap.get(`${hall.id}_start`));
    allHallNodeIndices.push(nodeMap.get(`${hall.id}_mid`));
    allHallNodeIndices.push(nodeMap.get(`${hall.id}_end`));
  }

  const roomsById = {};
  for (const room of rooms) roomsById[room.id] = room;

  for (const door of doorways) {
    const room = roomsById[door.roomId];
    if (!room) continue;

    const [cx, cz] = room.center;
    const [w, h] = room.size;
    let doorX, doorZ;
    switch (door.wallSide) {
      case 'west':  doorX = cx - w / 2; doorZ = cz + (door.position || 0); break;
      case 'east':  doorX = cx + w / 2; doorZ = cz + (door.position || 0); break;
      case 'north': doorX = cx + (door.position || 0); doorZ = cz + h / 2; break;
      case 'south': doorX = cx + (door.position || 0); doorZ = cz - h / 2; break;
    }

    const doorIdx = addNode(`door_${door.roomId}`, doorX, doorZ);

    // Connect door to room center
    const roomIdx = roomNodeMap.get(door.roomId);
    if (roomIdx !== undefined) addEdge(doorIdx, roomIdx);

    // Connect door to nearest hallway node
    let bestHallIdx = -1;
    let bestDist = Infinity;
    for (const hallIdx of allHallNodeIndices) {
      const d = dist(doorX, doorZ, nodes[hallIdx].x, nodes[hallIdx].z);
      if (d < bestDist) {
        bestDist = d;
        bestHallIdx = hallIdx;
      }
    }
    if (bestHallIdx >= 0) addEdge(doorIdx, bestHallIdx);
  }

  // 4. Connect nearby hallway endpoints (handles L-joint corners and ring continuity)
  // Hallway endpoints that are geographically close should be linked
  const PROXIMITY_THRESHOLD = 3.0;
  const hallNodeIds = [];
  for (const hall of hallways) {
    hallNodeIds.push(nodeMap.get(`${hall.id}_start`));
    hallNodeIds.push(nodeMap.get(`${hall.id}_mid`));
    hallNodeIds.push(nodeMap.get(`${hall.id}_end`));
  }
  for (let i = 0; i < hallNodeIds.length; i++) {
    for (let j = i + 1; j < hallNodeIds.length; j++) {
      const a = nodes[hallNodeIds[i]];
      const b = nodes[hallNodeIds[j]];
      const d = dist(a.x, a.z, b.x, b.z);
      if (d < PROXIMITY_THRESHOLD) {
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
