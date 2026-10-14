import { system, world } from "@minecraft/server";
import { ROULETTE_COLORS, startRoulette } from "./roulette.js";

const REVIL_SKY_TRANSITION_TICKS = 160;
const REVIL_FOG_STAGE_INTERVAL_TICKS = 10;
const REVIL_SKY_FOLLOW_INTERVAL_TICKS = 160;
const REVIL_DESCENT_HEIGHT = 48;
const REVIL_SKY_HEIGHT = 48;
const REVIL_SKY_MERGE_RADIUS = 128;
const REVIL_ACTIVE_PROPERTY = "pavi_revil_active";
const REVIL_FOG_STACK_ID = "pavi_revil_sky";
const REVIL_FOG_STAGES = [
	"pavi:revil_sky_1",
	"pavi:revil_sky_2",
	"pavi:revil_sky_3",
	"pavi:revil_sky_4",
	"pavi:revil_sky_5",
	"pavi:revil_sky_6",
	"pavi:revil_sky_7",
	"pavi:revil_sky_8",
	"pavi:revil_sky_9",
	"pavi:revil_sky_10",
	"pavi:revil_sky_11",
	"pavi:revil_sky_12",
	"pavi:revil_sky_13",
	"pavi:revil_sky_14",
	"pavi:revil_sky_15",
	"pavi:revil_sky_16",
];
const REVIL_SKY_PARTICLE = "pavi:revil_sky_descent";
const REVIL_PERSISTENT_SKY_PARTICLE = "pavi:revil_sky_follow";

let revilSkyActive = false;
let revilActivationPending = false;
let revilActivationToken = 0;
let revilRouletteController;
let revilTransitionRunIds = [];
const revilSkyReadyCallbacks = new Set();

system.run(() => {
	try {
		revilSkyActive = world.getDynamicProperty(REVIL_ACTIVE_PROPERTY) === true;
		if (!revilSkyActive) return;

		const finalFog = REVIL_FOG_STAGES[REVIL_FOG_STAGES.length - 1];
		const players = world.getPlayers();
		for (const player of players) {
			applyRevilFog(player, finalFog);
		}
		spawnRevilSkyForNearbyGroups(players, REVIL_PERSISTENT_SKY_PARTICLE, REVIL_SKY_HEIGHT);
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo restaurar el cielo Revil: ${error}`);
	}
});

world.afterEvents.playerSpawn.subscribe((event) => {
	if (!revilSkyActive) return;

	system.run(() => {
		applyRevilFog(event.player, REVIL_FOG_STAGES[REVIL_FOG_STAGES.length - 1]);
	});
});

system.runInterval(() => {
	if (!revilSkyActive) return;

	spawnRevilSkyForNearbyGroups(world.getPlayers(), REVIL_PERSISTENT_SKY_PARTICLE, REVIL_SKY_HEIGHT);
}, REVIL_SKY_FOLLOW_INTERVAL_TICKS);

export function startMomentRevil() {
	if (isMomentRevilActive()) return false;

	revilActivationPending = true;
	const activationToken = ++revilActivationToken;
	const red = ROULETTE_COLORS.find((color) => color.id === "rojo") ?? ROULETTE_COLORS[3];
	revilRouletteController = startRoulette("El momento revil ha comenzado", red, () => {
		revilRouletteController = undefined;
		if (activationToken !== revilActivationToken || !revilActivationPending) return;
		startRevilSkyEvent(activationToken);
	});
	return true;
}

export function activateRevilSky(onReady) {
	if (revilSkyActive) {
		if (typeof onReady === "function") system.run(() => onReady(true));
		return false;
	}

	if (typeof onReady === "function") revilSkyReadyCallbacks.add(onReady);
	if (revilActivationPending) return false;

	revilActivationPending = true;
	const activationToken = ++revilActivationToken;
	startRevilSkyEvent(activationToken);
	return true;
}

export function stopMomentRevil() {
	revilActivationToken++;
	revilActivationPending = false;
	revilSkyActive = false;

	if (revilRouletteController) {
		revilRouletteController.cancel();
		revilRouletteController = undefined;
	}

	clearRevilTransitionRuns();
	finishRevilSkyCallbacks(false);

	try {
		world.setDynamicProperty(REVIL_ACTIVE_PROPERTY, false);
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo guardar el apagado del cielo Revil: ${error}`);
	}

	for (const player of world.getPlayers()) clearRevilFog(player);
	return false;
}

export function toggleMomentRevil() {
	if (isMomentRevilActive()) return stopMomentRevil();
	return startMomentRevil();
}

export function isMomentRevilActive() {
	return revilSkyActive || revilActivationPending;
}

function startRevilSkyEvent(activationToken) {
	revilSkyActive = false;
	clearRevilTransitionRuns();

	const players = world.getPlayers();
	for (const player of players) {
		clearRevilFog(player);
	}
	spawnRevilSkyForNearbyGroups(players, REVIL_SKY_PARTICLE, REVIL_DESCENT_HEIGHT);

	REVIL_FOG_STAGES.forEach((fogId, index) => {
		const runId = system.runTimeout(() => {
			if (activationToken !== revilActivationToken || !revilActivationPending) return;
			for (const player of world.getPlayers()) applyRevilFog(player, fogId);
		}, index * REVIL_FOG_STAGE_INTERVAL_TICKS);
		revilTransitionRunIds.push(runId);
	});

	const completionRunId = system.runTimeout(() => {
		if (activationToken !== revilActivationToken || !revilActivationPending) return;
		revilActivationPending = false;
		revilSkyActive = true;
		revilTransitionRunIds = [];
		try {
			world.setDynamicProperty(REVIL_ACTIVE_PROPERTY, true);
		} catch (error) {
			console.warn(`[Dedsafio 4] No se pudo guardar el estado del cielo Revil: ${error}`);
		}
		const finalFog = REVIL_FOG_STAGES[REVIL_FOG_STAGES.length - 1];
		const players = world.getPlayers();
		for (const player of players) {
			applyRevilFog(player, finalFog);
		}
		spawnRevilSkyForNearbyGroups(players, REVIL_PERSISTENT_SKY_PARTICLE, REVIL_SKY_HEIGHT);
		finishRevilSkyCallbacks(true);
	}, REVIL_SKY_TRANSITION_TICKS);
	revilTransitionRunIds.push(completionRunId);
}

function clearRevilTransitionRuns() {
	for (const runId of revilTransitionRunIds) system.clearRun(runId);
	revilTransitionRunIds = [];
}

function finishRevilSkyCallbacks(skyReady) {
	const callbacks = [...revilSkyReadyCallbacks];
	revilSkyReadyCallbacks.clear();
	for (const callback of callbacks) {
		try {
			callback(skyReady);
		} catch (error) {
			console.warn(`[Dedsafio 4] Falló una acción al terminar el cielo Revil: ${error}`);
		}
	}
}

function applyRevilFog(player, fogId) {
	try {
		player.runCommand(`fog @s remove ${REVIL_FOG_STACK_ID}`);
	} catch {}

	try {
		player.runCommand(`fog @s push ${fogId} ${REVIL_FOG_STACK_ID}`);
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo aplicar la niebla Revil a ${player.name}: ${error}`);
	}
}

function clearRevilFog(player) {
	try {
		player.runCommand(`fog @s remove ${REVIL_FOG_STACK_ID}`);
	} catch {}
}

function spawnRevilParticleForPlayer(player, particleId, yOffset) {
	try {
		player.dimension.spawnParticle(particleId, {
			x: player.location.x,
			y: player.location.y + yOffset,
			z: player.location.z,
		});
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo mostrar ${particleId} sobre ${player.name}: ${error}`);
	}
}

function spawnRevilSkyForNearbyGroups(players, particleId, yOffset) {
	for (const anchor of getHighestPlayersByNearbyGroup(players)) {
		spawnRevilParticleForPlayer(anchor, particleId, yOffset);
	}
}

function getHighestPlayersByNearbyGroup(players) {
	const mergeRadiusSquared = REVIL_SKY_MERGE_RADIUS * REVIL_SKY_MERGE_RADIUS;
	const sortedPlayers = [...players].sort((first, second) => second.location.y - first.location.y);
	const anchors = [];

	for (const player of sortedPlayers) {
		const hasNearbyHigherAnchor = anchors.some((anchor) => {
			if (anchor.dimension.id !== player.dimension.id) return false;
			const deltaX = anchor.location.x - player.location.x;
			const deltaZ = anchor.location.z - player.location.z;
			return deltaX * deltaX + deltaZ * deltaZ <= mergeRadiusSquared;
		});

		if (!hasNearbyHigherAnchor) anchors.push(player);
	}

	return anchors;
}
