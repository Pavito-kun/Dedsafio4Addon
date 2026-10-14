import { system, world } from "@minecraft/server";

let activeHudSpriteRunId;
let hudSpriteToken = 0;

export function playHudSpriteSheetGlobally(spriteSheet, options = {}) {
	cancelActiveHudSpriteSheet();
	const token = hudSpriteToken;
	const totalDurationTicks = Math.max(1, options.totalDurationTicks ?? 1);

	for (const player of world.getPlayers()) {
		try {
			const titleOptions = {
				fadeInDuration: 0,
				stayDuration: totalDurationTicks,
				fadeOutDuration: 0,
			};
			if (options.subtitle) titleOptions.subtitle = options.subtitle;
			player.onScreenDisplay.setTitle(spriteSheet.texture, titleOptions);
		} catch (error) {
			console.warn(`[Dedsafio 4] No se pudo mostrar el sprite sheet ${spriteSheet.texture} a ${player.name}: ${error}`);
		}
	}

	activeHudSpriteRunId = system.runTimeout(() => {
		if (hudSpriteToken !== token) return;
		activeHudSpriteRunId = undefined;
		for (const player of world.getPlayers()) {
			try {
				player.onScreenDisplay.clearTitle();
			} catch {}
		}
	}, totalDurationTicks);
}

export function cancelActiveHudSpriteSheet() {
	hudSpriteToken++;
	if (activeHudSpriteRunId === undefined) return;

	system.clearRun(activeHudSpriteRunId);
	activeHudSpriteRunId = undefined;
}