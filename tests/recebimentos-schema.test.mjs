import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('Existing production schema supports partner receipts and recoverable enrollment exclusion without deleting finance',async()=>{
 const db=new PGlite();try{
 await db.exec(fs.readFileSync(new URL('./schema-export.sql',import.meta.url),'utf8'));await db.exec(fs.readFileSync(new URL('../supabase/migrations/202609230001_fenix_persistencia.sql',import.meta.url),'utf8'));
 const uid='00000000-0000-4000-8000-000000000001';await db.query('insert into auth.users values($1)',[uid]);await db.query("insert into perfis(id,nome,papel,status) values($1,'Admin teste','admin','ativo')",[uid]);
 const sid=(await db.query("insert into alunas(nome) values('Aluna teste') returning id")).rows[0].id;
 const mid=(await db.query("insert into modalidades(nome) values('Ballet') returning id")).rows[0].id;
 const tid=(await db.query("insert into turmas(nome,modalidade_id,dia_semana,horario) values('Ballet teste',$1,1,'18:00') returning id",[mid])).rows[0].id;
 await db.query("insert into matriculas_turmas(aluna_id,turma_id,status) values($1,$2,'ativa')",[sid,tid]);
 await db.query("insert into financeiro(aluna_id,tipo,descricao,valor,status) values($1,'mensalidade','2026-10',255,'pago')",[sid]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
 await db.query("select fenix_salvar_registro('financeiro',gen_random_uuid(),$1,0,null)",[JSON.stringify({aluna_id:null,tipo:'entrada',descricao:'Wellhub',valor:237.45,status:'pago',pago_em:'2026-10-22T12:00:00-03:00',dados_fenix:{outroRecebimento:true,origem:'Wellhub'}})]);
 await db.query("select fenix_salvar_registro('alunas',$1,$2,0,$3)",[sid,JSON.stringify({status:'inativo',dados_fenix:{matriculaExcluidaEm:'2026-10-22T12:00:00Z'}}),JSON.stringify({turmas:[]})]);
 assert.equal((await db.query('select count(*)::int n from financeiro')).rows[0].n,2);assert.equal((await db.query('select status from matriculas_turmas where aluna_id=$1',[sid])).rows[0].status,'encerrada');
 await db.query("select fenix_salvar_registro('alunas',$1,$2,1,$3)",[sid,JSON.stringify({status:'ativo',dados_fenix:{}}),JSON.stringify({turmas:[tid]})]);
 assert.equal((await db.query("select count(*)::int n from matriculas_turmas where aluna_id=$1 and status='ativa'",[sid])).rows[0].n,1);
 assert.equal((await db.query("select valor::text from financeiro where aluna_id is null")).rows[0].valor,'237.45');
 }finally{await db.close();}
});
