import { BlockVolume, ItemStack, system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { isAdmin, sendAdminMessage } from "../admin.js";
import { setRegion } from "./regions.js";
import { createStructurePlan, splitVolume, STRUCTURE_TYPES } from "./structure_plans.js";

let job;
const JOB_PROPERTY="pavi_region_build_area";
const coordinates=p=>`${p.x} ${p.y} ${p.z}`;
const intersects=(a,b)=>["x","y","z"].every(k=>a.min[k]<=b.max[k]&&a.max[k]>=b.min[k]);
export function validatePlanBounds(plan,heightRange) {
    const {min,max}=plan.bounds;
    if (![min.x,min.y,min.z,max.x,max.y,max.z].every(Number.isSafeInteger)) throw new Error("Coordenadas inválidas");
    if (Math.max(Math.abs(min.x),Math.abs(max.x),Math.abs(min.z),Math.abs(max.z))>29000000) throw new Error("Fuera del límite del mundo");
    if (min.y<heightRange.min || max.y>=heightRange.max) throw new Error(`No cabe: la estructura ocupa Y ${min.y}–${max.y}; la dimensión permite ${heightRange.min}–${heightRange.max-1}`);
}

function notify(player,message) { try {sendAdminMessage(player,message);} catch {} }
function* buildSteps(dimension,plan) {
    // Complete preflight before the first write. Never ignore unloaded chunks.
    for (const cell of splitVolume(plan.bounds.min,plan.bounds.max)) {
        const occupied=dimension.getBlocks(new BlockVolume(cell.min,cell.max),{excludeTypes:["minecraft:air"]},false);
        if (!occupied.getBlockLocationIterator().next().done) throw new Error(`Hay bloques en el volumen cerca de ${coordinates(cell.min)}. Elige un espacio vacío; no se ha construido nada.`);
        yield "Comprobando espacio";
    }
    for (const op of plan.operations) for (const cell of splitVolume(op.min,op.max)) {
        dimension.fillBlocks(new BlockVolume(cell.min,cell.max),op.block);
        job.written=true;
        yield "Construyendo";
    }
    for (const chest of plan.loot) {
        const container=dimension.getBlock(chest.location)?.getComponent("minecraft:inventory")?.container;
        if (!container) throw new Error("No se pudo cargar un cofre de la estructura");
        for (const [id,amount] of chest.items) container.addItem(new ItemStack(id,amount));
        yield "Añadiendo cofres";
    }
    for (const {key,...region} of plan.zones) setRegion(key,{...region,dimension:dimension.id});
}
function finish(error) {
    if (!job) return;
    const current=job; job=undefined;
    system.clearRun(current.handle);
    try {current.dimension.runCommand(`tickingarea remove ${current.area}`);world.setDynamicProperty(JOB_PROPERTY,undefined);} catch {}
    notify(current.player,error
        ? `§cGeneración detenida: ${error.message ?? error}${current.written ? " La construcción quedó parcial; no se ha borrado ni restaurado ningún bloque automáticamente." : ""}`
        : "§aEstructura construida y zonas registradas. Los cambios de dificultad siguen activándose por separado.");
}
export function startStructureBuild(player,dimension,plan) {
    if (!isAdmin(player)) return false;
    if (job) {notify(player,"§eYa hay una estructura en construcción.");return false;}
    try {
        validatePlanBounds(plan,dimension.heightRange);
        // Do not replace a pending cleanup record from an interrupted session.
        if (world.getDynamicProperty(JOB_PROPERTY)) throw new Error("Hay un área de una construcción interrumpida pendiente de limpiar. Recarga el mundo antes de continuar.");
        const area=`pavi_build_${system.currentTick}`;
        const {min,max}=plan.bounds;
        const result=dimension.runCommand(`tickingarea add ${coordinates(min)} ${coordinates(max)} ${area} true`);
        if (!result.successCount) throw new Error("No se pudo reservar un área de carga; revisa el límite de tickingareas y los trucos del mundo.");
        world.setDynamicProperty(JOB_PROPERTY,JSON.stringify({dimension:dimension.id,area}));
        job={player,dimension,plan,area,written:false,ready:system.currentTick+40,deadline:system.currentTick+440,steps:buildSteps(dimension,plan)};
        job.handle=system.runInterval(()=>{
            if (!job || system.currentTick<job.ready) return;
            try {
                if (!isAdmin(job.player)) return finish(new Error("El administrador salió o perdió el tag admin"));
                if (!job.loaded) {
                    // Confirm one position in every involved chunk, not only the origin.
                    for (let x=min.x;x<=max.x+15;x+=16) for (let z=min.z;z<=max.z+15;z+=16) {
                        if (!dimension.getBlock({x:Math.min(x,max.x),y:min.y,z:Math.min(z,max.z)})) throw new Error("Chunks todavía sin cargar");
                    }
                    job.loaded=true;
                }
                // Fixed upper bound, independent of the number of online players.
                const step=job.steps.next();
                if (step.done) return finish();
                if (system.currentTick%200===0) notify(job.player,`§7${step.value}: ${STRUCTURE_TYPES[plan.kind]}`);
            } catch (error) {
                if (!job.loaded && system.currentTick<job.deadline) {job.ready=system.currentTick+20;return;}
                finish(error);
            }
        },1);
        notify(player,"§eGeneración iniciada. No entres al volumen durante la construcción. Puede tardar varios minutos; no cierres el mundo.");
        return true;
    } catch (error) {notify(player,`§cNo se pudo iniciar: ${error.message ?? error}`);return false;}
}

export async function showStructureMenu(player,back) {
    if (!isAdmin(player)) return;
    const keys=Object.keys(STRUCTURE_TYPES);
    const form=new ActionFormData().title("Crear regiones y estructuras")
        .body("Coloca complejos construidos con bloques en tu dimensión actual. Debe estar vacío TODO el volumen; no reemplaza terreno ni construcciones. Quiu incluye varias zonas conectadas. Las zonas no son dimensiones nuevas.");
    for (const key of keys) form.button(STRUCTURE_TYPES[key]);
    form.button("Volver");
    const response=await form.show(player);
    if (!isAdmin(player)||response.canceled) return;
    const kind=keys[response.selection];
    if (!kind) return back?.();
    if (kind==="towers"&&player.dimension.id!=="pavi:limbo") {notify(player,"§eLas torres se deben colocar desde el Limbo.");return;}
    const dimension=player.dimension;
    const loc=player.location;
    const values=await new ModalFormData().title(STRUCTURE_TYPES[kind])
        .textField("Centro X","0",{defaultValue:String(Math.floor(loc.x))})
        .textField("Base Y (espacio vacío)","160",{defaultValue:String(Math.floor(loc.y)+8)})
        .textField("Centro Z","0",{defaultValue:String(Math.floor(loc.z))}).show(player);
    if (!isAdmin(player)||values.canceled) return;
    const [x,y,z]=values.formValues.map(Number);
    let plan;
    try {
        if (![x,y,z].every(Number.isSafeInteger)) throw new Error("Introduce coordenadas enteras");
        plan=createStructurePlan(kind,{x,y,z}); validatePlanBounds(plan,dimension.heightRange);
    } catch(error) {notify(player,`§c${error.message}`);return;}
    const confirmation=await new ActionFormData().title("Confirmar construcción")
        .body(`${STRUCTURE_TYPES[kind]}\nDimensión: ${dimension.id}\nDesde: ${coordinates(plan.bounds.min)}\nHasta: ${coordinates(plan.bounds.max)}\n\nSe construirán bloques y cofres y se actualizarán las zonas de aparición correspondientes. No activa dificultades. Haz una copia de seguridad del mundo antes de construir.`)
        .button("Construir en estas coordenadas").button("Cancelar").show(player);
    if (isAdmin(player)&&!confirmation.canceled&&confirmation.selection===0) startStructureBuild(player,dimension,plan);
}

// Lock only the active construction footprint against manual edits during preflight/build.
for (const event of [world.beforeEvents.playerPlaceBlock,world.beforeEvents.playerBreakBlock]) event?.subscribe(e=>{
    if (!job||e.player.dimension.id!==job.dimension.id) return;
    const p=e.block.location;
    if (intersects(job.plan.bounds,{min:p,max:p})) e.cancel=true;
});
system.run(()=>{
    const raw=world.getDynamicProperty(JOB_PROPERTY);
    if (typeof raw!=="string") return;
    try {
        const {dimension,area}=JSON.parse(raw);
        if (!/^pavi_build_\d+$/.test(area)) return;
        world.getDimension(dimension).runCommand(`tickingarea remove ${area}`);
        world.setDynamicProperty(JOB_PROPERTY,undefined);
        for (const p of world.getPlayers()) notify(p,"§eSe limpió el área de carga de una construcción interrumpida. Sus bloques parciales se conservaron.");
    } catch {}
});
