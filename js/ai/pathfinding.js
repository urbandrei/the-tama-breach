/**
 * A* pathfinding on the waypoint navigation graph.
 */

function heuristic(graph, aIdx, bIdx) {
  const a = graph.nodes[aIdx];
  const b = graph.nodes[bIdx];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Find a path from startIdx to endIdx using A*.
 * Returns array of {x, z} world positions (including start and end).
 * Returns empty array if no path found.
 */
export function findPath(graph, startIdx, endIdx) {
  if (startIdx === endIdx) {
    const node = graph.nodes[startIdx];
    return [{ x: node.x, z: node.z }];
  }

  const nodeCount = graph.nodes.length;
  const gScore = new Float64Array(nodeCount).fill(Infinity);
  const fScore = new Float64Array(nodeCount).fill(Infinity);
  const cameFrom = new Int32Array(nodeCount).fill(-1);
  const closed = new Uint8Array(nodeCount);

  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(graph, startIdx, endIdx);

  // Simple binary heap (min-heap on fScore)
  const open = [startIdx];
  const inOpen = new Uint8Array(nodeCount);
  inOpen[startIdx] = 1;

  while (open.length > 0) {
    // Find node with lowest fScore in open set
    let bestI = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestI]]) bestI = i;
    }
    const current = open[bestI];
    open[bestI] = open[open.length - 1];
    open.pop();
    inOpen[current] = 0;

    if (current === endIdx) {
      return reconstructPath(graph, cameFrom, current);
    }

    closed[current] = 1;

    for (const neighbor of graph.adjacency[current]) {
      if (closed[neighbor.to]) continue;

      const tentativeG = gScore[current] + neighbor.cost;
      if (tentativeG < gScore[neighbor.to]) {
        cameFrom[neighbor.to] = current;
        gScore[neighbor.to] = tentativeG;
        fScore[neighbor.to] = tentativeG + heuristic(graph, neighbor.to, endIdx);

        if (!inOpen[neighbor.to]) {
          open.push(neighbor.to);
          inOpen[neighbor.to] = 1;
        }
      }
    }
  }

  return []; // No path found
}

function reconstructPath(graph, cameFrom, current) {
  const path = [];
  let node = current;
  while (node !== -1) {
    const n = graph.nodes[node];
    path.push({ x: n.x, z: n.z });
    node = cameFrom[node];
  }
  path.reverse();
  return path;
}
