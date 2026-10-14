import { system, world } from "@minecraft/server";
import { active, ownerTag } from "./state.js";
import { MOBS } from "./mob_catalog.js";
import { inRegion } from "./regions.js";
import { safe, livingPlayer, biome, blockAt, isNight } from "./util.js";

const cooldown = new Map();
let cursor = 0;
const vanilla = [
    ["stray_night", "minecraft:stray", "night"], ["bogged_night", "minecraft:bogged", "night"],
    ["zombie_nether", "minecraft:zombie", "nether"], ["wither_nether", "minecraft:wither_skeleton", "nether"],
    ["spider_speed", "minecraft:cave_spider", "night"], ["wither_night", "minecraft:wither_skeleton", "night"],
    ["skeleton_nether", "minecraft:skeleton", "nether"], ["spider_strength_4", "minecraft:cave_spider", "ice"]
];
export function habitatMatches(h, p, loc = p.location) {
    const d = p.dimension.id, b = biome(p.dimension, loc);
    const context = { dimension: p.dimension, location: loc };
    const water = blockAt(p.dimension, loc)?.typeId?.includes("water") === true;
    const cave = !!safe(() => p.dimension.getBlockFromRay(loc, { x:0,y:1,z:0 }, { maxDistance:32, includeLiquidBlocks:false }));
    switch (h) {
        case "deepdark": return b === "minecraft:deep_dark";
        case "snow": return d === "minecraft:overworld" && /snow|frozen|ice|cold|grove/.test(b);
        case "ice": return /ice/.test(blockAt(p.dimension,{...loc,y:loc.y-1})?.typeId ?? "");
        case "night": return d === "minecraft:overworld" && isNight();
        case "day": return d === "minecraft:overworld" && !isNight();
        case "overworld": return d === "minecraft:overworld";
        case "nether": return d === "minecraft:nether";
        case "nether_roof": return d === "minecraft:nether" && loc.y >= 125;
        case "gleba": return d === "pavi:gleba";
        case "gleba_cave": return d === "pavi:gleba" && cave;
        case "gleba_water": return d === "pavi:gleba" && water;
        case "limbo": return d === "pavi:limbo";
        case "limbo_maze": return d === "pavi:limbo" && inRegion("maze",context);
        case "limbo_towers": return d === "pavi:limbo" && inRegion("towers",context);
        case "nightmare": return d === "minecraft:overworld" && isNight() && active("insomnia") && Number(p.getDynamicProperty("pavi_insomnia_seconds") ?? 0) >= 3600;
        case "quiu": return inRegion("quiu",context);
        case "quiu_cave": return inRegion("quiu",context) && cave;
        case "quiu_water": return inRegion("quiu",context) && water;
        case "quiu_savanna": return inRegion("quiu",context) && (/savanna/.test(b) || inRegion("quiu_savanna",context));
        case "ocean": return d === "minecraft:overworld" && /ocean/.test(b) && water;
        case "water": return d === "minecraft:overworld" && water;
        case "forest": return d === "minecraft:overworld" && /forest/.test(b);
        case "plains_day": return d === "minecraft:overworld" && /plains/.test(b) && !isNight();
        case "cherry": return d === "minecraft:overworld" && /cherry/.test(b);
        case "swamp": return d === "minecraft:overworld" && /swamp/.test(b);
        case "phora": case "qumara": case "settlement": return inRegion(h,context);
        default: return false; // Fat and wart creatures only emerge from a broken block.
    }
}

function candidates() {
    const rows = [];
    for (const mob of MOBS) {
        if (active(mob.key)) rows.push({ key:mob.key, type:"pavi:"+mob.key,
            habitat:mob.key === "herobrine" ? (active("herobrine_night") ? "night" : "overworld") : mob.habitat, mob });
    }
    const expanded = [
        ["phora_evolution","pod_phora","phora"], ["phora_evolution","skiff_phora","phora"],
        ["phora_evolution_2","pod_phora","phora"], ["phora_evolution_2","skiff_phora","phora"],
        ["herobrine_night","herobrine","night"], ["mollusc_scrap","molusco_rocoso","qumara"],
        ["narval_ocean","narval","ocean"], ["raptor_cherry","dromoraptor_rojo","cherry"],
        ["raptor_cherry","dromoraptor_azul","cherry"], ["brain_surface","cerebro_amarillo","gleba"],
        ["plant_forest","zombie_planta","forest"], ["azalea_plains","creeper_azalea","plains_day"],
        ["parasite_overworld","parasito","water"], ["flashbang_limbo","flashbang","limbo_maze"],
        ["kragtops","kragtop","quiu"], ["reaper_deepdark","reaper","deepdark"],
        ["dactyl_swamp","dactylo_bebe","swamp"], ["nuclear_roof","creeper_nuclear","nether_roof"]
    ];
    for (const [key,type,habitat] of expanded) if (active(key)) rows.push({key,type:"pavi:"+type,habitat,mob:MOBS.find(m=>m.key===type)});
    for (const [key,type,habitat] of vanilla) if (active(key)) rows.push({key,type,habitat});
    return rows;
}

export function spawnOwned(type, dimension, position, key) {
    const mob = safe(() => dimension.spawnEntity(type, position));
    if (!mob) return;
    mob.addTag(ownerTag(key));
    mob.setDynamicProperty("pavi_difficulty_owner", key);
    return mob;
}

function findPosition(p, row) {
    for (let attempt=0; attempt<4; attempt++) {
        const angle = Math.random()*Math.PI*2, range=16+Math.random()*12;
        const x=Math.floor(p.location.x+Math.cos(angle)*range)+.5, z=Math.floor(p.location.z+Math.sin(angle)*range)+.5;
        for (const dy of [3,1,0,-1,-3,-5]) {
            const loc={x,y:Math.floor(p.location.y)+dy,z};
            const feet=blockAt(p.dimension,loc), head=blockAt(p.dimension,{x,y:loc.y+1,z});
            if (!feet || !head) continue;
            if (row.mob?.swim) {
                if (!feet.typeId.includes("water") || !head.typeId.includes("water")) continue;
            } else {
                if (!feet.isAir || !head.isAir) continue;
                if (!row.mob?.fly && !blockAt(p.dimension,{x,y:loc.y-1,z})?.isSolid) continue;
            }
            if (habitatMatches(row.habitat,p,loc)) return loc;
        }
    }
}

system.runInterval(() => {
    const players=world.getPlayers().filter(livingPlayer);
    if (!players.length) return;
    // One player's spawn work per second, not every player's work on a shared tick.
    const p=players[cursor++ % players.length];
    if (system.currentTick < (cooldown.get(p.id) ?? 0)) return;
    cooldown.set(p.id,system.currentTick+400);
    const entities=safe(()=>p.dimension.getEntities({location:p.location,maxDistance:64})) ?? [];
    if (entities.filter(e=>safe(()=>e.getDynamicProperty("pavi_difficulty_owner"))).length >= 10) return;
    const options=candidates().sort(()=>Math.random()-.5);
    for (const row of options.slice(0,12)) {
        if (entities.filter(e=>e.typeId===row.type).length >= 4) continue;
        const pos=findPosition(p,row);
        if (!pos) continue;
        spawnOwned(row.type,p.dimension,pos,row.key);
        // Pack members get their own collision-safe location.
        for (let n=1;n<(row.mob?.pack ?? 1);n++) {
            const extra=findPosition(p,row);
            if (extra) spawnOwned(row.type,p.dimension,extra,row.key);
        }
        break;
    }
},20);

world.afterEvents.entityLoad?.subscribe(({entity})=>system.run(()=>safe(()=>{
    const owner=entity.getDynamicProperty("pavi_difficulty_owner");
    if (owner && !active(owner)) entity.remove();
})));
world.afterEvents.playerLeave.subscribe(({playerId})=>cooldown.delete(playerId));
