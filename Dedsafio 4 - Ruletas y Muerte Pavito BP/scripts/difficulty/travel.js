import { system, world } from "@minecraft/server";
import { isAdmin, sendAdminMessage } from "../admin.js";
import { safe, ownedEffect } from "./util.js";
import { getRegion } from "./regions.js";

const maze={x:2048,y:180,z:2048,size:31};
const travelers=new Set();
let building=false, ready=false;
system.run(()=>{ready=world.getDynamicProperty("pavi_day_maze_v1")===true;});
export async function banishToLimbo(player) {
    if (travelers.has(player.id)) return;
    travelers.add(player.id);
    try {
        const destination=world.getDimension("pavi:limbo");
        const old={dimension:player.dimension.id,...player.location};
        if (old.dimension!=="pavi:limbo") player.setDynamicProperty("pavi_banish_return",JSON.stringify(old));
        const configured=getRegion("maze");
        if (configured?.dimension==="pavi:limbo") {
            player.teleport({x:configured.x,y:configured.y??70,z:configured.z},{dimension:destination});
            return;
        }
        const arrival={x:maze.x+1.5,y:maze.y+2,z:maze.z+1.5};
        player.teleport(arrival,{dimension:destination});
        ownedEffect(player,"slow_falling",8);
        ownedEffect(player,"resistance",8,4);
        if (!ready && !building) {
            building=true;
            system.runTimeout(()=>system.runJob(buildMaze(destination,player)),10);
        }
    } catch(error) { sendAdminMessage(player,"§cNo se pudo abrir el Limbo: "+error); }
    finally { system.runTimeout(()=>travelers.delete(player.id),100); }
}
export function makeMaze(size=31,random=Math.random) {
    const cells=Array.from({length:size},()=>Array(size).fill(1));
    const stack=[[1,1]]; cells[1][1]=0;
    while(stack.length) {
        const [x,z]=stack[stack.length-1];
        const neighbors=[[2,0],[-2,0],[0,2],[0,-2]].filter(([dx,dz])=>x+dx>0&&z+dz>0&&x+dx<size-1&&z+dz<size-1&&cells[z+dz][x+dx]);
        if (!neighbors.length) {stack.pop();continue;}
        const [dx,dz]=neighbors[Math.floor(random()*neighbors.length)];
        cells[z+dz/2][x+dx/2]=0;cells[z+dz][x+dx]=0;stack.push([x+dx,z+dz]);
    }
    return cells;
}
function* buildMaze(dim,player) {
    try {
        const cells=makeMaze(maze.size);
        dim.runCommand(`fill ${maze.x} ${maze.y} ${maze.z} ${maze.x+30} ${maze.y} ${maze.z+30} minecraft:deepslate_tiles`);
        yield;
        // Clear one row per tick; the full generator does not block the watchdog.
        for(let z=0;z<31;z++) {
            dim.runCommand(`fill ${maze.x} ${maze.y+1} ${maze.z+z} ${maze.x+30} ${maze.y+4} ${maze.z+z} minecraft:air`);
            yield;
            for(let x=0;x<31;x++) {
                if(cells[z][x]) dim.runCommand(`fill ${maze.x+x} ${maze.y+1} ${maze.z+z} ${maze.x+x} ${maze.y+3} ${maze.z+z} minecraft:polished_blackstone_bricks`);
                yield;
            }
        }
        dim.runCommand(`fill ${maze.x} ${maze.y+4} ${maze.z} ${maze.x+30} ${maze.y+4} ${maze.z+30} minecraft:deepslate_tiles`);
        dim.runCommand(`setblock ${maze.x+29} ${maze.y} ${maze.z+29} minecraft:sea_lantern`);
        world.setDynamicProperty("pavi_day_maze_v1",true);ready=true;
    } catch(error) { sendAdminMessage(player,"§cEl laberinto no terminó de generarse: "+error); }
    finally {building=false;}
}
system.runInterval(()=>{
    if (!ready) return;
    for(const p of world.getPlayers()) {
        if(p.dimension.id!=="pavi:limbo" || Math.hypot(p.location.x-maze.x-29.5,p.location.z-maze.z-29.5)>1.1 || Math.abs(p.location.y-maze.y-1)>3) continue;
        safe(()=>{
            const saved=p.getDynamicProperty("pavi_banish_return");
            if(typeof saved!=="string") return;
            const destination=JSON.parse(saved);
            p.teleport(destination,{dimension:world.getDimension(destination.dimension)});
            p.setDynamicProperty("pavi_banish_return",undefined);
        });
    }
},20);
