import { system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { isAdmin, sendAdminMessage } from "./admin.js";

const CAMERA_PRESET = "pavi:overhead_focus";
const HEIGHT_ABOVE_HEAD = 3.5;
const activeCameras = new Map();

system.runInterval(() => updateActiveCameras(), 1);

world.afterEvents.playerLeave.subscribe((event) => {
	activeCameras.delete(event.playerName);
	for (const [viewerName, state] of activeCameras) {
		if (state.targetName !== event.playerName) continue;
		activeCameras.delete(viewerName);
	}
});

export function isCustomCameraActive(player) {
	return activeCameras.has(player.name);
}

export function activateOverheadCamera(viewer, target) {
	if (!isAdmin(viewer)) return false;
	if (!viewer?.isValid || !target?.isValid) return false;
	if (viewer.dimension.id !== target.dimension.id) {
		sendAdminMessage(viewer, "\u00A7cEl objetivo debe estar en la misma dimensi\u00F3n.");
		return false;
	}

	activeCameras.set(viewer.name, { targetName: target.name });
	return applyOverheadCamera(viewer, target);
}

export function clearCustomCamera(player, notify = true) {
	activeCameras.delete(player.name);
	try {
		player.camera.clear();
		if (notify) sendAdminMessage(player, "\u00A7aC\u00E1mara personalizada desactivada.");
		return true;
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo restaurar la c\u00E1mara de ${player.name}: ${error}`);
		return false;
	}
}

export async function showCustomCameraConfiguration(player, backHandler) {
	if (!isAdmin(player)) return;

	const players = world.getPlayers();
	const activeState = activeCameras.get(player.name);
	const form = new ActionFormData()
		.title("C\u00E1mara personalizada")
		.body("La c\u00E1mara se colocar\u00E1 sobre tu cabeza y seguir\u00E1 enfocando al jugador seleccionado.")
		.button(activeState ? "Desactivar c\u00E1mara" : "Restaurar c\u00E1mara normal");

	for (const target of players) {
		const selected = activeState?.targetName === target.name ? "\u00A7a [ACTIVO]" : "";
		form.button(`Enfocar a ${target.name}${selected}`);
	}
	form.button("Volver");

	try {
		const response = await form.show(player);
		if (!isAdmin(player) || response.canceled) return;

		if (response.selection === 0) {
			clearCustomCamera(player);
			return;
		}

		const targetIndex = response.selection - 1;
		if (targetIndex >= 0 && targetIndex < players.length) {
			const target = players[targetIndex];
			if (activateOverheadCamera(player, target)) {
				sendAdminMessage(player, `\u00A7aC\u00E1mara enfocando a ${target.name}.`);
			}
			return;
		}

		if (response.selection === players.length + 1 && typeof backHandler === "function") {
			system.run(() => backHandler(player));
		}
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo abrir el men\u00FA de c\u00E1mara: ${error}`);
	}
}

function updateActiveCameras() {
	if (activeCameras.size === 0) return;

	const onlinePlayers = world.getPlayers();
	const playersByName = new Map(onlinePlayers.map((player) => [player.name, player]));
	for (const [viewerName, state] of activeCameras) {
		const viewer = playersByName.get(viewerName);
		if (!viewer) {
			activeCameras.delete(viewerName);
			continue;
		}

		const target = playersByName.get(state.targetName);
		if (!target || viewer.dimension.id !== target.dimension.id) {
			clearCustomCamera(viewer, false);
			sendAdminMessage(viewer, "\u00A7cLa c\u00E1mara se desactiv\u00F3 porque el objetivo ya no est\u00E1 disponible en esta dimensi\u00F3n.");
			continue;
		}

		applyOverheadCamera(viewer, target);
	}
}

function applyOverheadCamera(viewer, target) {
	try {
		const viewerHead = getHeadLocation(viewer);
		const targetHead = getHeadLocation(target);
		viewer.camera.setCamera(CAMERA_PRESET, {
			location: {
				x: viewerHead.x,
				y: viewerHead.y + HEIGHT_ABOVE_HEAD,
				z: viewerHead.z,
			},
			facingLocation: targetHead,
		});
		return true;
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo actualizar la c\u00E1mara de ${viewer.name}: ${error}`);
		activeCameras.delete(viewer.name);
		return false;
	}
}

function getHeadLocation(player) {
	try {
		return player.getHeadLocation();
	} catch {
		return {
			x: player.location.x,
			y: player.location.y + 1.62,
			z: player.location.z,
		};
	}
}
