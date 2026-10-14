import { system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { isAdmin, sendAdminMessage } from "../admin.js";
import { showStructureMenu } from "./structures.js";

export const REGION_NAMES = {
    quiu: "Centro de Quiu", phora: "Cubos Phora", settlement: "Asentamiento Reptisaurio",
    qumara: "Guarida de Qumara", mountain: "Montaña protegida por Eón",
    maze: "Laberinto del Limbo", towers: "Torres del Limbo", quiu_savanna: "Sabana del Centro de Quiu"
};
const regions = new Map();
system.run(() => {
    for (const key of Object.keys(REGION_NAMES)) {
        try {
            const data = world.getDynamicProperty("pavi_region_" + key);
            if (typeof data === "string") regions.set(key, JSON.parse(data));
        } catch {}
    }
});
export function getRegion(key) { return regions.get(key); }
export function setRegion(key,region) {
    if (!Object.hasOwn(REGION_NAMES,key)) throw new Error("Zona desconocida");
    world.setDynamicProperty("pavi_region_"+key,JSON.stringify(region));
    regions.set(key,region);
}
export function inRegion(key, entity) {
    const r = regions.get(key) ?? (key === "maze" && world.getDynamicProperty("pavi_day_maze_v1") === true
        ? { dimension: "pavi:limbo", x: 2063, z: 2063, radius: 22, minY: 180, maxY: 185 } : undefined);
    if (!r || r.dimension !== entity.dimension.id) return false;
    const p = entity.location;
    return Math.hypot(p.x - r.x, p.z - r.z) <= r.radius && p.y >= r.minY && p.y <= r.maxY;
}
export async function showRegionMenu(player, back) {
    if (!isAdmin(player)) return;
    const keys = Object.keys(REGION_NAMES);
    const form = new ActionFormData().title("Zonas de dificultad")
        .body("Configura zonas existentes o crea las regiones y estructuras desde el último botón. Las apariciones exclusivas usan estas ubicaciones.");
    for (const key of keys) form.button(REGION_NAMES[key] + (regions.has(key) ? "\n§aConfigurada" : "\n§7Sin configurar"));
    form.button("Crear regiones y estructuras");
    form.button("Volver");
    const r = await form.show(player);
    if (!isAdmin(player) || r.canceled) return;
    if (r.selection === keys.length) return showStructureMenu(player, () => showRegionMenu(player,back));
    const key = keys[r.selection];
    if (!key) return back?.();
    const current = regions.get(key);
    const p = player.location;
    const form2 = new ModalFormData().title(REGION_NAMES[key])
        .textField("Centro X", "X", { defaultValue: String(current?.x ?? Math.floor(p.x)) })
        .textField("Centro Z", "Z", { defaultValue: String(current?.z ?? Math.floor(p.z)) })
        .textField("Radio (8–2048 bloques; 0 elimina)", "128", { defaultValue: String(current?.radius ?? 128) })
        .textField("Y mínima", "-64", { defaultValue: String(current?.minY ?? -64) })
        .textField("Y máxima", "400", { defaultValue: String(current?.maxY ?? 400) });
    const response = await form2.show(player);
    if (!isAdmin(player) || response.canceled) return;
    const values = response.formValues.map(Number);
    const [x, z, radius, minY, maxY] = values;
    if (values.some(v => !Number.isFinite(v)) || radius < 0 || radius > 2048 || minY > maxY || Math.abs(x) > 29000000 || Math.abs(z) > 29000000) {
        sendAdminMessage(player, "§cCoordenadas o radio inválidos.");
    } else if (radius === 0) {
        regions.delete(key);
        world.setDynamicProperty("pavi_region_" + key, undefined);
    } else if (radius >= 8) {
        const region = { dimension: player.dimension.id, x, y: player.location.y, z, radius, minY, maxY };
        setRegion(key,region);
        sendAdminMessage(player, "§aZona guardada en tu dimensión actual.");
    }
    return showRegionMenu(player, back);
}
