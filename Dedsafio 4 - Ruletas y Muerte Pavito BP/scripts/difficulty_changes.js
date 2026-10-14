import { EntityDamageCause, GameMode, system, world } from "@minecraft/server";
import { DIFFICULTY_CHANGES } from "./difficulty/catalog.js";
import { ROULETTE_COLORS, startRoulette } from "./roulette.js";
import { isAdmin, sendAdminMessage } from "./admin.js";

const PROPERTY_PREFIX = "pavi_difficulty_change_";
const OVERWORLD_ID = "minecraft:overworld";
const NETHER_ID = "minecraft:nether";
const NATURAL_SPAWN_CHECK_TICKS = 400;
const ZOMBIE_CLIMB_CHECK_TICKS = 20;
const MAGMA_CHECK_TICKS = 2;
const GRASS_CREEPER_SPAWN_CHANCE = 0.60;
const GRASS_CREEPER_MAX_NEARBY = 3;
const GRASS_CREEPER_TYPE = "pavi:creeper_de_pasto";
const WARDEN_CHANGE_TAG = "pavi:difficulty_warden";
const CHARGED_CREEPER_CHANGE_TAG = "pavi:difficulty_charged_creeper";
const BLAZE_CHANGE_TAG = "pavi:difficulty_blaze";
const GRASS_CREEPER_CHANGE_TAG = "pavi:difficulty_grass_creeper";
const VANILLA_DIMENSIONS = ["overworld", "nether", "the_end"];

const SAPLING_ITEMS = new Set([
	"minecraft:oak_sapling",
	"minecraft:spruce_sapling",
	"minecraft:birch_sapling",
	"minecraft:jungle_sapling",
	"minecraft:acacia_sapling",
	"minecraft:dark_oak_sapling",
	"minecraft:cherry_sapling",
	"minecraft:pale_oak_sapling",
	"minecraft:mangrove_propagule",
	"minecraft:azalea",
	"minecraft:flowering_azalea",
]);
const HIVE_BLOCKS = new Set(["minecraft:bee_nest", "minecraft:beehive"]);
const MAGMA_BLOCKS = new Set(["minecraft:magma", "minecraft:magma_block"]);
const GRASS_CREEPER_TRIGGER_BLOCKS = new Set([
	"minecraft:grass_block",
	"minecraft:short_grass",
	"minecraft:tall_grass",
	"minecraft:tallgrass",
	"minecraft:fern",
	"minecraft:large_fern",
	"minecraft:deadbush",
	"minecraft:bush",
	"minecraft:firefly_bush",
	"minecraft:sweet_berry_bush",
	"minecraft:dry_short_grass",
	"minecraft:dry_tall_grass",
	"minecraft:azalea",
	"minecraft:flowering_azalea",
	"minecraft:leaf_litter",
]);

export { DIFFICULTY_CHANGES } from "./difficulty/catalog.js";

const activeChanges = new Map(DIFFICULTY_CHANGES.map((change) => [change.id, false]));
let pendingChangeId;
let pendingRouletteController;

system.run(() => {
	for (const change of DIFFICULTY_CHANGES) {
		try {
			activeChanges.set(change.id, world.getDynamicProperty(getPropertyId(change.id)) === true);
		} catch (error) {
			console.warn(`[Dedsafio 4] No se pudo cargar ${change.title}: ${error}`);
		}
	}
});

export { showDifficultyConfiguration } from "./difficulty/menu.js";
export function getPendingDifficultyId() { return pendingChangeId; }

export function isDifficultyChangeActive(id) {
	return activeChanges.get(id) === true;
}

export function toggleDifficultyChange(change, player) {
	if (!isAdmin(player)) return false;

	if (pendingChangeId === change.id) {
		pendingRouletteController?.cancel();
		pendingChangeId = undefined;
		pendingRouletteController = undefined;
		return true;
	}

	if (isDifficultyChangeActive(change.id)) {
		setDifficultyChangeActive(change.id, false);
		sendAdminMessage(player, `§c${change.title} ha sido desactivado.§r`);
		return true;
	}

	if (pendingChangeId !== undefined) {
		sendAdminMessage(player, "§cYa hay un Cambio de Dificultad esperando que termine su ruleta.");
		return false;
	}

	pendingChangeId = change.id;
	const rouletteColorId = change.rouletteColor ?? "naranja";
	const rouletteColor = ROULETTE_COLORS.find((color) => color.id === rouletteColorId)
		?? ROULETTE_COLORS.find((color) => color.id === "naranja")
		?? ROULETTE_COLORS[0];
	pendingRouletteController = startRoulette(`${change.title}\n${change.description}`, rouletteColor, () => {
		setDifficultyChangeActive(change.id, true);
		pendingChangeId = undefined;
		pendingRouletteController = undefined;
	});
	return false;
}

export function setDifficultyChangeActive(id, active) {
	activeChanges.set(id, active);
	try {
		world.setDynamicProperty(getPropertyId(id), active);
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo guardar el Cambio de Dificultad #${id}: ${error}`);
	}
	if (!active) cleanupDifficultyEntities(id);
}

function getPropertyId(id) {
	return `${PROPERTY_PREFIX}${id}`;
}

world.afterEvents.entitySpawn?.subscribe((event) => {
	const entity = event.entity;
	if (!entity) return;

	if (entity.typeId === "minecraft:item" && (isDifficultyChangeActive(1) || isDifficultyChangeActive(6))) {
		system.run(() => removeForbiddenDrop(entity));
	}

	if (entity.typeId === "minecraft:creeper" && isDifficultyChangeActive(4) && isDimension(entity.dimension, OVERWORLD_ID)) {
		system.run(() => chargeCreeper(entity));
	}
});

world.beforeEvents.playerInteractWithEntity?.subscribe((event) => {
	if (!isDifficultyChangeActive(3)) return;
	if (event.itemStack?.typeId !== "minecraft:bucket") return;
	if (event.target?.typeId !== "minecraft:cow" && event.target?.typeId !== "minecraft:mooshroom") return;

	event.cancel = true;
});

world.beforeEvents.playerInteractWithBlock?.subscribe((event) => {
	if (!isDifficultyChangeActive(6)) return;
	if (event.itemStack?.typeId !== "minecraft:glass_bottle") return;
	if (!HIVE_BLOCKS.has(event.block?.typeId)) return;

	event.cancel = true;
	system.run(() => sendAdminMessage(event.player, "§cYa no se puede conseguir miel."));
});

world.afterEvents.playerBreakBlock?.subscribe((event) => {
	const blockTypeId = event.brokenBlockPermutation?.type?.id ?? event.brokenBlockPermutation?.typeId;
	const location = event.block?.location;
	if (!location || !blockTypeId) return;

	if (isDifficultyChangeActive(6) && HIVE_BLOCKS.has(blockTypeId)) {
		try {
			event.player.dimension.createExplosion(
				{ x: location.x + 0.5, y: location.y + 0.5, z: location.z + 0.5 },
				4,
				{ breaksBlocks: true, causesFire: false },
			);
		} catch (error) {
			console.warn(`[Dedsafio 4] No se pudo hacer explotar el panal: ${error}`);
		}
	}

	if (isDifficultyChangeActive(9) && GRASS_CREEPER_TRIGGER_BLOCKS.has(blockTypeId)) {
		trySpawnGrassCreeper(event.player, location);
	}
});

system.runInterval(() => {
	if (isDifficultyChangeActive(2)) trySpawnWardens();
	if (isDifficultyChangeActive(5)) trySpawnBlazes();
}, NATURAL_SPAWN_CHECK_TICKS);

system.runInterval(() => {
	if (!isDifficultyChangeActive(7)) return;
	for (const player of world.getPlayers()) {
		if (isSpectator(player) || !isTouchingMagma(player)) continue;
		try {
			player.applyDamage(1_000_000, { cause: EntityDamageCause.magma });
		} catch {
			try {
				player.kill();
			} catch {}
		}
	}
}, MAGMA_CHECK_TICKS);

system.runInterval(() => {
	if (!isDifficultyChangeActive(8)) return;
	const checked = new Set();
	for (const player of world.getPlayers()) {
		let zombies = [];
		try {
			zombies = player.dimension.getEntities({
				type: "minecraft:zombie",
				location: player.location,
				maxDistance: 48,
			});
		} catch {}

		for (const zombie of zombies) {
			if (checked.has(zombie.id)) continue;
			checked.add(zombie.id);
			if (Math.random() > 0.28 || !isBesideWall(zombie)) continue;
			try {
				zombie.addEffect("levitation", 24, { amplifier: 1, showParticles: false });
			} catch {}
		}
	}
}, ZOMBIE_CLIMB_CHECK_TICKS);

function removeForbiddenDrop(entity) {
	try {
		if (!entity.isValid) return;
		const itemStack = entity.getComponent("minecraft:item")?.itemStack;
		if (!itemStack) return;
		if (isDifficultyChangeActive(1) && SAPLING_ITEMS.has(itemStack.typeId)) entity.remove();
		if (isDifficultyChangeActive(6) && itemStack.typeId === "minecraft:honey_bottle") entity.remove();
	} catch {}
}

function chargeCreeper(creeper) {
	try {
		if (!creeper.isValid) return;
		creeper.triggerEvent("minecraft:become_charged");
		creeper.addTag(CHARGED_CREEPER_CHANGE_TAG);
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo convertir un Creeper en eléctrico: ${error}`);
	}
}

function trySpawnWardens() {
	for (const player of world.getPlayers()) {
		if (Math.random() > 0.25 || !isBiome(player, "minecraft:deep_dark")) continue;
		if (countNearby(player, "minecraft:warden", 64) >= 1) continue;
		const location = findNearbySpawnLocation(player, 8, 18);
		if (!location) continue;
		try {
			player.dimension.spawnEntity("minecraft:warden", location).addTag(WARDEN_CHANGE_TAG);
		} catch {}
	}
}

function trySpawnBlazes() {
	for (const player of world.getPlayers()) {
		if (!isDimension(player.dimension, NETHER_ID) || Math.random() > 0.35) continue;
		if (countNearby(player, "minecraft:blaze", 64) >= 4) continue;
		const location = findNearbySpawnLocation(player, 8, 20, false);
		if (!location) continue;
		try {
			player.dimension.spawnEntity("minecraft:blaze", location).addTag(BLAZE_CHANGE_TAG);
		} catch {}
	}
}

function trySpawnGrassCreeper(player, blockLocation) {
	if (Math.random() >= GRASS_CREEPER_SPAWN_CHANCE) return;
	if (countNearby(player, GRASS_CREEPER_TYPE, 32) >= GRASS_CREEPER_MAX_NEARBY) return;

	const dimension = player.dimension;
	const spawnLocation = {
		x: blockLocation.x + 0.5,
		y: blockLocation.y,
		z: blockLocation.z + 0.5,
	};
	system.run(() => {
		if (!isDifficultyChangeActive(9)) return;
		try {
			dimension.spawnEntity(GRASS_CREEPER_TYPE, spawnLocation).addTag(GRASS_CREEPER_CHANGE_TAG);
		} catch (error) {
			console.warn(`[Dedsafio 4] No se pudo generar un Creeper de Pasto: ${error}`);
		}
	});
}

function cleanupDifficultyEntities(id) {
	for (const dimensionId of VANILLA_DIMENSIONS) {
		let dimension;
		try {
			dimension = world.getDimension(dimensionId);
		} catch {
			continue;
		}

		if (id === 2) removeTaggedEntities(dimension, "minecraft:warden", WARDEN_CHANGE_TAG);
		if (id === 5) removeTaggedEntities(dimension, "minecraft:blaze", BLAZE_CHANGE_TAG);
		if (id === 9) removeTaggedEntities(dimension, GRASS_CREEPER_TYPE, GRASS_CREEPER_CHANGE_TAG);
		if (id !== 4) continue;

		let creepers = [];
		try {
			creepers = dimension.getEntities({ type: "minecraft:creeper" });
		} catch {}
		for (const creeper of creepers) {
			try {
				if (!creeper.hasTag(CHARGED_CREEPER_CHANGE_TAG)) continue;
				const location = creeper.location;
				creeper.remove();
				dimension.spawnEntity("minecraft:creeper", location);
			} catch {}
		}
	}
}

function removeTaggedEntities(dimension, type, tag) {
	let entities = [];
	try {
		entities = dimension.getEntities({ type });
	} catch {}
	for (const entity of entities) {
		try {
			if (entity.hasTag(tag)) entity.remove();
		} catch {}
	}
}

function isBiome(entity, biomeId) {
	try {
		return entity.dimension.getBiome(entity.location)?.id === biomeId;
	} catch {
		return false;
	}
}

function countNearby(entity, type, maxDistance) {
	try {
		return entity.dimension.getEntities({ type, location: entity.location, maxDistance }).length;
	} catch {
		return 0;
	}
}

function findNearbySpawnLocation(player, minimumDistance, maximumDistance, needsFloor = true) {
	for (let attempt = 0; attempt < 12; attempt++) {
		const angle = Math.random() * Math.PI * 2;
		const distance = minimumDistance + Math.random() * (maximumDistance - minimumDistance);
		const location = {
			x: Math.floor(player.location.x + Math.cos(angle) * distance) + 0.5,
			y: Math.floor(player.location.y + Math.floor(Math.random() * 9) - 4),
			z: Math.floor(player.location.z + Math.sin(angle) * distance) + 0.5,
		};
		try {
			const feet = player.dimension.getBlock(location);
			const head = player.dimension.getBlock({ x: location.x, y: location.y + 1, z: location.z });
			const floor = player.dimension.getBlock({ x: location.x, y: location.y - 1, z: location.z });
			if (!isPassable(feet) || !isPassable(head)) continue;
			if (needsFloor && isPassable(floor)) continue;
			return location;
		} catch {}
	}
	return undefined;
}

function isTouchingMagma(player) {
	const { x, y, z } = player.location;
	const horizontalOffsets = [
		[0, 0],
		[-0.31, 0],
		[0.31, 0],
		[0, -0.31],
		[0, 0.31],
	];
	const yOffsets = [-0.12, 0.05, 0.9, 1.72];
	const positions = [];

	for (const [xOffset, zOffset] of horizontalOffsets) {
		for (const yOffset of yOffsets) positions.push({ x: x + xOffset, y: y + yOffset, z: z + zOffset });
	}

	for (const position of positions) {
		try {
			if (MAGMA_BLOCKS.has(player.dimension.getBlock(position)?.typeId)) return true;
		} catch {}
	}
	return false;
}

function isBesideWall(entity) {
	const { x, y, z } = entity.location;
	const positions = [
		{ x: x + 0.72, y: y + 0.4, z },
		{ x: x - 0.72, y: y + 0.4, z },
		{ x, y: y + 0.4, z: z + 0.72 },
		{ x, y: y + 0.4, z: z - 0.72 },
		{ x: x + 0.72, y: y + 1.2, z },
		{ x: x - 0.72, y: y + 1.2, z },
		{ x, y: y + 1.2, z: z + 0.72 },
		{ x, y: y + 1.2, z: z - 0.72 },
	];
	return positions.some((position) => {
		try {
			return !isPassable(entity.dimension.getBlock(position));
		} catch {
			return false;
		}
	});
}

function isPassable(block) {
	if (!block) return true;
	if (block.isAir === true || block.isLiquid === true) return true;
	return block.typeId === "minecraft:air"
		|| block.typeId === "minecraft:cave_air"
		|| block.typeId === "minecraft:void_air"
		|| block.typeId === "minecraft:water"
		|| block.typeId === "minecraft:flowing_water"
		|| block.typeId === "minecraft:lava"
		|| block.typeId === "minecraft:flowing_lava";
}

function isDimension(dimension, expectedId) {
	const id = dimension?.id ?? "";
	return id === expectedId || id === expectedId.replace("minecraft:", "");
}

function isSpectator(player) {
	try {
		return player.getGameMode() === GameMode.Spectator;
	} catch {
		return false;
	}
}
