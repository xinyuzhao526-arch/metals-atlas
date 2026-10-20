import {main as copper} from "./update-inventories.mjs";
import {main as metals} from "./update-metal-inventories.mjs";
const results=await Promise.allSettled([copper(),metals()]);
for(let i=0;i<results.length;i++)if(results[i].status==="rejected")console.warn(`${i===0?"Copper":"Additional metals"}: ${results[i].reason}`);
if(results.every(x=>x.status==="rejected"))process.exitCode=1;
