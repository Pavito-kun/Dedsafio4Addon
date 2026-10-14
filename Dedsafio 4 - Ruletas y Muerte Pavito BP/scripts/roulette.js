import { system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { cancelActiveHudSpriteSheet, playHudSpriteSheetGlobally } from "./hud_sequence.js";
import { playSoundGlobally } from "./sound.js";
import { isAdmin, sendAdminMessage } from "./admin.js";

const ROULETTE_SOUND = "pavi.dedsafio.sfx.ruletasound";
const ROULETTE_MESSAGE_SOUND = "pavi.dedsafio.sfx.ruletasendinfo";
export const ROULETTE_DURATION_TICKS = 280;
const ROULETTE_MESSAGE_DURATION_TICKS = 900;
const ROULETTE_MESSAGE_PROTOCOL = "ps_ded:mensaje";

const GREEN_ROULETTE_SPRITE_SHEET = {
	texture: "textures/paviui/safioanimations/optimized/green/greendedsafio",
};

const BLUE_ROULETTE_SPRITE_SHEET = {
	texture: "textures/paviui/safioanimations/optimized/blue/bluededsafio",
};

const ORANGE_ROULETTE_SPRITE_SHEET = {
	texture: "textures/paviui/safioanimations/optimized/orange/orangededsafio",
};

const RED_ROULETTE_SPRITE_SHEET = {
	texture: "textures/paviui/safioanimations/optimized/red/reddedsafio",
};

export const ROULETTE_COLORS = [
	{ name: "Verde", id: "verde", chatColor: "\u00A7a", heading: "Notificaciones" },
	{ name: "Naranja", id: "naranja", chatColor: "\u00A76" },
	{ name: "Amarillo", id: "amarillo", chatColor: "\u00A7e", heading: "DedCiclopedia" },
	{ name: "Rojo", id: "rojo", chatColor: "\u00A7c" },
	{ name: "Rosado", id: "rosado", chatColor: "\u00A7d" },
	{ name: "Morado", id: "morado", chatColor: "\u00A75" },
	{ name: "Azul", id: "azul", chatColor: "\u00A79" },
	{ name: "Celeste", id: "celeste", chatColor: "\u00A7b", heading: "Misiones" },
];

export async function showRouletteConfiguration(player) {
	if (!isAdmin(player)) return;

	const form = new ModalFormData()
		.title("Configurar Ruleta")
		.textField("Mensaje", "Escribe el mensaje que se enviara", { defaultValue: "" })
		.dropdown("Color", ROULETTE_COLORS.map((color) => color.name), {
			defaultValueIndex: 0,
		});

	const response = await form.show(player);
	if (!isAdmin(player)) return;
	if (response.canceled) return;

	const message = String(response.formValues?.[0] ?? "").trim();
	const colorIndex = Number(response.formValues?.[1] ?? 0);
	const color = ROULETTE_COLORS[colorIndex] ?? ROULETTE_COLORS[0];

	if (!message) {
		sendAdminMessage(player, "\u00A7cDebes escribir un mensaje para la ruleta.");
		return;
	}

	startRoulette(message, color);
}

export function startRoulette(message, color, onComplete) {
	let canceled = false;
	const title = `ps_ded_ruleta_${color.id}`;
	const spriteSheet = {
		verde: GREEN_ROULETTE_SPRITE_SHEET,
		azul: BLUE_ROULETTE_SPRITE_SHEET,
		naranja: ORANGE_ROULETTE_SPRITE_SHEET,
		rojo: RED_ROULETTE_SPRITE_SHEET,
	}[color.id];

	if (spriteSheet) {
		playHudSpriteSheetGlobally(spriteSheet, {
			totalDurationTicks: ROULETTE_DURATION_TICKS,
		});
	} else {
		cancelActiveHudSpriteSheet();
		for (const player of world.getPlayers()) {
			player.onScreenDisplay.setTitle(title, {
				fadeInDuration: 0,
				stayDuration: ROULETTE_DURATION_TICKS,
				fadeOutDuration: 0,
			});
		}
	}

	playSoundGlobally(ROULETTE_SOUND);

	const completionRunId = system.runTimeout(() => {
		if (canceled) return;
		world.sendMessage(formatRouletteMessage(message, color));
		showRouletteMessageGlobally(message, color);
		playSoundGlobally(ROULETTE_MESSAGE_SOUND);
		if (typeof onComplete === "function") onComplete();
	}, ROULETTE_DURATION_TICKS);

	return {
		cancel() {
			if (canceled) return;
			canceled = true;
			system.clearRun(completionRunId);
			if (spriteSheet) cancelActiveHudSpriteSheet();

			for (const player of world.getPlayers()) {
				try {
					player.onScreenDisplay.clearTitle();
				} catch {}
			}
		},
	};
}

function showRouletteMessageGlobally(message, color) {
	const heading = color.heading ?? "Notificaciones";
	const title = `${ROULETTE_MESSAGE_PROTOCOL}${color.chatColor}\u00A7l${heading}:\u00A7r`;
	const subtitle = `${color.chatColor}${message}\u00A7r`;

	for (const player of world.getPlayers()) {
		try {
			player.onScreenDisplay.setTitle(title, {
				subtitle,
				fadeInDuration: 0,
				stayDuration: ROULETTE_MESSAGE_DURATION_TICKS,
				fadeOutDuration: 0,
			});
		} catch (error) {
			console.warn(`[Dedsafio 4] No se pudo mostrar el aviso de ruleta a ${player.name}: ${error}`);
		}
	}
}

function formatRouletteMessage(message, color) {
	const text = `${color.chatColor}${message}\u00A7r`;
	if (!color.heading) return text;

	return `${color.chatColor}\u00A7l${color.heading}:\n\u00A7r${text}`;
}
