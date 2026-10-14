import { system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { showDifficultyConfiguration } from "./difficulty_changes.js";
import { showMissionConfiguration } from "./missions.js";
import { isMomentRevilActive, toggleMomentRevil } from "./revil.js";
import { showRouletteConfiguration } from "./roulette.js";
import { isToxicGasActive, stopToxicGas, toggleToxicGas } from "./toxic_gas.js";
import { isDeepToxicGasActive, stopDeepToxicGas, toggleDeepToxicGas } from "./deep_toxic_gas.js";
import { isMoonCurseActive, toggleMoonCurse } from "./moon_curse.js";
import { isAdmin } from "./admin.js";
import { showCustomCameraConfiguration } from "./camera.js";

const CONFIGURATION_ITEM = "pavi:menu_de_configuracion_dedsafio_4";

world.afterEvents.itemUse.subscribe((event) => {
	if (event.itemStack.typeId !== CONFIGURATION_ITEM) return;
	if (!isAdmin(event.source)) return;

	system.run(() => showConfigurationMenu(event.source));
});

export async function showConfigurationMenu(player) {
	if (!isAdmin(player)) return;

	const revilButtonText = isMomentRevilActive() ? "Desactivar Momento Revil" : "Momento Revil";
	const toxicGasButtonText = isToxicGasActive() ? "Desactivar Gas Tóxico Revil" : "Momento Revil: Gas Tóxico";
	const deepToxicGasButtonText = isDeepToxicGasActive() ? "Desactivar Gas Inverso Reviil" : "Momento Reviil: Gas Inverso";
	const moonCurseButtonText = isMoonCurseActive() ? "Desactivar Maldici\u00F3n Lunar" : "Momento Reviil: Maldici\u00F3n Lunar";
	const form = new ActionFormData()
		.title("Configuracion Dedsafio 4")
		.button("Configurar Ruletas")
		.button("Configurar Muerte")
		.button("Configurar Misiones")
		.button("Cambio de Dificultad")
		.button(revilButtonText)
		.button(toxicGasButtonText)
		.button(deepToxicGasButtonText)
		.button(moonCurseButtonText)
		.button("C\u00E1mara personalizada");

	try {
		const response = await form.show(player);
		if (!isAdmin(player)) return;
		if (response.canceled) return;

		switch (response.selection) {
			case 0:
				await showRouletteConfiguration(player);
				break;
			case 2:
				await showMissionConfiguration(player, showConfigurationMenu);
				break;
			case 3:
				await showDifficultyConfiguration(player, showConfigurationMenu);
				break;
			case 4:
				toggleMomentRevil();
				break;
			case 5:
				if (!isToxicGasActive() && isDeepToxicGasActive()) stopDeepToxicGas();
				toggleToxicGas();
				break;
			case 6:
				if (!isDeepToxicGasActive() && isToxicGasActive()) stopToxicGas();
				toggleDeepToxicGas();
				break;
			case 7:
				toggleMoonCurse();
				break;
			case 8:
				await showCustomCameraConfiguration(player, showConfigurationMenu);
				break;
		}
	} catch (error) {
		console.warn(`[Dedsafio 4] No se pudo abrir el menu: ${error}`);
	}
}
