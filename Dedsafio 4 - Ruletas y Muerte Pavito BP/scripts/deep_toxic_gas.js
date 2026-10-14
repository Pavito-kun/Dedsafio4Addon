import { EntityDamageCause, GameMode, system, world } from "@minecraft/server";
import { ROULETTE_COLORS, startRoulette } from "./roulette.js";
import { activateRevilSky } from "./revil.js";

const DEEP_GAS_STATE_PROPERTY = "pavi_revil_deep_toxic_gas";
const DEEP_GAS_COUNTDOWN_MS = 2 * 60 * 1000;
const SAFE_DEPTH = -20;
const DEEP_GAS_DAMAGE = 4;
const DEEP_GAS_MESSAGE = "\u00A1Reviil ha liberado un gas t\u00F3xico inverso en todas las dimensiones! Antes de que termine el temporizador, TODOS deben estar en la capa -20 o por debajo, o recibir\u00E1n da\u00F1o hasta morir.";

let deepGasPhase = "inactive";
let deepGasCountdownEndsAt = 0;
let deepGasActivationPending = false;
let deepGasActivationToken = 0;
let deepGasRouletteController;

system.run(() => restoreDeepToxicGasState());

system.runInterval(() => {
	if (deepGasPhase === "inactive") return;

	if (deepGasPhase === "countdown" && Date.now() >= deepGasCountdownEndsAt) {
		deepGasPhase = "toxic";
		deepGasCountdownEndsAt = 0;
		saveDeepToxicGasState();
		clearActionBarForAllPlayers();
	}

	for (const player of world.getPlayers()) updatePlayerDeepGasState(player);
}, 20);

world.afterEvents.playerSpawn?.subscribe((event) => {0
	if (deepGasPhase === "inactive") return;
	system.run(() => updatePlayerDeepGasState(event.player));
});

export function isDeepToxicGasActive() {
	return deepGasActivationPending || deepGasPhase !== "inactive";
}

export function toggleDeepToxicGas() {
	if (isDeepToxicGasActive()) return stopDeepToxicGas();
	return startDeepToxicGas();
}

export function startDeepToxicGas() {
	if (isDeepToxicGasActive()) return false;

	deepGasActivationPending = true;
	const activationToken = ++deepGasActivationToken;
	const red = ROULETTE_COLORS.find((color) => color.id === "rojo") ?? ROULETTE_COLORS[3];
	deepGasRouletteController = startRoulette(DEEP_GAS_MESSAGE, red, () => {
		deepGasRouletteController = undefined;
		if (activationToken !== deepGasActivationToken || !deepGasActivationPending) return;
		activateRevilSky((skyReady) => {
			if (activationToken !== deepGasActivationToken || !deepGasActivationPending) return;
			if (!skyReady) {
				deepGasActivationPending = false;
				return;
			}
			startDeepGasCountdown();
		});
	});
	return true;
}

export function stopDeepToxicGas() {
	deepGasActivationToken++;
	deepGasActivationPending = false;
	if (deepGasRouletteController) {
		deepGasRouletteController.cancel();
		deepGasRouletteController = undefined;
	}

	deepGasPhase = "inactive";
	deepGasCountdownEndsAt = 0;
	saveDeepToxicGasState();
	clearActionBarForAllPlayers();
	return false;
}

function updatePlayerDeepGasState(player) {
	if (deepGasPhase === "countdown") {
		const remainingSeconds = Math.max(0, Math.ceil((deepGasCountdownEndsAt - Date.now()) / 1000));
		try {
			player.onScreenDisplay.setActionBar(formatTime(remainingSeconds));
		} catch {}
		return;
	}

	if (deepGasPhase !== "toxic" || isSpectator(player)) return;
	if (player.location.y <= SAFE_DEPTH) return;

	try {
		player.applyDamage(DEEP_GAS_DAMAGE, { cause: EntityDamageCause.magic });
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo aplicar el da\u00F1o del gas inverso a ${player.name}: ${error}`);
	}
}

function startDeepGasCountdown() {
	deepGasActivationPending = false;
	deepGasPhase = "countdown";
	deepGasCountdownEndsAt = Date.now() + DEEP_GAS_COUNTDOWN_MS;
	saveDeepToxicGasState();
	for (const player of world.getPlayers()) updatePlayerDeepGasState(player);
}

function clearActionBarForAllPlayers() {
	for (const player of world.getPlayers()) {
		try {
			player.onScreenDisplay.setActionBar("");
		} catch {}
	}
}

function restoreDeepToxicGasState() {
	try {
		const stored = world.getDynamicProperty(DEEP_GAS_STATE_PROPERTY);
		if (typeof stored !== "string" || !stored) return;
		const state = JSON.parse(stored);
		if (state.phase !== "countdown" && state.phase !== "toxic") return;

		deepGasPhase = state.phase;
		deepGasCountdownEndsAt = Number(state.endsAt) || 0;
		if (deepGasPhase === "countdown" && Date.now() >= deepGasCountdownEndsAt) {
			deepGasPhase = "toxic";
			deepGasCountdownEndsAt = 0;
			saveDeepToxicGasState();
		}
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo restaurar el gas t\u00F3xico inverso: ${error}`);
	}
}

function saveDeepToxicGasState() {
	try {
		const state = deepGasPhase === "inactive"
			? ""
			: JSON.stringify({ phase: deepGasPhase, endsAt: deepGasCountdownEndsAt });
		world.setDynamicProperty(DEEP_GAS_STATE_PROPERTY, state);
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo guardar el estado del gas t\u00F3xico inverso: ${error}`);
	}
}

function formatTime(totalSeconds) {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isSpectator(player) {
	try {
		return player.getGameMode() === GameMode.Spectator;
	} catch {
		return false;
	}
}
