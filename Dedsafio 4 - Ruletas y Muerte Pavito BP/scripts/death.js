import { GameMode, system, world } from "@minecraft/server";
import { playHudSpriteSheetGlobally } from "./hud_sequence.js";
import { playSoundGlobally } from "./sound.js";

const DEATH_SOUND = "pavi.dedsafio.sfx.deathsound";
const DEATH_DURATION_TICKS = 183;
const DEATH_SPRITE_SHEET = {
	texture: "textures/paviui/safioanimations/optimized/death/deathsafio",
};

const ENTITY_NAMES_ES = {
	bee: "Abeja",
	blaze: "Blaze",
	bogged: "Esqueleto pantanoso",
	breeze: "Breeze",
	cave_spider: "Ara\u00F1a de cueva",
	creeper: "Creeper",
	dolphin: "Delf\u00EDn",
	drowned: "Ahogado",
	elder_guardian: "Guardi\u00E1n anciano",
	ender_dragon: "Enderdrag\u00F3n",
	enderman: "Enderman",
	endermite: "Endermite",
	evocation_illager: "Evocador",
	fox: "Zorro",
	ghast: "Ghast",
	goat: "Cabra",
	guardian: "Guardi\u00E1n",
	hoglin: "Hoglin",
	husk: "Zombi momificado",
	iron_golem: "G\u00F3lem de hierro",
	llama: "Llama",
	magma_cube: "Cubo de magma",
	panda: "Panda",
	phantom: "Fantasma",
	piglin: "Piglin",
	piglin_brute: "Piglin bruto",
	pillager: "Saqueador",
	polar_bear: "Oso polar",
	pufferfish: "Pez globo",
	ravager: "Devastador",
	shulker: "Shulker",
	silverfish: "Lepisma",
	skeleton: "Esqueleto",
	slime: "Slime",
	snow_golem: "G\u00F3lem de nieve",
	spider: "Ara\u00F1a",
	stray: "Errante",
	trader_llama: "Llama del comerciante",
	vex: "Vex",
	vindicator: "Vindicador",
	warden: "Warden",
	witch: "Bruja",
	wither: "Wither",
	wither_skeleton: "Esqueleto del Whither",
	wolf: "Lobo",
	zoglin: "Zoglin",
	zombie: "Zombi",
	zombie_pigman: "Piglin zombificado",
	zombie_villager: "Aldeano zombi",
};

const pendingDeathLocations = new Map();

world.afterEvents.entityDie.subscribe((event) => {
	if (event.deadEntity.typeId !== "minecraft:player") return;

	const deadPlayer = event.deadEntity;
	const deathLocation = deadPlayer.location;
	const message = `\u00A7c${getDeathMessage(deadPlayer.name, event.damageSource)}`;
	pendingDeathLocations.set(deadPlayer.name, {
		dimension: deadPlayer.dimension,
		location: {
			x: deathLocation.x,
			y: deathLocation.y,
			z: deathLocation.z,
		},
	});

	playHudSpriteSheetGlobally(DEATH_SPRITE_SHEET, {
		totalDurationTicks: DEATH_DURATION_TICKS,
		subtitle: message,
	});
	world.sendMessage(message);
	playSoundGlobally(DEATH_SOUND);
});

world.afterEvents.playerSpawn.subscribe((event) => {
	if (event.initialSpawn) return;

	const player = event.player;
	const deathData = pendingDeathLocations.get(player.name);
	if (!deathData) return;

	system.run(() => {
		try {
			player.setGameMode(GameMode.Spectator);
			player.teleport(deathData.location, { dimension: deathData.dimension });
		} catch (error) {
			console.warn(`[Dedsafio 4] No se pudo devolver a ${player.name} al lugar de su muerte: ${error}`);
		} finally {
			pendingDeathLocations.delete(player.name);
		}
	});
});

function getDeathMessage(playerName, damageSource) {
	const cause = damageSource?.cause ?? "none";
	const attacker = getEntityDisplayName(damageSource?.damagingEntity);

	switch (cause) {
		case "anvil":
			return `${playerName} fue aplastado/a por un yunque`;
		case "blockExplosion":
			return `${playerName} muri\u00F3 en una explosi\u00F3n`;
		case "campfire":
			return `${playerName} muri\u00F3 sobre una fogata`;
		case "charging":
			return `${playerName} muri\u00F3 mientras cargaba`;
		case "contact":
			return attacker
				? `${playerName} fue asesinado/a por ${attacker}`
				: `${playerName} muri\u00F3 por contacto`;
		case "drowning":
			return `${playerName} se ahog\u00F3`;
		case "entityAttack":
			return attacker
				? `${playerName} fue asesinado/a por ${attacker}`
				: `${playerName} fue asesinado/a`;
		case "entityExplosion":
			return attacker
				? `${playerName} explot\u00F3 por culpa de ${attacker}`
				: `${playerName} muri\u00F3 en una explosi\u00F3n`;
		case "fall":
			return `${playerName} cay\u00F3 desde un lugar alto`;
		case "fallingBlock":
			return `${playerName} fue aplastado/a por un bloque`;
		case "fire":
			return attacker
				? `${playerName} muri\u00F3 entre las llamas por culpa de ${attacker}`
				: `${playerName} muri\u00F3 entre las llamas`;
		case "fireTick":
			return attacker
				? `${playerName} muri\u00F3 quemado/a por ${attacker}`
				: `${playerName} muri\u00F3 quemado/a`;
		case "fireworks":
			return `${playerName} explot\u00F3 con fuegos artificiales`;
		case "flyIntoWall":
			return `${playerName} choc\u00F3 contra una pared`;
		case "freezing":
			return `${playerName} muri\u00F3 congelado/a`;
		case "lava":
			return `${playerName} intent\u00F3 nadar en lava`;
		case "lightning":
			return `${playerName} fue alcanzado/a por un rayo`;
		case "maceSmash":
			return attacker
				? `${playerName} fue aplastado/a por la maza de ${attacker}`
				: `${playerName} fue aplastado/a por una maza`;
		case "magic":
			return attacker
				? `${playerName} muri\u00F3 por la magia de ${attacker}`
				: `${playerName} muri\u00F3 por magia`;
		case "magma":
			return `${playerName} descubri\u00F3 que el magma quema`;
		case "none":
		case "override":
			return `${playerName} muri\u00F3`;
		case "piston":
			return `${playerName} fue aplastado/a por un pist\u00F3n`;
		case "projectile":
			return attacker
				? `${playerName} recibi\u00F3 un disparo de ${attacker}`
				: `${playerName} muri\u00F3 por un proyectil`;
		case "ramAttack":
			return attacker
				? `${playerName} fue embestido/a por ${attacker}`
				: `${playerName} muri\u00F3 por una embestida`;
		case "selfDestruct":
			return `${playerName} muri\u00F3`;
		case "sonicBoom":
			return attacker
				? `${playerName} muri\u00F3 por el ataque s\u00F3nico de ${attacker}`
				: `${playerName} muri\u00F3 por un ataque s\u00F3nico`;
		case "soulCampfire":
			return `${playerName} muri\u00F3 sobre una fogata de almas`;
		case "stalactite":
			return `${playerName} fue atravesado/a por una estalactita`;
		case "stalagmite":
			return `${playerName} fue atravesado/a por una estalagmita`;
		case "starve":
			return `${playerName} muri\u00F3 de hambre`;
		case "suffocation":
			return `${playerName} se asfixi\u00F3 dentro de un bloque`;
		case "temperature":
			return `${playerName} no soport\u00F3 la temperatura`;
		case "thorns":
			return attacker
				? `${playerName} muri\u00F3 intentando atacar a ${attacker}`
				: `${playerName} muri\u00F3 por espinas`;
		case "void":
			return `${playerName} cay\u00F3 al vac\u00EDo`;
		case "wither":
			return `${playerName} se marchit\u00F3`;
		default:
			return `${playerName} muri\u00F3`;
	}
}

function getEntityDisplayName(entity) {
	if (!entity) return undefined;

	try {
		if (entity.typeId === "minecraft:player") return entity.name;

		const customName = entity.nameTag?.trim();
		if (customName) return customName;

		const identifier = entity.typeId.split(":").pop() ?? entity.typeId;
		if (ENTITY_NAMES_ES[identifier]) return ENTITY_NAMES_ES[identifier];

		const readableName = identifier.replaceAll("_", " ");
		return readableName.charAt(0).toUpperCase() + readableName.slice(1);
	} catch {
		return undefined;
	}
}
