import { system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { isAdmin, sendAdminMessage } from "./admin.js";

const MISSIONS_PROPERTY = "pavi_dedsafio_missions";
const MAX_MISSIONS = 32;
const DEFAULT_MISSION_ICON = "textures/items/book_normal";

function readMissions() {
	try {
		const raw = world.getDynamicProperty(MISSIONS_PROPERTY);
		if (!raw) return [];

		const missions = JSON.parse(String(raw));
		return Array.isArray(missions) ? missions : [];
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudieron leer las misiones: ${error}`);
		return [];
	}
}

function writeMissions(missions) {
	const normalized = Array.isArray(missions) ? missions.slice(0, MAX_MISSIONS) : [];
	world.setDynamicProperty(MISSIONS_PROPERTY, JSON.stringify(normalized));
}

function createMissionId() {
	return `${Date.now().toString(36)}_${Math.floor(Math.random() * 100000).toString(36)}`;
}

function cleanMissionText(value, maxLength) {
	return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeMissionIcon(value) {
	const icon = cleanMissionText(value, 128);
	return icon || DEFAULT_MISSION_ICON;
}

function formatMissionBody(mission) {
	return `${mission.description}\n\nObjetivo: ${mission.objective}\nCantidad: ${mission.amount}\nIcono: ${mission.icon}`;
}

export async function showMissionConfiguration(player, openMainMenu) {
	if (!isAdmin(player)) return;

	const missions = readMissions();
	const form = new ActionFormData()
		.title("Configurar Misiones")
		.body(`Misiones guardadas: ${missions.length}/${MAX_MISSIONS}`)
		.button("A\u00F1adir Misi\u00F3n")
		.button("Buscar Misiones");

	for (const mission of missions) {
		form.button(mission.title, mission.icon);
	}
	form.button("Volver");

	try {
		const response = await form.show(player);
		if (!isAdmin(player)) return;
		if (response.canceled) return;

		if (response.selection === 0) {
			system.run(() => showMissionEditor(player, undefined, openMainMenu));
			return;
		}

		if (response.selection === 1) {
			system.run(() => showMissionSearch(player, openMainMenu));
			return;
		}

		if (response.selection === missions.length + 2) {
			if (typeof openMainMenu === "function") system.run(() => openMainMenu(player));
			return;
		}

		const mission = missions[response.selection - 2];
		if (mission) system.run(() => showMissionActions(player, mission.id, openMainMenu));
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo abrir la configuracion de misiones: ${error}`);
	}
}

async function showMissionEditor(player, existingMission, openMainMenu) {
	if (!isAdmin(player)) return;

	const missions = readMissions();
	if (!existingMission && missions.length >= MAX_MISSIONS) {
		sendAdminMessage(player, `\u00A7cSolo se pueden guardar ${MAX_MISSIONS} misiones.`);
		system.run(() => showMissionConfiguration(player, openMainMenu));
		return;
	}

	const form = new ModalFormData()
		.title(existingMission ? "Editar Misi\u00F3n" : "A\u00F1adir Misi\u00F3n")
		.textField("Nombre", "Ejemplo: Mision Guia IV", {
			defaultValue: existingMission?.title ?? "",
		})
		.textField("Descripcion", "Describe lo que debe hacer el jugador", {
			defaultValue: existingMission?.description ?? "",
		})
		.textField("Objetivo", "Ejemplo: Consigue diamantes", {
			defaultValue: existingMission?.objective ?? "",
		})
		.textField("Cantidad", "Ejemplo: 8", {
			defaultValue: String(existingMission?.amount ?? 1),
		})
		.textField("Textura del icono", DEFAULT_MISSION_ICON, {
			defaultValue: existingMission?.icon ?? DEFAULT_MISSION_ICON,
		});

	try {
		const response = await form.show(player);
		if (!isAdmin(player)) return;
		if (response.canceled) {
			system.run(() => showMissionConfiguration(player, openMainMenu));
			return;
		}

		const title = cleanMissionText(response.formValues?.[0], 64);
		const description = cleanMissionText(response.formValues?.[1], 180);
		const objective = cleanMissionText(response.formValues?.[2], 120);
		const amount = Math.min(999999, Math.max(1, Math.floor(Number(response.formValues?.[3]) || 1)));
		const icon = normalizeMissionIcon(response.formValues?.[4]);

		if (!title || !description || !objective) {
			sendAdminMessage(player, "\u00A7cCompleta el nombre, la descripcion y el objetivo.");
			system.run(() => showMissionEditor(player, existingMission, openMainMenu));
			return;
		}

		const mission = {
			id: existingMission?.id ?? createMissionId(),
			title,
			description,
			objective,
			amount,
			icon,
		};

		const currentMissions = readMissions();
		const existingIndex = currentMissions.findIndex((entry) => entry.id === mission.id);
		if (existingIndex >= 0) currentMissions[existingIndex] = mission;
		else currentMissions.push(mission);
		writeMissions(currentMissions);

		sendAdminMessage(player, `\u00A7aMision guardada: \u00A7f${mission.title}`);
		system.run(() => showMissionConfiguration(player, openMainMenu));
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo guardar la mision: ${error}`);
	}
}

async function showMissionSearch(player, openMainMenu) {
	if (!isAdmin(player)) return;

	try {
		const response = await new ModalFormData()
			.title("Buscar Misiones")
			.textField("Nombre u objetivo", "Escribe una parte del texto", { defaultValue: "" })
			.show(player);
		if (!isAdmin(player)) return;

		if (response.canceled) {
			system.run(() => showMissionConfiguration(player, openMainMenu));
			return;
		}

		const query = cleanMissionText(response.formValues?.[0], 64).toLocaleLowerCase();
		const results = readMissions().filter((mission) => {
			const searchableText = `${mission.title} ${mission.description} ${mission.objective}`.toLocaleLowerCase();
			return !query || searchableText.includes(query);
		});
		system.run(() => showMissionSearchResults(player, query, results, openMainMenu));
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo buscar misiones: ${error}`);
	}
}

async function showMissionSearchResults(player, query, missions, openMainMenu) {
	if (!isAdmin(player)) return;

	const form = new ActionFormData()
		.title("Resultados de Misiones")
		.body(query ? `${missions.length} resultado(s) para: ${query}` : `${missions.length} mision(es)`);

	for (const mission of missions) {
		form.button(mission.title, mission.icon);
	}
	form.button("Nueva Busqueda").button("Volver");

	try {
		const response = await form.show(player);
		if (!isAdmin(player)) return;
		if (response.canceled) return;

		if (response.selection < missions.length) {
			const mission = missions[response.selection];
			if (mission) system.run(() => showMissionActions(player, mission.id, openMainMenu));
			return;
		}

		if (response.selection === missions.length) {
			system.run(() => showMissionSearch(player, openMainMenu));
			return;
		}

		system.run(() => showMissionConfiguration(player, openMainMenu));
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudieron mostrar los resultados: ${error}`);
	}
}

async function showMissionActions(player, missionId, openMainMenu) {
	if (!isAdmin(player)) return;

	const mission = readMissions().find((entry) => entry.id === missionId);
	if (!mission) {
		sendAdminMessage(player, "\u00A7cEsa mision ya no existe.");
		system.run(() => showMissionConfiguration(player, openMainMenu));
		return;
	}

	try {
		const response = await new ActionFormData()
			.title(mission.title)
			.body(formatMissionBody(mission))
			.button("Editar Misi\u00F3n")
			.button("Eliminar Misi\u00F3n")
			.button("Volver")
			.show(player);
		if (!isAdmin(player)) return;

		if (response.canceled) return;
		if (response.selection === 0) {
			system.run(() => showMissionEditor(player, mission, openMainMenu));
			return;
		}
		if (response.selection === 1) {
			const remainingMissions = readMissions().filter((entry) => entry.id !== mission.id);
			writeMissions(remainingMissions);
			sendAdminMessage(player, `\u00A7aMision eliminada: \u00A7f${mission.title}`);
		}
		system.run(() => showMissionConfiguration(player, openMainMenu));
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo administrar la mision: ${error}`);
	}
}
