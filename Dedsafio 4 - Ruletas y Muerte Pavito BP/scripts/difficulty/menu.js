import { ActionFormData } from "@minecraft/server-ui";
import { DIFFICULTY_CHANGES, DAYS } from "./catalog.js";
import { getPendingDifficultyId, isDifficultyChangeActive, toggleDifficultyChange } from "../difficulty_changes.js";
import { isAdmin, sendAdminMessage } from "../admin.js";
import { showRegionMenu } from "./regions.js";

export async function showDifficultyConfiguration(player, backHandler) {
    if (!isAdmin(player)) return;
    const form = new ActionFormData().title("Cambios de dificultad").body("Selecciona un día. Cada cambio se activa por separado después de su ruleta y se puede desactivar.");
    for (const day of DAYS) {
        const entries = DIFFICULTY_CHANGES.filter(e => e.day === day);
        const active = entries.filter(e => isDifficultyChangeActive(e.id)).length;
        form.button(`Día ${day}\n${active}/${entries.length} activos`);
    }
    form.button("Zonas y estructuras\nConfigurar ubicaciones");
    form.button("Volver");
    try {
        const r = await form.show(player);
        if (!isAdmin(player) || r.canceled) return;
        if (r.selection === DAYS.length + 1) return backHandler?.(player);
        if (r.selection === DAYS.length) return showRegionMenu(player, () => showDifficultyConfiguration(player, backHandler));
        if (DAYS[r.selection]) return showDay(player, DAYS[r.selection], backHandler);
    } catch (error) { sendAdminMessage(player, `No se pudo abrir el menú: ${error}`); }
}

async function showDay(player, day, backHandler) {
    if (!isAdmin(player)) return;
    const entries = DIFFICULTY_CHANGES.filter(e => e.day === day);
    const form = new ActionFormData().title(`Día ${day} · Dificultad`)
        .body("§eAmarillo: nuevos mobs. §6Naranja: cambios de dificultad.");
    for (const e of entries) {
        const state = getPendingDifficultyId() === e.id ? "§6ACTIVANDO" : isDifficultyChangeActive(e.id) ? "§aACTIVO" : "§7INACTIVO";
        form.button(`${e.kind === "mob" ? "§e" : "§6"}${e.menuTitle}\n${state}`);
    }
    form.button("Volver a los días");
    const r = await form.show(player);
    if (!isAdmin(player) || r.canceled) return;
    const entry = entries[r.selection];
    if (!entry) return showDifficultyConfiguration(player, backHandler);
    const pending = getPendingDifficultyId() === entry.id;
    const active = isDifficultyChangeActive(entry.id);
    const detail = await new ActionFormData().title(entry.menuTitle).body(entry.description)
        .button(pending ? "Cancelar activación" : active ? "Desactivar" : "Activar con ruleta")
        .button("Volver").show(player);
    if (!isAdmin(player) || detail.canceled) return;
    if (detail.selection === 0) toggleDifficultyChange(entry, player);
    return showDay(player, day, backHandler);
}
