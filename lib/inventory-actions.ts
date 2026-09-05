import type { Game } from "./engine";
import { applyInventoryGesture, type InventoryGesture } from "./inventory-gestures";
export type { InventoryGesture, SlotRef } from "./inventory-gestures";

export function inventoryGesture(game: Game, gesture: InventoryGesture, chestOpen: boolean | "furnace" = false) {
  if (gesture.type === "click" && gesture.slot.area === "result") {
    game.takeCraft(gesture.quick);
    return;
  }
  if (gesture.type === "move" && gesture.from.area === "result") {
    game.takeCraft(false, gesture.to, gesture.expected);
    return;
  }
  if (game.net) {
    game.net.inventoryGesture(gesture, chestOpen);
    return;
  }
  const chest = chestOpen === true ? game.adventure.chestSlots() : undefined;
  const furnace = chestOpen === "furnace" ? game.adventure.furnaceState() : undefined;
  if (applyInventoryGesture(game.pack, gesture, chest, furnace?.slots)) {
    if (chest) game.adventure.setChestSlots(chest);
    game.commitPack();
  }
}
