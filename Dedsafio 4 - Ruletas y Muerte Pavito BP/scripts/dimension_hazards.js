import { system, world } from "@minecraft/server";

const GLEBA_ID = "pavi:gleba";
const LIMBO_ID = "pavi:limbo";
const DAMAGE_PER_SECOND = 4;

// Bedrock health is measured in half-hearts: 4 damage = two hearts per second.
system.runInterval(() => {
	for (const player of world.getAllPlayers()) {
		try {
			if (player.dimension.id !== GLEBA_ID && player.dimension.id !== LIMBO_ID) continue;
			if (!player.isValid || !player.isInWater) continue;
			player.applyDamage(DAMAGE_PER_SECOND);
		} catch {
			// Ignore players changing dimensions or being removed during this tick.
		}
	}
}, 20);
