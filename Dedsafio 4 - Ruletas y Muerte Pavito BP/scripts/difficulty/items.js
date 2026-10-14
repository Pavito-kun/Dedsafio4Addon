import { GameMode, ItemStack, system, world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { active } from "./state.js";
import { expiryDay } from "./rule_math.js";
import { safe, livingPlayer, inventory, takeHeld, hurt, ownedEffect } from "./util.js";
import { sendAdminMessage } from "../admin.js";

const spoon="pavi:cuchara_resurreccion", pendingRitual=new Set();
const toolCooldown=new Map();
const totems={
    "pavi:nutritotem":{"name":"Nutritótem","kind":"nutrition"},
    "pavi:totem_limbo":{"name":"Tótem Limbo","kind":"limbo","lore":["Al popear restaura tus Slots de Corazones (sin curar la salud).","Atención: Si tienes Corazones Extra, los perderás al popear."]},
    "pavi:totem_glebanoide":{"name":"Tótem Glebanoide","kind":"nutrition","lore":["Variante del Nutritótem"]},
    "pavi:totem_eon":{"name":"Tótem de Eón","kind":"eon","lore":["Popea aunque esté en tu inventario.","Otorga Resistencia I durante 1 segundo al popear."]}
};
const pendingTotemPops=new Set();
const today=()=>expiryDay(Date.now()-6*60*60*1000); // Server day: America/Managua (UTC−6).
const remaining=p=>Number(p.getDynamicProperty("pavi_zombification_seconds")??180);
const held=p=>inventory(p)?.getItem(p.selectedSlotIndex);

function spoonValid(player,item) {
    if(item?.typeId!==spoon) return false;
    const day=item.getDynamicProperty("pavi_claim_day");
    if(active("spoon_expiry") && day!==undefined && day!==today()) {
        sendAdminMessage(player,"§cLa cuchara caducó. Debía utilizarse el día en que se reclamó.");return false;
    }
    return true;
}
world.beforeEvents.playerInteractWithBlock.subscribe(event=>{
    if(event.itemStack?.typeId!==spoon || event.block.typeId!=="minecraft:respawn_anchor") return;
    event.cancel=true;
    if(!livingPlayer(event.player))return;
    system.run(()=>ritual(event.player));
});
async function ritual(player) {
    if(pendingRitual.has(player.id) || !spoonValid(player,held(player)))return;
    pendingRitual.add(player.id);
    try {
        const ghosts=world.getPlayers().filter(p=>p.getGameMode()===GameMode.Spectator);
        if(!ghosts.length){sendAdminMessage(player,"§7No hay jugadores eliminados conectados.");return;}
        const form=new ActionFormData().title("Ritual de resurrección").body("La cuchara se consumirá al revivir al jugador seleccionado.");
        ghosts.forEach(p=>form.button(p.name));form.button("Cancelar");
        const response=await form.show(player);
        const target=ghosts[response.selection];
        if(response.canceled || !target || !livingPlayer(player) || !spoonValid(player,held(player)))return;
        if(!target.isValid || target.getGameMode()!==GameMode.Spectator)return;
        const position={...player.location};
        target.teleport(position,{dimension:player.dimension});
        if(!takeHeld(player,spoon))return;
        target.setGameMode(GameMode.Survival);
        target.getComponent("minecraft:health")?.resetToMaxValue();
        ownedEffect(target,"resistance",5,4);
        safe(()=>target.dimension.spawnParticle("minecraft:totem_particle",target.location));
    } catch(error){sendAdminMessage(player,"§cNo se pudo completar el ritual: "+error);}
    finally{pendingRitual.delete(player.id);}
}
world.afterEvents.itemCompleteUse.subscribe(({source:p,itemStack})=>{
    if(!livingPlayer(p))return;
    if(itemStack.typeId==="pavi:pildora_zombificacion") {
        p.setDynamicProperty("pavi_zombification_seconds",14400);
        ownedEffect(p,"nausea",3);
    } else if(itemStack.typeId==="pavi:corazon_limbo") {
        const h=p.getComponent("minecraft:health");
        // A life bar = one ten-heart row (20 HP); without the change, heal to max.
        h.setCurrentValue(active("limbo_heart")?Math.min(h.effectiveMax,h.currentValue+20):h.effectiveMax);
    } else if(itemStack.typeId==="pavi:manzana_ambar") {
        ownedEffect(p,"regeneration",8,1);ownedEffect(p,"resistance",30,0);
    }
});
function useSpeaker({source:p,itemStack}) {
    if(itemStack.typeId!=="pavi:altavoz" || !livingPlayer(p))return;
    const key=p.id+":speaker";
    if((toolCooldown.get(key)??0)>system.currentTick)return;
    toolCooldown.set(key,system.currentTick+40);
    safe(()=>p.playSound("note.bass"));
    for(const e of p.dimension.getEntities({type:"pavi:creeper_visceral",location:p.location,maxDistance:10})) safe(()=>e.kill());
}
world.afterEvents.itemUse.subscribe(useSpeaker);
system.beforeEvents.startup.subscribe(({itemComponentRegistry})=>{
    itemComponentRegistry.registerCustomComponent("pavi:altavoz_use",{onUse:useSpeaker});
});
function inspectItems(p) {
    const bag=inventory(p);if(!bag)return;
    let hasIndicator=false,empty=-1;
    for(let i=0;i<bag.size;i++) {
        const item=bag.getItem(i);
        if(!item){if(empty<0)empty=i;continue;}
        if(item.typeId===spoon && item.getDynamicProperty("pavi_claim_day")===undefined) {
            item.setDynamicProperty("pavi_claim_day",today());
            item.setLore(["Ritual: usar sobre un ancla de reaparición.","Caduca al cambiar el día si está activo el cambio del Día 3."]);
            bag.setItem(i,item);
        }
        if(item.typeId==="pavi:indicador_insomnia") {
            hasIndicator=true;
            if(!active("insomnia") && !active("zombification")) {bag.setItem(i,undefined);continue;}
            const seconds=Number(p.getDynamicProperty("pavi_insomnia_seconds")??0);
            item.setLore([
                "Insomnia: "+(seconds>=3600?"ALTA":seconds>=1800?"MEDIA":"BAJA"),
                "Sin dormir: "+Math.floor(seconds/60)+" minutos",
                "Dormir reinicia la insomnia.",
                ...(active("zombification")?["Zombificación: "+formatTime(remaining(p))]:[])
            ]);
            bag.setItem(i,item);
        }
        const totem=totems[item.typeId];
        if(totem && (item.getLore().join("\n")!==(totem.lore??[]).join("\n"))) {
            item.setLore(totem.lore??[]);
            bag.setItem(i,item);
        }
    }
    if((active("insomnia")||active("zombification")) && !hasIndicator && empty>=0)bag.setItem(empty,new ItemStack("pavi:indicador_insomnia"));
}
export function formatTime(seconds) {
    return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(Math.max(0,Math.floor(n))).padStart(2,"0")).join(":");
}
world.beforeEvents.entityHurt?.subscribe(event=>{
    const p=event.hurtEntity;
    if(livingPlayer(p) && event.damage>=p.getComponent("minecraft:health").currentValue && !pendingTotemPops.has(p.id)) {
        const gear=p.getComponent("minecraft:equippable"), bag=inventory(p);
        const mainIndex=p.selectedSlotIndex;
        const mainItem=bag?.getItem(mainIndex);
        const offhandItem=gear?.getEquipment("Offhand");
        let selected=mainItem && totems[mainItem.typeId]?{typeId:mainItem.typeId,slot:"mainhand"}:undefined;
        if(!selected && offhandItem && totems[offhandItem.typeId]) selected={typeId:offhandItem.typeId,slot:"offhand"};
        if(!selected) {
            const eonIndex=Array.from({length:bag?.size??0},(_,i)=>i).find(i=>bag.getItem(i)?.typeId==="pavi:totem_eon");
            if(eonIndex!==undefined)selected={typeId:"pavi:totem_eon",slot:eonIndex};
        }
        if(selected) {
            event.cancel=true;
            pendingTotemPops.add(p.id);
            system.run(()=>safe(()=>{
                try {
                    if(!p.isValid || !livingPlayer(p))return;
                    const liveBag=inventory(p), liveGear=p.getComponent("minecraft:equippable");
                    let item,container,slot;
                    if(selected.slot==="mainhand") {container=liveBag;slot=p.selectedSlotIndex;item=container?.getItem(slot);}
                    else if(selected.slot==="offhand") {item=liveGear?.getEquipment("Offhand");}
                    else {container=liveBag;slot=selected.slot;item=container?.getItem(slot);}
                    if(item?.typeId!==selected.typeId) return;
                    if(selected.slot==="offhand") liveGear.setEquipment("Offhand",item.amount>1?(item.amount--,item):undefined);
                    else if(item.amount>1) {item.amount--;container.setItem(slot,item);}
                    else container.setItem(slot,undefined);

                    const kind=totems[selected.typeId].kind;
                    const health=p.getComponent("minecraft:health");
                    if(kind==="limbo") {
                        // Drop temporary extra heart slots, then survive at one health without healing.
                        safe(()=>p.removeEffect("health_boost"));
                        safe(()=>p.removeEffect("absorption"));
                    }
                    health.setCurrentValue(Math.min(1,health.effectiveMax));
                    if(kind==="nutrition") {
                        const hunger=p.getComponent("minecraft:player.hunger");
                        const saturation=p.getComponent("minecraft:player.saturation");
                        if(hunger)safe(()=>hunger.setCurrentValue(hunger.effectiveMax));
                        if(saturation)safe(()=>saturation.setCurrentValue(saturation.effectiveMax));
                    }
                    if(kind==="eon")ownedEffect(p,"resistance",1,0);
                    if(active("zombification"))p.setDynamicProperty("pavi_zombification_seconds",180);
                    safe(()=>p.dimension.spawnParticle("minecraft:totem_particle",p.location));
                    safe(()=>p.playSound("totem.use"));
                    world.sendMessage(`§6${p.name} consumió ${totems[selected.typeId].name}`);
                } finally {pendingTotemPops.delete(p.id);}
            }));
        }
    }
    if(!active("zombification") || !livingPlayer(p))return;
    if(event.damage<p.getComponent("minecraft:health").currentValue)return;
    const gear=p.getComponent("minecraft:equippable");
    const totemSlot=["Mainhand","Offhand"].find(slot=>gear?.getEquipment(slot)?.typeId==="minecraft:totem_of_undying");
    if(!totemSlot)return;
    system.runTimeout(()=>safe(()=>{
        if(livingPlayer(p) && gear.getEquipment(totemSlot)?.typeId!=="minecraft:totem_of_undying")p.setDynamicProperty("pavi_zombification_seconds",180);
    }),2);
});
system.runInterval(()=>{
    for(const p of world.getPlayers())safe(()=>{
        inspectItems(p);
        if(!livingPlayer(p))return;
        if(p.isSleeping)p.setDynamicProperty("pavi_insomnia_seconds",0);
        else if(active("insomnia"))p.setDynamicProperty("pavi_insomnia_seconds",Number(p.getDynamicProperty("pavi_insomnia_seconds")??0)+1);
        if(active("zombification")) {
            const time=remaining(p)-1;
            p.setDynamicProperty("pavi_zombification_seconds",time);
            if(time<=0) {p.setDynamicProperty("pavi_zombification_seconds",180);hurt(p,1000000,"magic");}
        } else if(p.getDynamicProperty("pavi_zombification_seconds")!==undefined)p.setDynamicProperty("pavi_zombification_seconds",undefined);
        if(held(p)?.typeId==="pavi:linterna") {
            // Actual raycast respects walls and needs the player to aim at the eye.
            const hit=p.getEntitiesFromViewDirection({maxDistance:24})[0]?.entity;
            if(hit?.typeId==="pavi:ojo_volador") {
                const health=hit.getComponent("minecraft:health");
                if(health.currentValue<=6)hit.kill();else health.setCurrentValue(health.currentValue-6);
                safe(()=>p.dimension.spawnParticle("minecraft:endrod",hit.location));
            }
        }
    });
},20);
world.afterEvents.playerLeave.subscribe(({playerId})=>{
    pendingRitual.delete(playerId);
    toolCooldown.delete(playerId+":speaker");
    pendingTotemPops.delete(playerId);
});
