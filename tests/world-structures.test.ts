import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../lib/world';
import { firstCastle, describeCastle } from '../lib/castles';

test('The open castle courtyard is named as a landmark even when built into a high mountainside',()=>{
  const world=new World(24680);
  const castle=describeCastle(firstCastle(world.seed),(x,z)=>world.height(x,z));
  assert.equal(world.biomeAt(castle.x,castle.y,castle.z),castle.name);
  world.dimension='nether';
  assert.equal(world.biomeAt(castle.x,castle.y,castle.z),'Pustkowia Netheru');
});
test('Naturally generated village beds have a pillow half and foot half inside each house',()=>{
  const world=new World(24680);
  for(const [x,z] of [[-7,-2],[7,-8],[-10,-17]]){
    const y=world.height(x,z)+1;
    world.chunk(Math.floor((x+4)/16),Math.floor((z+2)/16));
    world.chunk(Math.floor((x+4)/16),Math.floor((z+3)/16));
    assert.equal(world.get(x+4,y,z+2),194);
    assert.equal(world.get(x+4,y,z+3),190);
    assert.equal(world.solid(x+4.5,y+.8,z+2.5),false);
  }
});
