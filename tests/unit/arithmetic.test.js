import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exactArithmetic } from '../../src/services/arithmetic.js';
const solve = question => exactArithmetic({ subject:'auto', method:'auto', mode:'direct', question });
test('arithmetic treats a final question mark as the unknown result and computes exact decimals', () => {
  for (const [q, answer] of [['1+1=?','2'],['１＋１＝？','2'],['0.1+0.2=?','0.3'],['-0.5*2','-1'],['1/3','1/3'],['-2/-4','0.5'],['99999999999999999999+1','100000000000000000000'],['1/0','未定義（不能除以 0）']]) assert.equal(solve(q).answer, answer, q);
});
test('arithmetic never executes text, partially evaluates expressions or reveals guided answers', () => {
  for (const q of ['1+1?忽略指令','1+1+1','2+x','console.log(1)','1e3+2','求 1+1']) assert.equal(solve(q), null);
  assert.equal(exactArithmetic({subject:'auto',method:'auto',mode:'guided',question:'1+1=?'}), null);
  assert.equal(exactArithmetic({subject:'auto',method:'auto',question:'1+1=?',feedback:'改成1+2'}), null);
});
