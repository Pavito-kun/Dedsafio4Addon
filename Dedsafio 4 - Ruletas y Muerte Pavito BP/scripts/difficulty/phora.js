import { ItemStack, system, world } from "@minecraft/server";
import { active } from "./state.js";
import { inRegion, getRegion } from "./regions.js";
import { safe, forLoadedEntities, blockAt, ownedEffect } from "./util.js";

const ores={
    "minecraft:gold_ore":"minecraft:raw_gold","minecraft:deepslate_gold_ore":"minecraft:raw_gold",
    "minecraft:diamond_ore":"minecraft:diamond","minecraft:deepslate_diamond_ore":"minecraft:diamond",
    "minecraft:ancient_debris":"minecraft:netherite_scrap"
};
const phora=e=>["pavi:pod_phora","pavi:skiff_phora"].includes(e.typeId);
system.runInterval(()=>{
    const stage=active("phora_evolution_2")?2:active("phora_evolution")?1:0;
    if(!stage)return;
    forLoadedEntities(e=>safe(()=>{
        if(!phora(e) || !inRegion("phora",e))return;
        ownedEffect(e,"resistance",6,stage);
        ownedEffect(e,"strength",6,stage-1);
        if(stage!==2)return;
        // One adjacent resource per unit per pass; no scans or edits outside the configured cube zone.
        for(const [x,y,z] of [[1,0,0],[-1,0,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
            const pos={x:e.location.x+x,y:e.location.y+y,z:e.location.z+z};
            if(!inRegion("phora",{dimension:e.dimension,location:pos}))continue;
            const block=blockAt(e.dimension,pos), item=ores[block?.typeId];
            if(!item)continue;
            const stash=JSON.parse(e.getDynamicProperty("pavi_phora_resources")??"{}");
            if(Object.values(stash).reduce((a,b)=>a+b,0)>=64)break;
            block.setType("minecraft:air");
            stash[item]=(stash[item]??0)+1;
            e.setDynamicProperty("pavi_phora_resources",JSON.stringify(stash));
            break;
        }
    }),"pavi_difficulty");
},100);
world.afterEvents.entityDie.subscribe(({deadEntity:e})=>safe(()=>{
    if(!phora(e))return;
    const stage=active("phora_evolution_2")?2:active("phora_evolution")?1:0;
    if(!stage)return;
    const stash=JSON.parse(e.getDynamicProperty("pavi_phora_resources")??"{}");
    for(const [id,count]of Object.entries(stash))e.dimension.spawnItem(new ItemStack(id,Math.min(64,count)),e.location);
    e.dimension.spawnItem(new ItemStack("minecraft:gold_ingot",stage===2?6:3),e.location);
    if(stage===2){e.dimension.spawnItem(new ItemStack("minecraft:diamond",2),e.location);if(Math.random()<.25)e.dimension.spawnItem(new ItemStack("minecraft:netherite_scrap"),e.location);}
}));
