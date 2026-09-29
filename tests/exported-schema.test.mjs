import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
test('Migration and admin event tested with exported columns, constraints, triggers and RLS',async()=>{
 const db=new PGlite();
 try {
 await db.exec(read('./schema-export.sql'));
 await db.exec(read('../supabase/migrations/202609230001_fenix_persistencia.sql'));
 await db.exec(read('../supabase/migrations/202609230002_acesso_professoras.sql'));
 const uid='00000000-0000-4000-8000-000000000001';
 await db.query('insert into auth.users values ($1)',[uid]);
 await db.query("insert into perfis(id,nome,papel,status) values ($1,'Teste','admin','ativo')",[uid]);
 const mod=(await db.query("insert into modalidades(nome) values ('Teste') returning id")).rows[0].id;
 const turma=(await db.query("insert into turmas(nome,modalidade_id,dia_semana,horario) values ('Teste',$1,1,'18:00') returning id",[mod])).rows[0].id;
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
 const save=(data)=>db.query("select fenix_salvar_registro('eventos',gen_random_uuid(),$1,0,null)",[JSON.stringify(data)]);
 await assert.rejects(save({nome:'Sem turma',data:'2026-10-10'}),/null value/i);
 await save({nome:'Evento',data:'2026-10-10',turma_id:turma});
 assert.equal((await db.query('select count(*)::int n from eventos')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from fenix_auditoria')).rows[0].n,1);
 await db.exec('reset role; set role anon');
 await assert.rejects(db.query('select * from financeiro_atualizado'),/permission denied/);
 } finally {await db.close();}
});

test('Exported RLS permits scoped teacher observations and lessons through narrow functions',async()=>{
 const db=new PGlite();
 try{
  await db.exec(read('./schema-export.sql'));
  await db.exec(read('../supabase/migrations/202609230001_fenix_persistencia.sql'));
  await db.exec(read('../supabase/migrations/202609230002_acesso_professoras.sql'));
  const teacher='00000000-0000-4000-8000-000000000021', teacherRow='00000000-0000-4000-8000-000000000022';
  const mod='00000000-0000-4000-8000-000000000023', turma='00000000-0000-4000-8000-000000000024';
  const student='00000000-0000-4000-8000-000000000025', lesson='00000000-0000-4000-8000-000000000026';
  await db.query('insert into auth.users(id) values ($1)',[teacher]);
  await db.query("insert into professoras(id,nome) values($1,'Professora')",[teacherRow]);
  await db.query("insert into perfis(id,professora_id,nome,papel) values($1,$2,'Professora','professora')",[teacher,teacherRow]);
  await db.query("insert into modalidades(id,nome) values($1,'Ballet')",[mod]);
  await db.query("insert into turmas(id,nome,modalidade_id,dia_semana,horario,professora_id) values($1,'Turma',$2,1,'18:00',$3)",[turma,mod,teacherRow]);
  await db.query("insert into alunas(id,nome,dados_fenix) values($1,'Aluna','{\"mensalidade\":250}')",[student]);
  await db.query("insert into matriculas_turmas(aluna_id,turma_id) values($1,$2)",[student,turma]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);await db.exec('set role authenticated');
  await db.query("update alunas set nome='Invasão' where id=$1",[student]);
  assert.equal((await db.query('select nome from alunas where id=$1',[student])).rows[0].nome,'Aluna');
  await assert.rejects(db.query("insert into aulas(id,turma_id,data) values($1,$2,'2026-09-23')",[lesson,turma]),/row.level security/i);
  const obs=(await db.query('select fenix_salvar_observacao_professora($1,$2,0) result',[student,'Atenção à postura'])).rows[0].result;
  assert.equal(obs.fenix_version,1);
  assert.equal((await db.query('select dados_fenix from alunas where id=$1',[student])).rows[0].dados_fenix.mensalidade,250);
  await assert.rejects(db.query('select fenix_salvar_observacao_professora($1,$2,0)',[student,'Antiga']),/mudou/);
  const pres=[{aluna_id:student,status:'presente',dados_fenix:{status:'Presente'}}];
  const saved=(await db.query("select fenix_salvar_aula_professora($1,$2,'2026-09-23',0,$3,$4) result",[lesson,turma,JSON.stringify(pres),JSON.stringify({obs:'Aula'})])).rows[0].result;
  assert.equal(saved.fenix_version,1);
  assert.equal((await db.query('select count(*)::int n from presencas')).rows[0].n,1);
  await assert.rejects(db.query("select fenix_salvar_aula_professora($1,$2,'2026-09-24',1,'[]','{}')",[lesson,'00000000-0000-4000-8000-000000000099']),/Turma não vinculada/);
 }finally{await db.close();}
});

test('Experimental attendance RPC cannot edit another teacher or administrative fields',async()=>{
 const db=new PGlite();
 try{
  await db.exec(read('./schema-export.sql'));
  await db.exec(read('../supabase/migrations/202609280001_aulas_experimentais.sql'));
  await db.exec(read('../supabase/migrations/202609290001_resultados_experimentais.sql'));
  await db.exec(read('../supabase/migrations/202609290002_presenca_experimental_professora.sql'));
  const user='00000000-0000-4000-8000-000000000031',teacher='00000000-0000-4000-8000-000000000032',other='00000000-0000-4000-8000-000000000033';
  await db.query('insert into auth.users(id) values ($1)',[user]);
  await db.query("insert into professoras(id,nome) values($1,'A'),($2,'B')",[teacher,other]);
  await db.query("insert into perfis(id,professora_id,nome,papel) values($1,$2,'A','professora')",[user,teacher]);
  const rows=await db.query("insert into aulas_experimentais(nome,telefone,modalidade,data,horario,professora_id,dados_fenix) values('Visitante','11999999999','Ballet','2026-09-30','18:00',$1,'{\"confirmacao\":\"Confirmou\"}'),('Outra','11999999998','Ballet','2026-09-30','19:00',$2,'{}') returning id",[teacher,other]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
  await assert.rejects(db.query('select fenix_registrar_presenca_experimental($1,$2)',[rows.rows[1].id,'Compareceu']),/não vinculada/);
  await assert.rejects(db.query('select fenix_registrar_presenca_experimental($1,$2)',[rows.rows[0].id,'Fez matrícula']),/inválido/);
  const result=(await db.query('select fenix_registrar_presenca_experimental($1,$2) result',[rows.rows[0].id,'Compareceu'])).rows[0].result;
  assert.equal(result.presenca,'Compareceu');
  const saved=(await db.query('select dados_fenix from aulas_experimentais where id=$1',[rows.rows[0].id])).rows[0].dados_fenix;
  assert.deepEqual(saved,{confirmacao:'Confirmou',presenca:'Compareceu'});
 }finally{await db.close();}
});

test('Public contract token lookup preserves table privacy and recognizes acceptance',async()=>{
 const db=new PGlite();
 try{
  await db.exec(read('./schema-export.sql'));
  await db.exec(read('../supabase/migrations/202609290003_consulta_contrato_publico.sql'));
  const token='0123456789abcdef0123456789abcdef0123456789abcdef';
  const student=(await db.query("insert into alunas(nome) values('Teste') returning id")).rows[0].id;
  await db.query("insert into contratos(aluna_id,versao,conteudo,token_aceite) values($1,'1','Contrato de teste',$2)",[student,token]);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from contratos'),/permission denied/);
  const lookup=async t=>(await db.query('select fenix_consultar_contrato($1) result',[t])).rows[0].result;
  assert.deepEqual(await lookup(token),{conteudo:'Contrato de teste',status:'pendente',aceito_em:null});
  assert.equal(await lookup('invalido'),null);
  assert.equal(await lookup('ffffffffffffffffffffffffffffffff'),null);
  assert.equal((await db.query("select aceitar_contrato($1,'Aluna Teste','Documento Teste') result",[token])).rows[0].result,'aceito');
  const accepted=await lookup(token);
  assert.equal(accepted.status,'aceito');assert.ok(accepted.aceito_em);
  assert.deepEqual(Object.keys(accepted).sort(),['aceito_em','conteudo','status']);
 }finally{await db.close();}
});
