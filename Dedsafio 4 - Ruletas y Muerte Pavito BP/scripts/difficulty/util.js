import { GameMode, ItemStack, system, world } from "@minecraft/server";
export const safe = fn => { try { return fn(); } catch { return undefined; } };
export const livingPlayer = p => safe(() => p.typeId === "minecraft:player" && p.getGameMode() !== GameMode.Creative && p.getGameMode() !== GameMode.Spectator && p.getComponent("minecraft:health").currentValue > 0) === true;
export const isNight = () => world.getTimeOfDay() >= 13000 && world.getTimeOfDay() < 23000;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const blockAt = (d, p) => safe(() => d.getBlock(p));
export const inventory = e => safe(() => e.getComponent("minecraft:inventory")?.container);
export const biome = (d, p) => safe(() => d.getBiome(p)?.id) ?? "";
export const nearby = (e, radius = 6) => safe(() => e.dimension.getPlayers({ location: e.location, maxDistance: radius }).filter(livingPlayer)) ?? [];
export const hurt = (p, damage, cause = "magic", source) => safe(() => p.applyDamage(damage, { cause, ...(source ? { damagingEntity: source } : {}) }));
export function dropRandomSlot(player) {
    const bag = inventory(player);
    if (!bag) return;
    const slots = [];
    for (let i = 0; i < bag.size; i++) if (bag.getItem(i)) slots.push(i);
    if (!slots.length) return;
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const item = bag.getItem(slot);
    // Spawn first so an unloaded chunk cannot destroy an inventory slot.
    player.dimension.spawnItem(item, player.location);
    bag.setItem(slot, undefined);
}
export function give(player, id, count = 1) {
    const bag = inventory(player);
    if (!bag) return false;
    const left = bag.addItem(new ItemStack(id, count));
    if (left) player.dimension.spawnItem(left, player.location);
    return true;
}
export function takeHeld(player, id) {
    const bag = inventory(player), slot = player.selectedSlotIndex;
    const item = bag?.getItem(slot);
    if (item?.typeId !== id) return false;
    if (item.amount > 1) { item.amount--; bag.setItem(slot, item); }
    else bag.setItem(slot, undefined);
    return true;
}
export function wall(entity) {
    const p = entity.location;
    return [[0.65,0],[-0.65,0],[0,0.65],[0,-0.65]].some(([x,z]) => blockAt(entity.dimension, { x: p.x+x, y:p.y+0.5,z:p.z+z })?.isSolid === true);
}
export function ownedEffect(e, name, seconds, amplifier = 0) {
    safe(() => e.addEffect(name, Math.ceil(seconds * 20), { amplifier, showParticles: false }));
}
const scanCursor = new Map();
export function forLoadedEntities(callback, family) {
    const seen = new Set();
    const players = world.getPlayers();
    if (!players.length) return;
    const key = family ?? "all";
    const start = scanCursor.get(key) ?? 0;
    scanCursor.set(key, (start + 8) % players.length);
    for (let i = 0; i < Math.min(8, players.length); i++) {
        const p = players[(start + i) % players.length];
        for (const e of safe(() => p.dimension.getEntities({ location:p.location, maxDistance:64, closest:64, ...(family ? {families:[family]} : {}) })) ?? []) {
            if (seen.has(e.id)) continue;
            seen.add(e.id);
            callback(e);
            if (seen.size >= 192) return;
        }
    }
}
