import { system, world } from "@minecraft/server";
import { active } from "./state.js";
import { safe, livingPlayer, hurt, ownedEffect, distance } from "./util.js";

const effects = new Map();
export function customEffect(player, kind, seconds, sourceKey) {
    let state=effects.get(player.id);
    if (!state) { state=new Map(); effects.set(player.id,state); }
    state.set(kind,{ end:system.currentTick+seconds*20,sourceKey,changes:0,lastDirection:"",nextPulse:system.currentTick });
    if (["cake","ink","glitch","myopia"].includes(kind)) {
        // Only titles are routed; vanilla actionbar and Reviil timer remain unchanged.
        safe(()=>player.onScreenDisplay.setTitle("pavi_fx:"+kind,{
            fadeInDuration:2,stayDuration:Math.min(200,seconds*20),fadeOutDuration:10
        }));
    }
    if (kind==="flash") safe(()=>player.camera.fade({fadeColor:{red:1,green:1,blue:1},fadeTime:{fadeInTime:.1,holdTime:2,fadeOutTime:2}}));
}
export function hasCustomEffect(player,kind) {
    return (effects.get(player.id)?.get(kind)?.end ?? 0)>system.currentTick;
}
export function clearCustomEffects(player) { effects.delete(player.id); }
function clearOne(player,kind) {
    if (kind==="root") safe(()=>player.removeEffect("slowness"));
    if (kind==="primal" || kind==="glitch") safe(()=>player.removeEffect("nausea"));
    if (kind==="myopia") safe(()=>player.removeEffect("blindness"));
}
system.runInterval(()=>{
    for (const p of world.getPlayers()) {
        const state=effects.get(p.id);
        if (!state) continue;
        for (const [kind,effect] of state) {
            if (!livingPlayer(p) || effect.end<=system.currentTick || (effect.sourceKey && !active(effect.sourceKey))) {
                state.delete(kind); clearOne(p,kind); continue;
            }
            if (kind==="root") {
                // Direction changes also work with touch controls and analog sticks.
                const input=safe(()=>p.inputInfo.getMovementVector()) ?? {x:0,y:0};
                const direction=Math.abs(input.x)>Math.abs(input.y)?(input.x>.25?"R":input.x<-.25?"L":""):(input.y>.25?"F":input.y<-.25?"B":"");
                if (direction && direction!==effect.lastDirection) effect.changes++;
                effect.lastDirection=direction;
                if (effect.changes>=8) { state.delete(kind); clearOne(p,kind); continue; }
                ownedEffect(p,"slowness",.6,6);
            }
            if (kind==="primal" || kind==="glitch") ownedEffect(p,"nausea",1,0);
            if (kind==="myopia") ownedEffect(p,"blindness",1,0);
            if (kind==="primal" && system.currentTick>=effect.nextPulse) {
                effect.nextPulse=system.currentTick+20;
                hurt(p,1,"magic");
            }
        }
        if (!state.size) effects.delete(p.id);
    }
},5);
world.afterEvents.playerLeave.subscribe(({playerId})=>effects.delete(playerId));
world.afterEvents.playerSpawn.subscribe(({player})=>clearCustomEffects(player));
