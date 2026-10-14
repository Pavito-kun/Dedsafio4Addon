import { EntityDamageCause, GameMode, system, world } from "@minecraft/server";
import { ROULETTE_COLORS, startRoulette } from "./roulette.js";
import { activateRevilSky } from "./revil.js";

const GAS_STATE_PROPERTY = "pavi_revil_toxic_gas";
const GAS_COUNTDOWN_MS = 20 * 1000;
const SAFE_HEIGHT = 250;
const GAS_DAMAGE = 4;
const GAS_MESSAGE = "¡Reviil ha liberado un gas tóxico invisible en todas las dimensiones! Antes de que termine el temporizador, TODOS deben estar POR ENCIMA de la capa 250, o recibirán daño hasta morir.";

let gasPhase = "inactive";
let gasCountdownEndsAt = 0;
let gasActivationPending = false;
let gasActivationToken = 0;
let gasRouletteController;

system.run(() => restoreToxicGasState());

system.runInterval(() => {
	if (gasPhase === "inactive") return;

	if (gasPhase === "countdown" && Date.now() >= gasCountdownEndsAt) {
		gasPhase = "toxic";
		gasCountdownEndsAt = 0;
		saveToxicGasState();
		for (const player of world.getPlayers()) {
			try {
				player.onScreenDisplay.setActionBar("");
			} catch {}
		}
	}

	for (const player of world.getPlayers()) updatePlayerGasState(player);
}, 20);

world.afterEvents.playerSpawn?.subscribe((event) => {
	if (gasPhase === "inactive") return;
	system.run(() => updatePlayerGasState(event.player));
});

export function isToxicGasActive() {
	return gasActivationPending || gasPhase !== "inactive";
}

export function toggleToxicGas() {
	
	if (isToxicGasActive()) return stopToxicGas();
	return startToxicGas();
}

export function startToxicGas() {
	if (isToxicGasActive()) return false;

	gasActivationPending = true;
	const activationToken = ++gasActivationToken;
	const red = ROULETTE_COLORS.find((color) => color.id === "rojo") ?? ROULETTE_COLORS[3];
	gasRouletteController = startRoulette(GAS_MESSAGE, red, () => {
		gasRouletteController = undefined;
		if (activationToken !== gasActivationToken || !gasActivationPending) return;
		activateRevilSky((skyReady) => {
			if (activationToken !== gasActivationToken || !gasActivationPending) return;
			if (!skyReady) {
				gasActivationPending = false;
				return;
			}
			startGasCountdown();
		});
	});
	return true;
}

export function stopToxicGas() {
	gasActivationToken++;
	gasActivationPending = false;
	if (gasRouletteController) {
		gasRouletteController.cancel();
		gasRouletteController = undefined;
	}

	gasPhase = "inactive";
	gasCountdownEndsAt = 0;
	saveToxicGasState();
	for (const player of world.getPlayers()) {
		try {
			player.onScreenDisplay.setActionBar("");
		} catch {}
	}
	return false;
}

function updatePlayerGasState(player) {
	if (gasPhase === "countdown") {
		const remainingSeconds = Math.max(0, Math.ceil((gasCountdownEndsAt - Date.now()) / 1000));
		try {
			setGasActionBar(player, formatTime(remainingSeconds));
		} catch {}
		return;
	}

	if (gasPhase !== "toxic" || isSpectator(player)) return;
	if (player.location.y > SAFE_HEIGHT) return;

	try {
		player.applyDamage(GAS_DAMAGE, { cause: EntityDamageCause.magic });
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo aplicar el daño del gas a ${player.name}: ${error}`);
	}
}

function startGasCountdown() {
	gasActivationPending = false;
	gasPhase = "countdown";
	gasCountdownEndsAt = Date.now() + GAS_COUNTDOWN_MS;
	saveToxicGasState();
	for (const player of world.getPlayers()) updatePlayerGasState(player);
}

function setGasActionBar(player, text) {
	player.onScreenDisplay.setActionBar(text);
}

function restoreToxicGasState() {
	try {
		const stored = world.getDynamicProperty(GAS_STATE_PROPERTY);
		if (typeof stored !== "string" || !stored) return;
		const state = JSON.parse(stored);
		if (state.phase !== "countdown" && state.phase !== "toxic") return;

		gasPhase = state.phase;
		gasCountdownEndsAt = Number(state.endsAt) || 0;
		if (gasPhase === "countdown" && Date.now() >= gasCountdownEndsAt) {
			gasPhase = "toxic";
			gasCountdownEndsAt = 0;
			saveToxicGasState();
		}
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo restaurar el gas tóxico: ${error}`);
	}
}

function saveToxicGasState() {
	try {
		const state = gasPhase === "inactive"
			? ""
			: JSON.stringify({ phase: gasPhase, endsAt: gasCountdownEndsAt });
		world.setDynamicProperty(GAS_STATE_PROPERTY, state);
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo guardar el estado del gas tóxico: ${error}`);
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
