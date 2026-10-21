import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from './harness.mjs';
test('Card uses the selected class and teacher nickname without changing confirmation',async()=>{
 const t=app();
 try{
  t.a.db.teachers=[{id:7,nome:'Professora completa',apelido:'Alê'}];
  const drawn=[];
  t.w.Image=class{async decode(){}};
  const context={drawImage(){},measureText(v){return {width:v.length*15}},fillText(...args){drawn.push(args)}};
  t.w.HTMLCanvasElement.prototype.getContext=()=>context;
  t.w.HTMLCanvasElement.prototype.toDataURL=()=> 'synthetic-image';
  t.w.testClass={nome:'Ana de teste',modalidade:'Ballet',data:'2026-10-28',hora:'18:00',profId:7,status:'Agendada',confirmacao:''};
  const result=await t.w.eval('gerarCardExperimental(window.testClass)');
  assert.equal(result,'synthetic-image');
  assert.deepEqual(drawn.map(v=>v[0]),['Ana de teste','Ballet','28/10/2026','18:00','Alê']);
  assert.equal(t.w.testClass.status,'Agendada');assert.equal(t.w.testClass.confirmacao,'');
 }finally{t.close()}
});
