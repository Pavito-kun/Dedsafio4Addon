import { system, world } from "@minecraft/server";
import { MOB_BY_ID } from "./mob_catalog.js";
import { active } from "./state.js";
import { customEffect } from "./effects.js";
import { banishToLimbo } from "./travel.js";
import { safe, livingPlayer, forLoadedEntities, nearby, distance, hurt, blockAt, wall, ownedEffect, dropRandomSlot, inventory } from "./util.js";

const attached=new Map(), lastPulse=new Map(), dormant=new Map();
const shieldUntil=new Map();
const specialAttackTick=new Map();
const isBrain=m=>m?.attach===true;

world.beforeEvents.entityHurt?.subscribe(event=>{
    const victim=event.hurtEntity, host=attached.get(victim.id);
    if (host && event.damageSource.damagingEntity?.id===host) event.cancel=true;
});
world.afterEvents.entityHurt.subscribe(({hurtEntity:p,damageSource,damage})=>{
    const attacker=damageSource.damagingEntity, mob=attacker && MOB_BY_ID.get(attacker.typeId);
    if (!mob || !livingPlayer(p) || damage<=0) return;
    const tickKey=attacker.id+":"+p.id;
    if (specialAttackTick.get(tickKey)===system.currentTick) return;
    specialAttackTick.set(tickKey,system.currentTick);
    if (mob.attach && !attached.has(attacker.id)) {
        attached.set(attacker.id,p.id);
        attacker.setDynamicProperty("pavi_attached_to",p.id);
    }
    switch(mob.effect) {
        case "primal": customEffect(p,"primal",12); break;
        case "levitation": ownedEffect(p,"levitation",5,1); break;
        case "charge": {
            const delta={x:p.location.x-attacker.location.x,z:p.location.z-attacker.location.z};
            const len=Math.hypot(delta.x,delta.z)||1;
            if(Math.random()<.6) p.applyKnockback({x:delta.x/len*2,z:delta.z/len*2},.8);
            break;
        }
        case "banish": banishToLimbo(p); break;
        case "slowness": ownedEffect(p,"slowness",5,2); break;
        case "drop": safe(()=>dropRandomSlot(p)); break;
        case "tnt": safe(()=>p.dimension.spawnEntity("minecraft:tnt",p.location)); break;
        case "heart":
            p.setDynamicProperty("pavi_lost_health",Math.min(18,Number(p.getDynamicProperty("pavi_lost_health")??0)+2));
            break;
        case "shield": shieldUntil.set(p.id,system.currentTick+100); break;
        case "possess": {
            const d=attacker.dimension, id=attacker.typeId, owner=attacker.getDynamicProperty("pavi_difficulty_owner");
            attacker.remove();
            // Release after five seconds only if the host still exists and the source change remains active.
            system.runTimeout(()=>safe(()=>{
                if (!livingPlayer(p) || (owner && !active(owner))) return;
                const ghost=p.dimension.spawnEntity(id,{...p.location,y:p.location.y+1});
                if(owner) ghost.setDynamicProperty("pavi_difficulty_owner",owner);
            }),100);
            hurt(p,1000000,"override");
            break;
        }
    }
    if (mob.shapeShift && !attacker.getDynamicProperty("pavi_mimic")) {
        const bag=inventory(p), clone=inventory(attacker);
        if (bag && clone) for(let i=0;i<Math.min(bag.size,clone.size);i++) clone.setItem(i,bag.getItem(i));
        attacker.nameTag=p.name;
        attacker.setDynamicProperty("pavi_mimic",p.name);
        attacker.triggerEvent("pavi:human");
    }
});

// A disabled shield stays in the player's own inventory, never in volatile script storage.
world.beforeEvents.itemUse?.subscribe(event=>{
    if (event.itemStack.typeId==="minecraft:shield" && (shieldUntil.get(event.source.id)??0)>system.currentTick) event.cancel=true;
});
world.afterEvents.projectileHitEntity.subscribe(event=>{
    const hit=event.getEntityHit()?.entity;
    if (event.projectile.typeId==="pavi:ink_projectile" && livingPlayer(hit)) customEffect(hit,"ink",5);
    if (event.source?.typeId==="pavi:reptisaurio_arquero" && livingPlayer(hit)) customEffect(hit,"primal",12);
});
function explode(entity,mob) {
    const dim=entity.dimension, pos={...entity.location};
    const radius=mob.key==="flashbang" && active("flashbang_limbo")?12:6;
    const victims=nearby(entity,radius);
    if(mob.blast>0) safe(()=>dim.createExplosion(pos,mob.blast,{source:entity,breaksBlocks:world.gameRules.mobGriefing,causesFire:false}));
    for(const p of victims) {
        switch(mob.effect) {
            case "cake": customEffect(p,"cake",5); break;
            case "root": customEffect(p,"root",active("root_escape")?20:6); break;
            case "wither": ownedEffect(p,"wither",10,1); break;
            case "random": ownedEffect(p,["poison","wither","levitation","blindness","weakness"][Math.floor(Math.random()*5)],8,1); break;
            case "glitch": customEffect(p,"glitch",8); break;
            case "flash": customEffect(p,"flash",4); break;
            case "launch": p.applyKnockback({x:0,z:0},3.5); break;
        }
    }
    if(mob.effect==="lava") safe(()=>{const block=dim.getBlock(pos);if(block?.isAir)block.setType("minecraft:lava");});
    safe(()=>entity.remove());
}
function mimicCombat(e,target) {
    const bag=inventory(e);
    if(!bag) return;
    const health=e.getComponent("minecraft:health");
    for(let i=0;i<bag.size;i++) {
        const item=bag.getItem(i);
        if(!item) continue;
        if(health.currentValue<health.effectiveMax*.5 && /apple|cooked_|bread/.test(item.typeId)) {
            health.setCurrentValue(Math.min(health.effectiveMax,health.currentValue+8));
            if(item.amount>1){item.amount--;bag.setItem(i,item);}else bag.setItem(i,undefined);
            break;
        }
        if(item.typeId==="minecraft:bow" && distance(e.location,target.location)>5) {
            const arrow=e.dimension.spawnEntity("minecraft:arrow",{...e.location,y:e.location.y+1.5});
            const dir={x:target.location.x-e.location.x,y:target.location.y-e.location.y+.5,z:target.location.z-e.location.z};
            const len=Math.hypot(dir.x,dir.y,dir.z)||1;
            const projectile=arrow.getComponent("minecraft:projectile");
            projectile.owner=e;projectile.shoot({x:dir.x/len*1.5,y:dir.y/len*1.5,z:dir.z/len*1.5});
            break;
        }
        if(item.typeId.includes("sword") && distance(e.location,target.location)<2.5) {hurt(target,5,"entityAttack",e);break;}
    }
}
function tickCreature(e) {
    safe(()=>{
        const mob=MOB_BY_ID.get(e.typeId);
        if(!mob) return;
        const owner=e.getDynamicProperty("pavi_difficulty_owner");
        if(owner && !active(owner)) {attached.delete(e.id);e.remove();return;}
        const savedHost=e.getDynamicProperty("pavi_attached_to");
        if(savedHost && !attached.has(e.id)) attached.set(e.id,savedHost);
        const hostId=attached.get(e.id);
        if(hostId) {
            const host=world.getPlayers().find(p=>p.id===hostId);
            if(!host || !livingPlayer(host) || host.dimension.id!==e.dimension.id) {attached.delete(e.id);e.remove();return;}
            e.teleport({...host.getHeadLocation(),y:host.getHeadLocation().y+.15});
            ownedEffect(host,"blindness",.6);
            if((lastPulse.get(e.id)??0)<=system.currentTick) {
                lastPulse.set(e.id,system.currentTick+20);hurt(host,2,"magic",e);
                if(mob.mind) {
                    const victim=nearby(host,3).find(p=>p.id!==host.id);
                    if(victim) hurt(victim,4,"entityAttack",host);
                }
            }
            return;
        }
        if(mob.climb && wall(e)) e.applyImpulse({x:0,y:.12,z:0});
        const targets=nearby(e,24).sort((a,b)=>distance(a.location,e.location)-distance(b.location,e.location));
        const target=targets[0];
        if(!target) return;
        const range=distance(e.location,target.location);
        if(mob.blast!==undefined && range<(mob.trigger??2.5)) {explode(e,mob);return;}
        if(mob.attach && range<1.5) {
            attached.set(e.id,target.id);e.setDynamicProperty("pavi_attached_to",target.id);return;
        }
        if(mob.burrow) {
            const wake=dormant.get(e.id)??0;
            if(!wake && range<7 && range>3) {
                dormant.set(e.id,system.currentTick+40);
                e.setProperty("pavi:burrowed",true);
                ownedEffect(e,"speed",2,2);
            } else if(wake>0 && system.currentTick>wake) {
                dormant.set(e.id,-1);e.setProperty("pavi:burrowed",false);
                system.runTimeout(()=>dormant.delete(e.id),160);
            }
        }
        if(mob.key==="creeper_nuclear" && active("nuclear_roof") && e.dimension.id==="minecraft:nether" && e.location.y>=125) {
            const dx=Math.sign(target.location.x-e.location.x),dz=Math.sign(target.location.z-e.location.z);
            const block=blockAt(e.dimension,{x:e.location.x+dx,y:e.location.y+1,z:e.location.z+dz});
            if(block?.isSolid && world.gameRules.mobGriefing && !["minecraft:bedrock","minecraft:barrier"].includes(block.typeId)) block.setType("minecraft:air");
            e.applyImpulse({x:dx*.04,y:0,z:dz*.04});
        }
        if(mob.shapeShift && e.getDynamicProperty("pavi_mimic") && (lastPulse.get(e.id)??0)<=system.currentTick) {
            lastPulse.set(e.id,system.currentTick+40);mimicCombat(e,target);
        }
    });
}
system.runInterval(()=>forLoadedEntities(tickCreature,"pavi_difficulty"),5);
system.runInterval(()=>{
    specialAttackTick.clear();
    for(const p of world.getPlayers()) safe(()=>{
        const loss=Number(p.getDynamicProperty("pavi_lost_health")??0);
        const h=p.getComponent("minecraft:health");
        if(loss>0 && h.currentValue>Math.max(2,h.effectiveMax-loss)) h.setCurrentValue(Math.max(2,h.effectiveMax-loss));
        if((shieldUntil.get(p.id)??0)>system.currentTick) {
            const gear=p.getComponent("minecraft:equippable");
            for(const slot of ["Mainhand","Offhand"]) {
                const item=gear?.getEquipment(slot);
                if(item?.typeId!=="minecraft:shield")continue;
                const bag=inventory(p);
                let empty=-1;for(let i=0;i<(bag?.size??0);i++)if(!bag.getItem(i)){empty=i;break;}
                if(empty>=0){bag.setItem(empty,item);gear.setEquipment(slot,undefined);}
            }
        } else shieldUntil.delete(p.id);
    });
},20);
world.afterEvents.entityDie.subscribe(({deadEntity:e})=>{attached.delete(e.id);lastPulse.delete(e.id);dormant.delete(e.id);});
world.afterEvents.playerLeave.subscribe(({playerId})=>shieldUntil.delete(playerId));
