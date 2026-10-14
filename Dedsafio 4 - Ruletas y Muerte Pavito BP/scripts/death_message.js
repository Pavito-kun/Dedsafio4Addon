import { world } from "@minecraft/server";

export const DEATH_MESSAGE_PROTOCOL = "ps_ded_death:";
export const DEATH_MESSAGE_DURATION_MS = 3000;

let deathMessageVisibleUntil = 0;

export function showDeathMessageGlobally(message) {
	deathMessageVisibleUntil = Date.now() + DEATH_MESSAGE_DURATION_MS;

	for (const player of world.getPlayers()) {
		try {
			player.onScreenDisplay.setActionBar(`${DEATH_MESSAGE_PROTOCOL}${message}`);
		} catch (error) {
			console.warn(`[Dedsafio 4] No se pudo mostrar el mensaje de muerte a ${player.name}: ${error}`);
		}
	}
}

export function isDeathMessageVisible() {
	return Date.now() < deathMessageVisibleUntil;
}
