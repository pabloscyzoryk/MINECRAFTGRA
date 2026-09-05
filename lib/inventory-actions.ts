import type { Game } from "./engine";
import { applyInventoryGesture, type InventoryGesture } from "./inventory-gestures";
export type { InventoryGesture, SlotRef } from "./inventory-gestures";

export function inventoryGesture(game: Game, gesture: InventoryGesture, chestOpen = false) {
  if (game.net) {
    game.net.inventoryGesture(gesture, chestOpen);
    return;
  }
  const chest = chestOpen ? game.adventure.chestSlots() : undefined;
  if (applyInventoryGesture(game.pack, gesture, chest)) {
    if (chest) game.adventure.setChestSlots(chest);
    game.commitPack();
  }
}
