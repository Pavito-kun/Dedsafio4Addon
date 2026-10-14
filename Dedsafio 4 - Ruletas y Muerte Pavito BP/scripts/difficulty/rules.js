import { EnchantmentTypes, EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import { active } from "./state.js";
import { adjustedDamage, spiderStrength, zombieTool } from "./rule_math.js";
import { safe, livingPlayer, blockAt, forLoadedEntities, inventory, hurt, dropRandomSlot, wall, ownedEffect } from "./util.js";
import { inRegion } from "./regions.js";
import { spawnOwned } from "./spawning.js";
import { customEffect } from "./effects.js";
import { isMomentRevilActive } from "../revil.js";
import { banishToLimbo } from "./travel.js";

const animals=new Set(["cow","mooshroom","pig","sheep","chicken","rabbit","horse","donkey","mule","llama","trader_llama","goat","camel","armadillo","sniffer","wolf","cat","ocelot","parrot","panda","fox","polar_bear","turtle","dolphin","squid","glow_squid","cod","salmon","tropicalfish","pufferfish","bee","axolotl","frog"].map(t=>"minecraft:"+t));
const meat=new Set(["beef","cooked_beef","porkchop","cooked_porkchop","mutton","cooked_mutton","chicken","cooked_chicken","rabbit","cooked_rabbit","cod","cooked_cod","salmon","cooked_salmon","tropical_fish","pufferfish"].map(t=>"minecraft:"+t));
const underwater = new Map();
const fireOwned = new Set();
const zombieEquipment = new Map();
const celestialCooldown = new Map();
const skeletons = new Set(["minecraft:skeleton","minecraft:stray","minecraft:bogged","minecraft:wither_skeleton"]);
const spider = e => ["minecraft:spider","minecraft:cave_spider"].includes(e.typeId);

world.beforeEvents.entityHurt?.subscribe(event=>{
    if (!livingPlayer(event.hurtEntity)) return;
    const source=event.damageSource;
    event.damage=adjustedDamage(event.damage,source.cause,source.damagingEntity?.typeId,active);
});
world.afterEvents.entityHurt.subscribe(event=>{
    const p=event.hurtEntity, attacker=event.damageSource.damagingEntity;
    if (!livingPlayer(p)) return;
    if (active("nether_fire") && p.dimension.id==="minecraft:nether" && ["fire","fireTick","lava"].includes(event.damageSource.cause)) {
        p.setDynamicProperty("pavi_eternal_fire",true);
    }
    if (attacker && skeletons.has(attacker.typeId) && active("skeleton_swap")) {
        safe(()=>{
            p.removeEffect("fire_resistance");
            dropRandomSlot(p);
            const a={...attacker.location}, b={...p.location}, dim=p.dimension;
            if (attacker.dimension.id!==dim.id) return;
            if (p.tryTeleport(a,{checkForBlocks:true})) attacker.tryTeleport(b,{checkForBlocks:true});
        });
    }
    if (attacker && spider(attacker) && active("spider_web")) placeWeb(p.dimension,p.location);
});
function placeWeb(dim,loc) {
    safe(()=>{ const block=dim.getBlock(loc); if (block?.isAir) block.setType("minecraft:web"); });
}
world.beforeEvents.playerInteractWithBlock.subscribe(event=>{
    if (active("deadly_interaction") && /(_door|_button)$/.test(event.block.typeId) && livingPlayer(event.player)) {
        system.run(()=>hurt(event.player,1000000,"override"));
    }
});
world.afterEvents.pressurePlatePush?.subscribe(event=>{
    if (active("deadly_interaction") && livingPlayer(event.source)) hurt(event.source,1000000,"override");
});
world.afterEvents.entityDie.subscribe(event=>{
    const e=event.deadEntity;
    safe(()=>{
        if (e.typeId==="minecraft:warden" && active("warden_shrieker")) {
            const b=e.dimension.getBlock(e.location);
            if (b?.isAir || b?.isLiquid) b.setType("minecraft:sculk_shrieker");
        }
        if (spider(e) && active("spider_web")) placeWeb(e.dimension,e.location);
        if (e.typeId==="pavi:molusco_rocoso" && active("mollusc_scrap") && inRegion("qumara",e) && Math.random()<.25) {
            e.dimension.spawnItem(new ItemStack("minecraft:netherite_scrap"),e.location);
        }
        if (e.typeId==="pavi:kragtop" && active("kragtops")) e.dimension.spawnItem(new ItemStack("pavi:manzana_ambar"),e.location);
        if (e.typeId==="pavi:vindicador_limbo") e.dimension.spawnItem(new ItemStack("minecraft:golden_apple"),e.location);
        if (e.typeId==="pavi:parasito_volador" && active("parasite_explosion")) e.dimension.createExplosion(e.location,2,{breaksBlocks:false,causesFire:false});
    });
    zombieEquipment.delete(e.id);
});
world.afterEvents.playerBreakBlock.subscribe(event=>{
    const id=event.brokenBlockPermutation.type.id, loc={...event.block.location,x:event.block.x+.5,z:event.block.z+.5};
    if (active("cobweb_spiders") && ["minecraft:web","minecraft:cobweb"].includes(id) && Math.random()<.3) spawnOwned("minecraft:cave_spider",event.dimension,loc,"cobweb_spiders");
    if (active("gusano_carne") && ["pavi:grasa_liquida","pavi:grasa_coagulada"].includes(id) && Math.random()<.5) spawnOwned("pavi:gusano_carne",event.dimension,loc,"gusano_carne");
    if (active("parasito_volador") && ["pavi:verruga_clara","pavi:verruga_oscura"].includes(id)) spawnOwned("pavi:parasito_volador",event.dimension,loc,"parasito_volador");
});
world.afterEvents.itemCompleteUse.subscribe(({source,itemStack})=>{
    if (active("no_absorption") && ["minecraft:golden_apple","minecraft:enchanted_golden_apple"].includes(itemStack.typeId)) {
        system.run(()=>safe(()=>source.removeEffect("absorption")));
        system.runTimeout(()=>safe(()=>source.removeEffect("absorption")),3);
    }
});

function waterAtHead(p) {
    const head=p.getHeadLocation(), block=blockAt(p.dimension,head);
    if (block?.typeId.includes("water") || safe(()=>block?.isWaterlogged)) return true;
    if (!active("no_door_air") || !/(door|trapdoor)/.test(block?.typeId??"")) return false;
    return [[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>blockAt(p.dimension,{x:head.x+x,y:head.y,z:head.z+z})?.typeId.includes("water"));
}
function checkPlayer(p) {
    if (!livingPlayer(p)) {underwater.delete(p.id);return;}
    const nether=p.dimension.id==="minecraft:nether";
    const gear=p.getComponent("minecraft:equippable");
    const missingArmor=!["Head","Chest","Legs","Feet"].every(slot=>gear?.getEquipment(slot));
    const fire=(nether && active("nether_armor") && missingArmor) || (nether && active("nether_fire") && p.getDynamicProperty("pavi_eternal_fire")===true);
    if (fire) { p.setOnFire(3,true); fireOwned.add(p.id); }
    else if (fireOwned.delete(p.id)) safe(()=>p.extinguishFire());
    if (!active("nether_fire")) p.setDynamicProperty("pavi_eternal_fire",undefined);
    if (active("high_gas") && p.dimension.id==="minecraft:overworld" && p.location.y>150 && !inRegion("mountain",p)) {
        const vehicle=safe(()=>p.getComponent("minecraft:riding")?.entityRidingOn);
        if (vehicle?.typeId!=="pavi:nave_espacial") hurt(p,4,"magic");
    }
    if ((active("drowning") || active("no_door_air")) && waterAtHead(p) && !p.getEffect("water_breathing") && !p.getEffect("conduit_power")) {
        const seconds=(underwater.get(p.id)??0)+1; underwater.set(p.id,seconds);
        // Script API exposes totalSupply read-only. Simulated air controls the damage deadline.
        if (seconds>=(active("drowning")?3:15)) hurt(p,2,"drowning");
    } else underwater.delete(p.id);
    if (active("rotten_meat")) {
        const bag=inventory(p);
        if (bag) for(let i=0;i<bag.size;i++) {
            const stack=bag.getItem(i);
            if (stack && meat.has(stack.typeId)) bag.setItem(i,new ItemStack("minecraft:rotten_flesh",stack.amount));
        }
    }
    if (active("smell") && p.getEffect("invisibility")) {
        // Preserve invisibility against other players. Mobs receive a provocation pulse.
        for (const mob of safe(()=>p.dimension.getEntities({families:["monster"],location:p.location,maxDistance:24}))??[]) {
            if (!safe(()=>mob.hasTag("pavi:scent"))) {
                safe(()=>{
                    mob.applyDamage(.01,{cause:"magic",damagingEntity:p});
                    mob.addTag("pavi:scent");
                    system.runTimeout(()=>safe(()=>mob.removeTag("pavi:scent")),100);
                });
            }
        }
    }
    celestial(p);
}
function celestial(p) {
    if (p.dimension.id!=="minecraft:overworld" || system.currentTick<(celestialCooldown.get(p.id)??0)) return;
    const t=world.getTimeOfDay(), night=t>=12000;
    if (!(night?active("moon_limbo"):active("sun_vision"))) return;
    const angle=((t%12000)/12000)*Math.PI, view=p.getViewDirection();
    if (view.x*Math.cos(angle)+view.y*Math.sin(angle)<.985) return;
    if (safe(()=>p.getBlockFromViewDirection({maxDistance:128,includeLiquidBlocks:false,includePassableBlocks:false}))) return;
    celestialCooldown.set(p.id,system.currentTick+3600);
    if (night) banishToLimbo(p);
    else customEffect(p,"myopia",180,"sun_vision");
}
function checkMob(e) {
    safe(()=>{
        const owner=e.getDynamicProperty("pavi_difficulty_owner");
        if (owner && !active(owner)) { e.remove(); return; }
        if (animals.has(e.typeId) && active("animal_extinction")) {e.remove();return;}
        if (spider(e)) {
            if (active("spider_speed")) ownedEffect(e,"speed",1.5,2);
            const strength=spiderStrength(active);
            if (strength>=0) ownedEffect(e,"strength",1.5,strength);
        }
        if (skeletons.has(e.typeId) && active("skeleton_swap")) ownedEffect(e,"resistance",1.5,2);
        if (e.typeId!=="minecraft:zombie") return;
        if (active("zombie_swords") && wall(e)) e.applyImpulse({x:0,y:.25,z:0});
        const tool=zombieTool(active), previous=zombieEquipment.get(e.id);
        if (tool && previous?.tool!==tool) {
            const hand=e.getComponent("minecraft:equippable");
            const saved=previous?.saved ?? hand?.getEquipment(EquipmentSlot.Mainhand);
            const item=new ItemStack(tool);
            if (tool==="minecraft:iron_sword") safe(()=>item.getComponent("minecraft:enchantable").addEnchantment({type:EnchantmentTypes.get("sharpness"),level:5}));
            if (hand?.setEquipment(EquipmentSlot.Mainhand,item)) zombieEquipment.set(e.id,{tool,saved});
            else {
                // Vanilla mob equipment isn't exposed by every engine build.
                e.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${tool} 1`);
                if (tool==="minecraft:iron_sword") e.runCommand("enchant @s sharpness 5");
                zombieEquipment.set(e.id,{tool,saved,command:true});
            }
        } else if (!tool && previous) {
            if (previous.command) e.runCommand("replaceitem entity @s slot.weapon.mainhand 0 minecraft:air");
            else e.getComponent("minecraft:equippable")?.setEquipment(EquipmentSlot.Mainhand,previous.saved);
            zombieEquipment.delete(e.id);
        }
        if (active("zombie_mining") && isMomentRevilActive() && world.gameRules.mobGriefing) {
            const target=safe(()=>e.dimension.getPlayers({location:e.location,maxDistance:16}).find(livingPlayer));
            if (!target) return;
            const dx=Math.sign(target.location.x-e.location.x),dz=Math.sign(target.location.z-e.location.z);
            const p={x:e.location.x+dx,y:e.location.y+1,z:e.location.z+dz},block=blockAt(e.dimension,p);
            if (block?.isSolid && !block.getComponent("minecraft:inventory") && !["minecraft:bedrock","minecraft:barrier","minecraft:command_block","minecraft:chain_command_block","minecraft:repeating_command_block","minecraft:ender_chest"].includes(block.typeId)) block.setType("minecraft:air");
            if (target.location.y>e.location.y+2) {
                const below=blockAt(e.dimension,{...e.location,y:e.location.y-1});
                if (below?.isAir) below.setType("minecraft:cobblestone");
                e.applyImpulse({x:0,y:.4,z:0});
            }
        }
    });
}
// Stagger players across ticks. Entity scan is deduplicated and restricted to loaded neighborhoods.
system.runInterval(()=>{
    const players=world.getPlayers();
    players.forEach((p,i)=>system.runTimeout(()=>safe(()=>checkPlayer(p)),i%20));
    forLoadedEntities(checkMob);
},20);
world.afterEvents.entitySpawn.subscribe(({entity})=>system.run(()=>checkMob(entity)));
world.afterEvents.playerLeave.subscribe(({playerId})=>{underwater.delete(playerId);fireOwned.delete(playerId);celestialCooldown.delete(playerId);});
