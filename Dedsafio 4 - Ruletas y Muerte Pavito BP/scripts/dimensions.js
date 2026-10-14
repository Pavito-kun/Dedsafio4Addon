import * as mc from "@minecraft/server";

const { CommandPermissionLevel, CustomCommandStatus, system, world } = mc;

const GLEBA_ID = "pavi:gleba";
const LIMBO_ID = "pavi:limbo";
const OVERWORLD_ID = "minecraft:overworld";
const DIMENSION_STATE_PROPERTY = "pavi_dedsafio_dimensions_built_v4";
const LANDING_Y = 70;
const BED_TRAVEL_COOLDOWN_MS = 1500;
const LIMBO_TILE_SIZE = 64;
const LIMBO_TILE_RETRY_TICKS = 100;
const DIMENSION_COMMANDS = {
	gleba: "pavi:gleba",
	limbo: "pavi:limbo",
	return: "pavi:overworld",
};

let builtDimensions = new Set();
const buildingDimensions = new Set();
const dimensionBuildWaiters = new Map();
const lastBedTravelAt = new Map();
const limboTileRetryAt = new Map();
const buildingLimboTiles = new Set();
const FILL_COMMANDS_PER_TICK = 3;

system.run(() => loadBuildState());
system.runInterval(() => expandLimboForPlayers(), 20);

world.afterEvents.playerBreakBlock?.subscribe((event) => {
	if (event.brokenBlockPermutation?.type?.id !== "minecraft:bed") return;

	const player = event.player;
	const now = Date.now();
	if (now - (lastBedTravelAt.get(player.id) ?? 0) < BED_TRAVEL_COOLDOWN_MS) return;
	lastBedTravelAt.set(player.id, now);
	system.run(() => {
		if (!isValidPlayer(player)) return;
		const destinationId = player.dimension.id === OVERWORLD_ID
			? LIMBO_ID
			: OVERWORLD_ID;
		travelToDimension(player, destinationId);
	});
});

system.beforeEvents.startup.subscribe((event) => {
	if (!event.customCommandRegistry?.registerCommand || !CommandPermissionLevel) return;

	registerTravelCommand(event, DIMENSION_COMMANDS.gleba, "Viaja a la dimension Gleba.", GLEBA_ID);
	registerTravelCommand(event, DIMENSION_COMMANDS.limbo, "Viaja a la dimension Limbo.", LIMBO_ID);
	registerTravelCommand(event, DIMENSION_COMMANDS.return, "Regresa al Overworld.", OVERWORLD_ID);
});

function registerTravelCommand(event, name, description, dimensionId) {
	try {
		event.customCommandRegistry.registerCommand(
			{
				name,
				description,
				permissionLevel: CommandPermissionLevel.Any,
				cheatsRequired: false,
			},
			(origin) => {
				const player = origin?.sourceEntity;
				if (!isValidPlayer(player)) {
					return {
						status: CustomCommandStatus?.Failure ?? "Failure",
						message: "Este comando solo puede usarlo un jugador.",
					};
				}

				system.run(() => travelToDimension(player, dimensionId));
				return {
					status: CustomCommandStatus?.Success ?? "Success",
					message: `Viajando a ${getDimensionName(dimensionId)}.`,
				};
			},
		);
	} catch (error) {
		const detail = String(error);
		if (detail.includes("cannot change parameters")) {
			console.warn("[Dedsafio 4] Reinicia el mundo para actualizar los comandos de dimensiones.");
			return;
		}
		console.warn(`[Dedsafio 4] No se pudo registrar el comando ${name}: ${error}`);
	}
}

function travelToDimension(player, dimensionId) {
	let destination;
	try {
		destination = world.getDimension(dimensionId);
	} catch (error) {
		player.sendMessage(`\u00A7cNo se pudo encontrar la dimension ${getDimensionName(dimensionId)}: ${error}`);
		return;
	}

	const target = dimensionId === OVERWORLD_ID
		? { x: 0.5, y: 100, z: 0.5 }
		: { x: 0.5, y: LANDING_Y, z: 0.5 };

	try {
		player.teleport(target, { dimension: destination });
		if (dimensionId !== OVERWORLD_ID && !builtDimensions.has(dimensionId)) {
			system.runTimeout(() => buildDimensionForPlayer(player, dimensionId), 3);
		}
		player.sendMessage(`\u00A7aLlegaste a ${getDimensionName(dimensionId)}.`);
	} catch (error) {
		player.sendMessage(`\u00A7cNo se pudo viajar a ${getDimensionName(dimensionId)}: ${error}`);
	}
}

function buildDimensionForPlayer(player, dimensionId) {
	if (!isValidPlayer(player) || player.dimension.id !== dimensionId
		|| builtDimensions.has(dimensionId) || buildingDimensions.has(dimensionId)) return;

	buildingDimensions.add(dimensionId);
	try {
		const commands = [];
		const fill = (...args) => commands.push(args);
		if (dimensionId === GLEBA_ID) buildGleba(fill);
		else if (dimensionId === LIMBO_ID) buildLimbo(fill);
		else { buildingDimensions.delete(dimensionId); return; }
		runFillQueue(player, dimensionId, commands, () => {
			builtDimensions.add(dimensionId);
			saveBuildState();
			buildingDimensions.delete(dimensionId);
			settleDimensionBuild(dimensionId, true);
		}, (error) => {
			buildingDimensions.delete(dimensionId);
			settleDimensionBuild(dimensionId, false);
			console.warn(`[Dedsafio 4] No se pudo construir ${getDimensionName(dimensionId)}: ${error}`);
		});
	} catch (error) {
		buildingDimensions.delete(dimensionId);
		settleDimensionBuild(dimensionId, false);
		console.warn(`[Dedsafio 4] No se pudo construir ${getDimensionName(dimensionId)}: ${error}`);
	}
}

export function prepareDimensionForPlayer(player, dimensionId) {
	if (builtDimensions.has(dimensionId)) return Promise.resolve(true);
	return new Promise((resolve) => {
		const waiters = dimensionBuildWaiters.get(dimensionId) ?? [];
		waiters.push(resolve);
		dimensionBuildWaiters.set(dimensionId, waiters);
		if (!buildingDimensions.has(dimensionId)) buildDimensionForPlayer(player, dimensionId);
	});
}

function settleDimensionBuild(dimensionId, success) {
	const waiters = dimensionBuildWaiters.get(dimensionId) ?? [];
	dimensionBuildWaiters.delete(dimensionId);
	for (const resolve of waiters) resolve(success);
}

function buildGleba(fill) {

	// Clear the old island layout, then make a continuous rolling floor across the cavern.
	clearOldFloor(fill);
	fill(-64, 59, -64, 64, 59, 64, "minecraft:crimson_nylium");
	buildContinuousFloor(fill, "minecraft:nether_wart_block", [
		[1, 1, 2, 2, 2, 1, 1, 0],
		[1, 2, 2, 3, 2, 2, 1, 0],
		[0, 1, 2, 2, 3, 2, 1, 1],
		[0, 1, 1, 2, 2, 2, 2, 1],
		[1, 1, 2, 2, 1, 2, 3, 2],
		[1, 2, 2, 1, 1, 2, 2, 2],
		[2, 2, 1, 1, 2, 2, 1, 1],
		[1, 1, 1, 2, 2, 1, 1, 0],
	]);
	fill(-64, 61, -64, -64, 111, 64, "minecraft:netherrack");
	fill(64, 61, -64, 64, 111, 64, "minecraft:netherrack");
	fill(-63, 61, -64, 63, 111, -64, "minecraft:netherrack");
	fill(-63, 61, 64, 63, 111, 64, "minecraft:netherrack");
	fill(-64, 112, -64, 64, 112, 64, "minecraft:nether_wart_block");

	buildPool(fill, -47, -23, -37, -19, "minecraft:netherrack", "minecraft:crimson_nylium", "minecraft:water");
	buildPool(fill, 13, 37, -48, -30, "minecraft:netherrack", "minecraft:crimson_nylium", "minecraft:water");
	buildPool(fill, 27, 49, 17, 39, "minecraft:netherrack", "minecraft:crimson_nylium", "minecraft:water");

	const hangingFlesh = [
		[-48, -40, 5], [-31, -12, 8], [-12, 24, 6], [8, -34, 9], [29, -6, 7],
		[47, 34, 5], [39, -46, 6], [-42, 42, 7], [2, 47, 5],
	];
	for (const [x, z, length] of hangingFlesh) {
		fill(x - 2, 112 - length, z - 2, x + 2, 111, z + 2, "minecraft:netherrack");
		fill(x - 1, 112 - length - 2, z - 1, x + 1, 112 - length - 1, z + 1, "minecraft:nether_wart_block");
	}

	fill(-4, 61, -4, 4, 61, 4, "minecraft:red_nether_bricks");
	fill(-4, 62, -4, 4, 68, 4, "minecraft:air");
	// Organic sources for the Day 7 creatures, only when the original chamber is built.
	// Existing worlds are not cleared or rebuilt to add these deposits.
	for (const [x, z, material] of [
		[-13, -42, "pavi:grasa_liquida"], [12, 16, "pavi:grasa_coagulada"],
		[-28, 34, "pavi:verruga_clara"], [43, -7, "pavi:verruga_oscura"],
	]) {
		fill(x - 2, 63, z - 2, x + 2, 63, z + 2, material);
		fill(x - 1, 64, z - 1, x + 1, 65, z + 1, material);
	}
}

function buildLimbo(fill) {

	// Turn the old flat chamber into a suspended ruin over a deep abyss.
	clearOldFloor(fill);
	fill(-64, 61, -64, -64, 119, 64, "minecraft:deepslate");
	fill(64, 61, -64, 64, 119, 64, "minecraft:deepslate");
	fill(-63, 61, -64, 63, 119, -64, "minecraft:deepslate");
	fill(-63, 61, 64, 63, 119, 64, "minecraft:deepslate");
	fill(-64, 120, -64, 64, 120, 64, "minecraft:polished_blackstone_bricks");
	// Remove the old room's four hard borders so its exits lead into the caves.
	fill(64, 61, -63, 64, 119, 63, "minecraft:air");
	fill(-64, 61, -63, -64, 119, 63, "minecraft:air");
	fill(-63, 61, 64, 63, 119, 64, "minecraft:air");
	fill(-63, 61, -64, 63, 119, -64, "minecraft:air");

	// Main arena island: layered and tapered underside, like a massive broken keep.
	fill(-8, 52, -8, 8, 55, 8, "minecraft:deepslate");
	fill(-13, 56, -13, 13, 58, 13, "minecraft:polished_blackstone");
	fill(-17, 59, -17, 17, 60, 17, "minecraft:polished_blackstone_bricks");
	fill(-16, 61, -16, 16, 61, 16, "minecraft:deepslate_tiles");
	fill(-18, 61, -18, 18, 61, -17, "minecraft:polished_blackstone_bricks");
	fill(-18, 61, 17, 18, 61, 18, "minecraft:polished_blackstone_bricks");
	fill(-18, 61, -16, -17, 61, 16, "minecraft:polished_blackstone_bricks");
	fill(17, 61, -16, 18, 61, 16, "minecraft:polished_blackstone_bricks");

	// A fractured, red-lit pattern through the central stone floor.
	fill(-12, 61, -1, -7, 61, 1, "minecraft:redstone_block");
	fill(-5, 61, -1, 2, 61, 1, "minecraft:crying_obsidian");
	fill(4, 61, -1, 12, 61, 1, "minecraft:redstone_block");
	fill(-1, 61, -12, 1, 61, -4, "minecraft:crying_obsidian");
	fill(-1, 61, 4, 1, 61, 12, "minecraft:redstone_block");

	// Northern fortress and its large crimson sealed gate.
	fill(-19, 62, -54, 19, 64, -26, "minecraft:deepslate_bricks");
	fill(-16, 65, -51, 16, 65, -29, "minecraft:polished_blackstone_bricks");
	buildLimboTower(fill, -15, -49, 65, 18, "minecraft:polished_blackstone");
	buildLimboTower(fill, 15, -49, 65, 18, "minecraft:polished_blackstone");
	buildLimboTower(fill, -15, -29, 65, 14, "minecraft:deepslate_bricks");
	buildLimboTower(fill, 15, -29, 65, 14, "minecraft:deepslate_bricks");
	fill(-8, 65, -40, -6, 82, -38, "minecraft:polished_blackstone_bricks");
	fill(6, 65, -40, 8, 82, -38, "minecraft:polished_blackstone_bricks");
	fill(-8, 80, -40, 8, 82, -38, "minecraft:polished_blackstone_bricks");
	fill(-5, 67, -39, 5, 78, -39, "minecraft:red_stained_glass");
	fill(-6, 66, -40, 6, 66, -38, "minecraft:crimson_nylium");
	buildLimboBridge(fill, "z", 0, -18, -26, 61, 65);

	// Separate floating platforms, linked by narrow stepped bridges.
	const islands = [
		[-42, 0, 56, 9, 8], [42, 0, 56, 9, 8], [0, 42, 56, 8, 9],
		[-42, -42, 69, 8, 8], [42, -42, 69, 8, 8], [-42, 42, 66, 8, 8], [42, 42, 66, 8, 8],
		[-4, -54, 76, 9, 8], [48, 22, 73, 7, 8], [-50, -18, 72, 7, 8],
	];
	for (const [x, z, topY, radiusX, radiusZ] of islands) {
		buildFloatingIsland(fill, x, z, topY, radiusX, radiusZ);
	}
	buildLimboBridge(fill, "x", 0, 18, 32, 61, 56);
	buildLimboBridge(fill, "x", 0, -18, -32, 61, 56);
	buildLimboBridge(fill, "z", 0, 18, 32, 61, 56);

	// Four broad, low exits join the spawn island to the first cave sectors.
	buildLimboBridge(fill, "x", 0, 52, 63, 56, 56);
	buildLimboBridge(fill, "z", 63, 0, 32, 56, 56);
	buildLimboBridge(fill, "x", 0, -52, -63, 56, 56);
	buildLimboBridge(fill, "z", -63, 0, 32, 56, 56);
	buildLimboBridge(fill, "z", 0, 52, 63, 56, 56);
	buildLimboBridge(fill, "x", 63, 0, 32, 56, 56);
	buildLimboStairBridge(fill, 0, -55, -64, 65, 56);
	buildLimboBridge(fill, "x", -64, 0, 32, 56, 56);

	// Tower silhouettes, hanging chains and pointed roof formations frame the chasm.
	const pillars = [
		[-48, -43, 47], [-32, -8, 38], [-15, -49, 53], [8, -37, 42], [34, -50, 49],
		[49, -19, 55], [-49, 7, 44], [-34, 41, 51], [-8, 32, 37], [17, 47, 50],
		[42, 31, 43], [10, 4, 56], [54, 51, 48], [-55, 54, 46],
	];
	for (const [x, z, height] of pillars) {
		fill(x - 2, 52, z - 2, x + 2, 61 + height, z + 2, "minecraft:polished_blackstone");
		fill(x - 3, 62 + height, z - 3, x + 3, 64 + height, z + 3, "minecraft:deepslate_bricks");
		fill(x - 1, 65 + height, z - 1, x + 1, 65 + height, z + 1, "minecraft:soul_torch");
	}

	// Put the basins after the pillars so their water stays unobstructed.
	buildLimboPool(fill, -45, -33, -6, 6);
	buildLimboPool(fill, 35, 49, -7, 7);
	buildLimboPool(fill, -7, 7, 35, 49);
	for (const [x, z, endY] of [[-53, -28, 89], [-28, 23, 96], [27, -11, 88], [52, 39, 94], [0, 51, 91], [20, -55, 97]]) {
		fill(x, endY, z, x, 117, z, "minecraft:chain");
		fill(x - 3, endY - 5, z - 3, x + 3, endY - 3, z + 3, "minecraft:deepslate");
		fill(x - 2, endY - 2, z - 2, x + 2, endY - 1, z + 2, "minecraft:crying_obsidian");
	}
	for (const [x, z, length] of [[-42, -4, 11], [41, -26, 16], [27, 47, 12], [-20, 49, 18], [2, -13, 9], [55, 3, 13]]) {
		fill(x - 2, 119 - length, z - 2, x + 2, 119, z + 2, "minecraft:deepslate");
		fill(x - 1, 119 - length - 2, z - 1, x + 1, 119 - length - 1, z + 1, "minecraft:polished_blackstone_bricks");
	}

	// Flame colors echo the orange and cyan braziers in the reference.
	for (const [x, z, y] of [[-15, -49, 84], [15, -49, 84], [-15, -29, 80], [15, -29, 80], [0, 0, 62], [-42, -42, 70], [42, -42, 70], [-42, 42, 67], [42, 42, 67]]) {
		fill(x, y, z, x, y, z, "minecraft:soul_torch");
	}
}

function clearOldFloor(fill) {
	// Each slice stays below the fill command's block limit; this migrates worlds
	// that already generated the earlier isolated mounds without leaving them behind.
	for (let z = -64; z <= 64; z += 25) {
		const maxZ = Math.min(64, z + 25);
		fill(-64, 59, z, 64, 63, maxZ, "minecraft:air");
		fill(-64, 64, z, 64, 68, maxZ, "minecraft:air");
	}
}

function buildContinuousFloor(fill, material, heights) {
	for (let row = 0; row < heights.length; row++) {
		for (let column = 0; column < heights[row].length; column++) {
			const height = heights[row][column];
			if (height <= 0) continue;
			const minX = -64 + column * 16;
			const minZ = -64 + row * 16;
			fill(minX, 60, minZ, minX + 15, 59 + height, minZ + 15, material);
		}
	}
}

function buildPool(fill, minX, maxX, minZ, maxZ, borderBlock, floorBlock, waterBlock) {
	// Raise a three-block rim, then fill a two-block-deep basin with source water.
	fill(minX, 60, minZ, maxX, 68, maxZ, "minecraft:air");
	fill(minX + 1, 59, minZ + 1, maxX - 1, 59, maxZ - 1, floorBlock);
	fill(minX, 60, minZ, maxX, 62, minZ, borderBlock);
	fill(minX, 60, maxZ, maxX, 62, maxZ, borderBlock);
	fill(minX, 60, minZ + 1, minX, 62, maxZ - 1, borderBlock);
	fill(maxX, 60, minZ + 1, maxX, 62, maxZ - 1, borderBlock);
	fill(minX + 1, 60, minZ + 1, maxX - 1, 61, maxZ - 1, waterBlock);
}

function buildFloatingIsland(fill, centerX, centerZ, topY, radiusX, radiusZ) {
	fill(centerX - radiusX, topY, centerZ - radiusZ, centerX + radiusX, topY, centerZ + radiusZ, "minecraft:deepslate_tiles");
	const undersideLayers = [
		[1, 2, radiusX, radiusZ, "minecraft:polished_blackstone"],
		[3, 4, Math.max(2, radiusX - 2), Math.max(2, radiusZ - 2), "minecraft:polished_blackstone"],
		[5, 7, Math.max(2, radiusX - 4), Math.max(2, radiusZ - 4), "minecraft:deepslate"],
		[8, 9, 2, 2, "minecraft:deepslate"],
	];
	for (const [firstDepth, lastDepth, rx, rz, material] of undersideLayers) {
		fill(centerX - rx, topY - lastDepth, centerZ - rz, centerX + rx, topY - firstDepth, centerZ + rz, material);
	}
	fill(centerX - 2, topY - 10, centerZ - 2, centerX + 2, topY - 10, centerZ + 2, "minecraft:crying_obsidian");
}

function buildLimboTower(fill, centerX, centerZ, baseY, height, material) {
	fill(centerX - 2, baseY, centerZ - 2, centerX + 2, baseY + height, centerZ + 2, material);
	fill(centerX - 4, baseY + height + 1, centerZ - 4, centerX + 4, baseY + height + 2, centerZ + 4, "minecraft:polished_blackstone_bricks");
	fill(centerX - 3, baseY + height + 3, centerZ - 3, centerX + 3, baseY + height + 3, centerZ + 3, "minecraft:deepslate_bricks");
}

function buildLimboBridge(fill, axis, fixed, start, end, startY, endY) {
	const direction = Math.sign(end - start) || 1;
	const distance = Math.max(1, Math.abs(end - start));
	for (let offset = 0; offset <= distance; offset += 2) {
		const first = start + direction * offset;
		const last = start + direction * Math.min(distance, offset + 1);
		const y = Math.round(startY + (endY - startY) * (offset / distance));
		if (axis === "x") {
			fill(Math.min(first, last), y, fixed - 1, Math.max(first, last), y, fixed + 1, "minecraft:polished_blackstone_bricks");
		} else {
			fill(fixed - 1, y, Math.min(first, last), fixed + 1, y, Math.max(first, last), "minecraft:polished_blackstone_bricks");
		}
	}
}

function buildLimboPool(fill, minX, maxX, minZ, maxZ) {
	const baseY = 56;
	fill(minX + 1, baseY + 1, minZ + 1, maxX - 1, baseY + 3, maxZ - 1, "minecraft:air");
	fill(minX + 1, baseY, minZ + 1, maxX - 1, baseY, maxZ - 1, "minecraft:deepslate_bricks");
	fill(minX, baseY + 1, minZ, maxX, baseY + 3, minZ, "minecraft:polished_blackstone");
	fill(minX, baseY + 1, maxZ, maxX, baseY + 3, maxZ, "minecraft:polished_blackstone");
	fill(minX, baseY + 1, minZ + 1, minX, baseY + 3, maxZ - 1, "minecraft:polished_blackstone");
	fill(maxX, baseY + 1, minZ + 1, maxX, baseY + 3, maxZ - 1, "minecraft:polished_blackstone");
	fill(minX + 1, baseY + 1, minZ + 1, maxX - 1, baseY + 2, maxZ - 1, "minecraft:water");
}

function expandLimboForPlayers() {
	for (const player of world.getAllPlayers()) {
		try {
			if (!isValidPlayer(player) || player.dimension.id !== LIMBO_ID) continue;
			const { x, z } = player.location;
			const tileX = Math.floor(x / LIMBO_TILE_SIZE);
			const tileZ = Math.floor(z / LIMBO_TILE_SIZE);
			const localX = x - tileX * LIMBO_TILE_SIZE;
			const localZ = z - tileZ * LIMBO_TILE_SIZE;
			const candidates = [[tileX, tileZ]];
			if (localX < 12) candidates.push([tileX - 1, tileZ]);
			if (localX > LIMBO_TILE_SIZE - 12) candidates.push([tileX + 1, tileZ]);
			if (localZ < 12) candidates.push([tileX, tileZ - 1]);
			if (localZ > LIMBO_TILE_SIZE - 12) candidates.push([tileX, tileZ + 1]);

			// Only build one cell per scan so exploration does not trigger a large burst.
			for (const [candidateX, candidateZ] of candidates) {
				if (ensureLimboCaveTile(player, candidateX, candidateZ)) break;
			}
		} catch {
			// The player may be teleporting or unloading as the scan runs.
		}
	}
}

function ensureLimboCaveTile(player, tileX, tileZ) {
	if (isLimboSpawnTile(tileX, tileZ)) return false;
	const key = getLimboTilePropertyKey(tileX, tileZ);
	if (world.getDynamicProperty(key) === true) return false;
	if (buildingLimboTiles.has(key)) return false;
	const retryAt = limboTileRetryAt.get(key) ?? 0;
	if (system.currentTick < retryAt) return false;

	try {
		const commands = buildLimboCaveTile(tileX, tileZ);
		buildingLimboTiles.add(key);
		runFillQueue(player, LIMBO_ID, commands, () => {
			world.setDynamicProperty(key, true);
			buildingLimboTiles.delete(key);
		}, (error) => {
			buildingLimboTiles.delete(key);
			limboTileRetryAt.set(key, system.currentTick + LIMBO_TILE_RETRY_TICKS);
			console.warn(`[Dedsafio 4] No se pudo generar la cueva del Limbo (${tileX}, ${tileZ}): ${error}`);
		});
		return true;
	} catch (error) {
		limboTileRetryAt.set(key, system.currentTick + LIMBO_TILE_RETRY_TICKS);
		console.warn(`[Dedsafio 4] No se pudo generar la cueva del Limbo (${tileX}, ${tileZ}): ${error}`);
		return false;
	}
}

function buildLimboCaveTile(tileX, tileZ) {
	const commands = [];
	const fill = (...args) => commands.push(args);
	const x0 = tileX * LIMBO_TILE_SIZE;
	const z0 = tileZ * LIMBO_TILE_SIZE;
	const x1 = x0 + LIMBO_TILE_SIZE - 1;
	const z1 = z0 + LIMBO_TILE_SIZE - 1;
	const floorY = 55;
	const wallBottom = floorY + 1;
	const wallTop = 81;
	const doorStart = 29;
	const doorEnd = 35;
	const doorTop = 65;

	// Solid rock footing, a broad chamber roof and four aligned doorways.
	fill(x0, 48, z0, x1, 54, z1, "minecraft:deepslate");
	fill(x0, floorY, z0, x1, floorY, z1, "minecraft:polished_blackstone_bricks");
	fill(x0, 82, z0, x1, 84, z1, "minecraft:deepslate");
	fill(x0 + 1, 81, z0 + 1, x1 - 1, 81, z1 - 1, "minecraft:polished_blackstone");

	buildCaveWallWithDoor(fill, "z", z0, x0, x1, wallBottom, wallTop, doorStart, doorEnd, doorTop);
	buildCaveWallWithDoor(fill, "z", z1, x0, x1, wallBottom, wallTop, doorStart, doorEnd, doorTop);
	buildCaveWallWithDoor(fill, "x", x0, z0, z1, wallBottom, wallTop, doorStart, doorEnd, doorTop);
	buildCaveWallWithDoor(fill, "x", x1, z0, z1, wallBottom, wallTop, doorStart, doorEnd, doorTop);

	const variation = Math.abs((tileX * 73428767) ^ (tileZ * 91293199));
	const accent = variation % 2 === 0 ? "minecraft:crying_obsidian" : "minecraft:magma_block";
	const support = variation % 3 === 0 ? "minecraft:basalt" : "minecraft:deepslate_bricks";

	// Broken columns and rock bulges make each cell read as a natural cavern,
	// while the middle strip stays open as a route between its four exits.
	for (const [dx, dz, height] of [[12, 12, 8], [51, 12, 13], [12, 51, 11], [51, 51, 7]]) {
		const px = x0 + dx;
		const pz = z0 + dz;
		fill(px - 2, floorY + 1, pz - 2, px + 2, floorY + height, pz + 2, support);
		fill(px - 3, floorY + height + 1, pz - 3, px + 3, floorY + height + 2, "minecraft:polished_blackstone_bricks");
		fill(px - 1, floorY + height + 3, pz - 1, px + 1, floorY + height + 3, pz + 1, accent);
	}

	// Jagged roof masses and hanging stone teeth break up the flat ceiling.
	for (const [dx, dz, length] of [[8, 8, 9], [56, 9, 13], [9, 56, 12], [55, 55, 8], [32, 12, 6], [32, 52, 7]]) {
		const px = x0 + dx;
		const pz = z0 + dz;
		fill(px - 2, 84 - length, pz - 2, px + 2, 81, pz + 2, "minecraft:deepslate");
		fill(px - 1, 82 - length, pz - 1, px + 1, 83 - length, pz + 1, accent);
	}

	// Glowing seams, lantern ruins and a little per-cell variation.
	const seamZ = z0 + 25 + (variation % 12);
	fill(x0 + 8, floorY, seamZ, x0 + 21, floorY, seamZ + 1, accent);
	fill(x0 + 42, floorY, z0 + 39, x0 + 55, floorY, z0 + 40, "minecraft:cracked_deepslate_bricks");
	fill(x0 + 31, floorY + 1, z0 + 31, x0 + 33, floorY + 5, z0 + 33, "minecraft:polished_blackstone_bricks");
	fill(x0 + 32, floorY + 6, z0 + 32, x0 + 32, floorY + 6, z0 + 32, "minecraft:soul_lantern");
	return commands;
}

function buildCaveWallWithDoor(fill, axis, fixed, varyingStart, varyingEnd, bottomY, topY, doorStart, doorEnd, doorTop) {
	const firstSideEnd = varyingStart + doorStart - 1;
	const secondSideStart = varyingStart + doorEnd + 1;
	if (axis === "z") {
		fill(varyingStart, bottomY, fixed, firstSideEnd, topY, fixed, "minecraft:deepslate_bricks");
		fill(secondSideStart, bottomY, fixed, varyingEnd, topY, fixed, "minecraft:deepslate_bricks");
		fill(varyingStart + doorStart, doorTop + 1, fixed, varyingStart + doorEnd, topY, fixed, "minecraft:polished_blackstone_bricks");
	} else {
		fill(fixed, bottomY, varyingStart, fixed, topY, firstSideEnd, "minecraft:deepslate_bricks");
		fill(fixed, bottomY, secondSideStart, fixed, topY, varyingEnd, "minecraft:deepslate_bricks");
		fill(fixed, doorTop + 1, varyingStart + doorStart, fixed, topY, varyingStart + doorEnd, "minecraft:polished_blackstone_bricks");
	}
}

function buildLimboStairBridge(fill, fixedX, startZ, endZ, startY, endY) {
	const direction = Math.sign(endZ - startZ) || 1;
	const distance = Math.max(1, Math.abs(endZ - startZ));
	for (let step = 0; step <= distance; step++) {
		const z = startZ + direction * step;
		const y = Math.round(startY + (endY - startY) * (step / distance));
		fill(fixedX - 1, y, z, fixedX + 1, y, z, "minecraft:polished_blackstone_bricks");
	}
}

function isLimboSpawnTile(tileX, tileZ) {
	return tileX >= -1 && tileX <= 0 && tileZ >= -1 && tileZ <= 0;
}

function getLimboTilePropertyKey(tileX, tileZ) {
	const encode = (value) => value < 0 ? `n${Math.abs(value)}` : `p${value}`;
	return `pavi_limbo_tile_${encode(tileX)}_${encode(tileZ)}`;
}

function runFillQueue(player, dimensionId, commands, onComplete, onError) {
	let index = 0;
	const processBatch = () => {
		try {
			if (!isValidPlayer(player) || player.dimension.id !== dimensionId) throw new Error("El jugador salió de la dimensión durante la generación.");
			const end = Math.min(index + FILL_COMMANDS_PER_TICK, commands.length);
			for (; index < end; index++) runFill(player, ...commands[index]);
			if (index < commands.length) system.run(processBatch);
			else onComplete();
		} catch (error) { onError(error); }
	};
	processBatch();
}

function runFill(player, fromX, fromY, fromZ, toX, toY, toZ, blockId) {
	if (!isValidPlayer(player)) throw new Error("El jugador ya no está disponible para completar la generación.");
	const args = [fromX, fromY, fromZ, toX, toY, toZ, blockId];
	if (args.some((value) => value === undefined || value === null || String(value).includes("undefined"))) {
		throw new Error(`Argumentos /fill incompletos: ${JSON.stringify(args)}`);
	}
	player.runCommand(`fill ${args.join(" ")}`);
}

function loadBuildState() {
	try {
		const state = world.getDynamicProperty(DIMENSION_STATE_PROPERTY);
		if (typeof state !== "string" || !state) return;
		const parsed = JSON.parse(state);
		builtDimensions = new Set(Array.isArray(parsed) ? parsed : []);
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo recuperar el estado de las dimensiones: ${error}`);
	}
}

function saveBuildState() {
	try {
		world.setDynamicProperty(DIMENSION_STATE_PROPERTY, JSON.stringify([...builtDimensions]));
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo guardar el estado de las dimensiones: ${error}`);
	}
}

function getDimensionName(dimensionId) {
	if (dimensionId === GLEBA_ID) return "Gleba";
	if (dimensionId === LIMBO_ID) return "Limbo";
	return "el Overworld";
}

function isValidPlayer(player) {
	try {
		return player?.typeId === "minecraft:player" && player.isValid;
	} catch {
		return false;
	}
}
