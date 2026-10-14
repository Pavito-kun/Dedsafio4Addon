import { GameMode, system, world } from "@minecraft/server";
import { ROULETTE_COLORS, startRoulette } from "./roulette.js";

const MOON_CURSE_STATE_PROPERTY = "pavi_revil_moon_curse";
const OVERWORLD_ID = "minecraft:overworld";
const NIGHT_START_TICK = 12000;
const NIGHT_END_TICK = 24000;
const MOON_LOOK_DOT_THRESHOLD = 0.97;
const SKY_RAY_DISTANCE = 192;
const LOOK_CHECK_INTERVAL_TICKS = 2;
const MOON_CURSE_MESSAGE = "\u00A1Vaya horrible noche para tener una maldici\u00F3n! El primer jugador en mirar a la Luna recibir\u00E1 da\u00F1o instant\u00E1neo y morir\u00E1. Este cambio permanecer\u00E1 activo hasta que alguien muera por esa raz\u00F3n. Luego ser\u00E1 desactivado.";

let moonCurseActive = false;
let moonCurseActivationPending = false;
let moonCurseActivationToken = 0;
let moonCurseResolving = false;
let moonCurseRouletteController;

system.run(() => restoreMoonCurseState());

system.runInterval(() => {
	if (!moonCurseActive || moonCurseResolving) return;

	const moonDirection = getMoonDirection();
	if (!moonDirection) return;

	for (const player of world.getPlayers()) {
		if (!isEligiblePlayer(player)) continue;
		if (!isLookingAtMoon(player, moonDirection)) continue;
		resolveMoonCurse(player);
		break;
	}
}, LOOK_CHECK_INTERVAL_TICKS);

export function isMoonCurseActive() {
	return moonCurseActive || moonCurseActivationPending;
}

export function toggleMoonCurse() {
	if (isMoonCurseActive()) return stopMoonCurse();
	return startMoonCurse();
}

export function startMoonCurse() {
	if (isMoonCurseActive()) return false;

	moonCurseActivationPending = true;
	const activationToken = ++moonCurseActivationToken;
	const red = ROULETTE_COLORS.find((color) => color.id === "rojo") ?? ROULETTE_COLORS[3];
	moonCurseRouletteController = startRoulette(MOON_CURSE_MESSAGE, red, () => {
		moonCurseRouletteController = undefined;
		if (activationToken !== moonCurseActivationToken || !moonCurseActivationPending) return;

		moonCurseActivationPending = false;
		moonCurseActive = true;
		moonCurseResolving = false;
		saveMoonCurseState();
	});
	return true;
}

export function stopMoonCurse() {
	moonCurseActivationToken++;
	moonCurseActivationPending = false;
	moonCurseActive = false;
	moonCurseResolving = false;

	if (moonCurseRouletteController) {
		moonCurseRouletteController.cancel();
		moonCurseRouletteController = undefined;
	}

	saveMoonCurseState();
	return false;
}

function getMoonDirection() {
	let timeOfDay;
	try {
		timeOfDay = world.getTimeOfDay();
	} catch {
		return undefined;
	}

	if (timeOfDay < NIGHT_START_TICK || timeOfDay >= NIGHT_END_TICK) return undefined;

	const nightProgress = (timeOfDay - NIGHT_START_TICK) / (NIGHT_END_TICK - NIGHT_START_TICK);
	const moonAngle = nightProgress * Math.PI;
	return {
		x: Math.cos(moonAngle),
		y: Math.sin(moonAngle),
		z: 0,
	};
}

function isEligiblePlayer(player) {
	try {
		return player.dimension.id === OVERWORLD_ID && player.getGameMode() !== GameMode.Spectator;
	} catch {
		return false;
	}
}

function isLookingAtMoon(player, moonDirection) {
	try {
		const viewDirection = player.getViewDirection();
		const alignment = viewDirection.x * moonDirection.x
			+ viewDirection.y * moonDirection.y
			+ viewDirection.z * moonDirection.z;
		if (alignment < MOON_LOOK_DOT_THRESHOLD) return false;

		const obstruction = player.getBlockFromViewDirection({
			maxDistance: SKY_RAY_DISTANCE,
			includeLiquidBlocks: false,
			includePassableBlocks: false,
		});
		return obstruction === undefined;
	} catch {
		return false;
	}
}

function resolveMoonCurse(player) {
	if (!moonCurseActive || moonCurseResolving) return;
	moonCurseResolving = true;

	try {
		const killed = player.kill();
		if (!killed) {
			moonCurseResolving = false;
			return;
		}

		moonCurseActive = false;
		saveMoonCurseState();
	} catch (error) {
		moonCurseResolving = false;
		console.warn(`[Dedsafio 4] No se pudo ejecutar la maldici\u00F3n lunar sobre ${player.name}: ${error}`);
	}
}

function restoreMoonCurseState() {
	try {
		moonCurseActive = world.getDynamicProperty(MOON_CURSE_STATE_PROPERTY) === true;
		moonCurseActivationPending = false;
		moonCurseResolving = false;
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo restaurar la maldici\u00F3n lunar: ${error}`);
	}
}

function saveMoonCurseState() {
	try {
		world.setDynamicProperty(MOON_CURSE_STATE_PROPERTY, moonCurseActive);
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo guardar la maldici\u00F3n lunar: ${error}`);
	}
}
