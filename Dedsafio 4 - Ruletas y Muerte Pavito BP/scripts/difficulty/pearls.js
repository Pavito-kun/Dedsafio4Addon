import { system, world } from "@minecraft/server";
import { active } from "./state.js";
import { safe, livingPlayer, takeHeld, blockAt, hurt } from "./util.js";
const cooldown=new Map();
world.beforeEvents.itemUse.subscribe(event=>{
    if(event.itemStack.typeId!=="minecraft:ender_pearl" || !livingPlayer(event.source) || !(active("pearl_armor")||active("pearl_damage")))return;
    event.cancel=true;
    const p=event.source;
    if((cooldown.get(p.id)??0)>system.currentTick)return;
    cooldown.set(p.id,system.currentTick+20);
    system.run(()=>safe(()=>{
        if(!livingPlayer(p))return;
        const view=p.getViewDirection(),head=p.getHeadLocation();
        const pearl=p.dimension.spawnEntity("pavi:difficulty_pearl",{x:head.x+view.x*.5,y:head.y+view.y*.5,z:head.z+view.z*.5});
        if(!takeHeld(p,"minecraft:ender_pearl")){pearl.remove();return;}
        const projectile=pearl.getComponent("minecraft:projectile");
        projectile.owner=p;projectile.shoot({x:view.x*1.5,y:view.y*1.5,z:view.z*1.5});
        p.playSound("random.bow");
    }));
});
function impact(event) {
    if(event.projectile.typeId!=="pavi:difficulty_pearl")return;
    const p=event.source;
    if(!livingPlayer(p))return;
    const loc=event.location;
    const candidates=[];
    for(const dy of [0,1,2,-1])for(const [dx,dz]of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])candidates.push({x:Math.floor(loc.x)+dx+.5,y:Math.floor(loc.y)+dy,z:Math.floor(loc.z)+dz+.5});
    for(const pos of candidates) {
        if(!blockAt(event.dimension,pos)?.isAir || !blockAt(event.dimension,{...pos,y:pos.y+1})?.isAir)continue;
        if(!p.tryTeleport(pos,{dimension:event.dimension,checkForBlocks:true}))continue;
        const damage=active("pearl_damage")?10:5;
        // Exact health loss avoids applying armour/enchantment mitigation a second time.
        const health=p.getComponent("minecraft:health");
        if(health.currentValue>damage)health.setCurrentValue(health.currentValue-damage);
        else hurt(p,1000000,"magic"); // Native lethal damage preserves Totem handling.
        if(Math.random()<.05)safe(()=>event.dimension.spawnEntity("minecraft:endermite",pos));
        safe(()=>event.projectile.remove());
        return;
    }
    safe(()=>event.projectile.remove());
}
world.afterEvents.projectileHitBlock.subscribe(impact);
world.afterEvents.projectileHitEntity.subscribe(impact);
world.afterEvents.playerLeave.subscribe(({playerId})=>cooldown.delete(playerId));
