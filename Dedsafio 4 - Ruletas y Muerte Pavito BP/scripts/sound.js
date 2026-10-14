import { world } from "@minecraft/server";

export function playSoundGlobally(soundId) {
	for (const player of world.getPlayers()) {
		try {
			player.playSound(soundId, { location: player.location });
		} catch (error) {
			console.warn(`[Dedsafio 4] No se pudo reproducir ${soundId}: ${error}`);
		}
	}
}
