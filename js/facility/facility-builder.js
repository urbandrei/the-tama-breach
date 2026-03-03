import * as THREE from 'three';
import { rooms, hallways, doorways, DOOR_WIDTH } from './layout-data.js';
import { Room } from './room.js';
import { Hallway } from './hallway.js';
import { Door } from './door.js';
import { getPropsForRoom } from './props.js';

export class FacilityBuilder {
  constructor(game) {
    this.game = game;
    this.rooms = [];
    this.hallways = [];
    this.doors = [];
    this.containmentChambers = {}; // roomId -> { group, glassPanels }
    this._built = false;
  }

  build() {
    if (this._built) return;
    this._built = true;

    this._buildRooms();
    this._buildHallways();
    this._buildDoors();
    this._buildProps();
  }

  _buildRooms() {
    for (const roomData of rooms) {
      const room = new Room(roomData, doorways);
      this.game.scene.add(room.group);
      this.game.physics.addColliders(this._worldColliders(room.group, room.colliders));
      this.rooms.push(room);
    }
  }

  _buildHallways() {
    for (const hallData of hallways) {
      const hall = new Hallway(hallData);
      this.game.scene.add(hall.group);
      this.game.physics.addColliders(this._worldColliders(hall.group, hall.colliders));
      this.hallways.push(hall);
    }
  }

  _buildDoors() {
    // Place a door at each doorway
    for (const dw of doorways) {
      const roomData = rooms.find(r => r.id === dw.roomId);
      if (!roomData) continue;

      const [cx, cz] = roomData.center;
      const [w, d] = roomData.size;
      const hw = w / 2;
      const hd = d / 2;

      let doorX, doorZ;
      switch (dw.wallSide) {
        case 'north':
          doorX = cx + dw.position;
          doorZ = cz + hd;
          break;
        case 'south':
          doorX = cx + dw.position;
          doorZ = cz - hd;
          break;
        case 'east':
          doorX = cx + hw;
          doorZ = cz + dw.position;
          break;
        case 'west':
          doorX = cx - hw;
          doorZ = cz + dw.position;
          break;
      }

      const door = new Door(doorX, doorZ, dw.wallSide);
      this.game.scene.add(door.group);
      this.game.physics.addColliders(this._worldColliders(door.group, door.colliders));
      this.game.player.interaction.addInteractable(door.trigger);
      this.doors.push(door);
    }
  }

  _buildProps() {
    for (const roomData of rooms) {
      const propResults = getPropsForRoom(roomData);
      for (const result of propResults) {
        this.game.scene.add(result.group);
        if (result.colliders.length > 0) {
          this.game.physics.addColliders(
            this._worldColliders(result.group, result.colliders)
          );
        }

        // Capture containment chambers for tamagotchi system
        if (result.group.name === 'containment_chamber') {
          const glassPanels = [];
          result.group.traverse((child) => {
            if (child.isMesh && child.material &&
                child.material.transparent && child.material.opacity < 1.0) {
              glassPanels.push(child);
            }
          });
          this.containmentChambers[roomData.id] = {
            group: result.group,
            glassPanels,
          };
        }
      }
    }
  }

  // Ensure colliders in groups have their world matrices updated
  // so physics raycasting works correctly
  _worldColliders(group, colliders) {
    group.updateMatrixWorld(true);
    return colliders;
  }

  update(dt) {
    for (const door of this.doors) {
      door.update(dt);
    }
  }
}
