import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
// This is an explicit contract fixture, NOT a dump of the production schema.
const base=`
create role anon;create role authenticated;
create type public.status_matricula as enum ('ativa','encerrada','transferida','cancelada');
create type public.status_presenca as enum ('presente','ausente');
create schema auth;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
create table public.perfis(id uuid primary key,nome text,papel text,status text,professora_id uuid);
create table public.professoras(id uuid primary key default gen_random_uuid(),nome text,telefone text,foto_url text,status text);
create table public.modalidades(id uuid primary key default gen_random_uuid(),nome text);
create table public.turmas(id uuid primary key default gen_random_uuid(),nome text,modalidade_id uuid,dia_semana int,horario time,professora_id uuid,status text,limite_alunos int,observacao text);
create table public.alunas(id uuid primary key default gen_random_uuid(),nome text,telefone text,email text,endereco text,data_nascimento date,cpf text,rg text,foto_url text,responsavel_nome text,responsavel_cpf text,responsavel_telefone text,responsavel_parentesco text,menor bool,status text);
create table public.matriculas_turmas(id uuid primary key default gen_random_uuid(),aluna_id uuid,turma_id uuid,inicio_em date,fim_em date,status public.status_matricula);
create table public.financeiro(id uuid primary key default gen_random_uuid(),aluna_id uuid,tipo text,descricao text,valor numeric,vencimento date,status text,pago_em timestamptz,forma_pagamento text);
create table public.eventos(id uuid primary key default gen_random_uuid(),nome text,data date,local text,observacao text,turma_id uuid);
create table public.datas_comemorativas(id uuid primary key default gen_random_uuid(),nome text,data date,observacao text,ativo bool);
create table public.aulas(id uuid primary key default gen_random_uuid(),turma_id uuid,data date);
create table public.presencas(id uuid primary key default gen_random_uuid(),aula_id uuid,aluna_id uuid,status public.status_presenca);
grant select,insert,update on all tables in schema public to authenticated;
`;
const migration=fs.readFileSync(new URL('../supabase/migrations/202609230001_fenix_persistencia.sql',import.meta.url),'utf8');
const admin='00000000-0000-4000-8000-000000000001', teacher='00000000-0000-4000-8000-000000000002',tid='00000000-0000-4000-8000-000000000003',cid='00000000-0000-4000-8000-000000000004',sid='00000000-0000-4000-8000-000000000005',eventId='00000000-0000-4000-8000-000000000006';
let db;
async function as(uid){await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[uid||'']);await db.exec('set role authenticated');}
async function save(table,id,data,version=0,links=null){return (await db.query('select public.fenix_salvar_registro($1,$2,$3,$4,$5) as result',[table,id,JSON.stringify(data),version,links===null?null:JSON.stringify(links)])).rows[0].result;}
test('Database contract and safety tests',async t=>{
 db=new PGlite();await db.exec(base);await db.exec(migration);
 await db.query('insert into perfis values($1,\'Admin\',\'admin\',\'ativo\',null),($2,\'Teacher\',\'professora\',\'ativo\',$3)',[admin,teacher,tid]);
 await db.query('insert into professoras(id,nome,status) values($1,\'Teacher\',\'ativo\')',[tid]);
 await db.query('insert into turmas(id,nome,professora_id,status) values($1,\'Ballet\',$2,\'ativo\')',[cid,tid]);
 await as(admin);
 await t.test('RPC creates and updates without duplicate',async()=>{let r=await save('alunas',sid,{nome:'Sintética',dados_fenix:{mensalidade:255,obs:'Inicial'}},0,{turmas:[cid]});assert.equal(r.fenix_version,1);r=await save('alunas',sid,{nome:'Atualizada',dados_fenix:{mensalidade:335,obs:'Inicial'}},1);assert.equal(r.fenix_version,2);assert.equal((await db.query('select count(*)::int as n from alunas')).rows[0].n,1);});
 await t.test('Optimistic conflict preserves newer value',async()=>{await assert.rejects(save('alunas',sid,{nome:'antiga'},1),/mudou/);assert.equal((await db.query('select nome from alunas where id=$1',[sid])).rows[0].nome,'Atualizada');});
 await t.test('Student and links roll back together',async()=>{await assert.rejects(save('alunas',sid,{nome:'rollback'},2,{turmas:['00000000-0000-4000-8000-999999999999']}));assert.equal((await db.query('select nome from alunas where id=$1',[sid])).rows[0].nome,'Atualizada');});
 await t.test('Removing enrollment retains historical record',async()=>{await save('alunas',sid,{nome:'Atualizada'},2,{turmas:[]});const r=(await db.query('select * from matriculas_turmas')).rows;assert.equal(r.length,1);assert.equal(r[0].status,'encerrada');await save('alunas',sid,{nome:'Atualizada'},3,{turmas:[cid]});});
 await t.test('Table/field injection rejected',async()=>{await assert.rejects(save('perfis',admin,{papel:'admin'}),/permitido/);await assert.rejects(save('alunas',sid,{id:admin},4),/permitido/);});
 await t.test('Unauthenticated caller denied',async()=>{await as(null);await assert.rejects(save('eventos',eventId,{nome:'No'}),/Autenticação/);await as(admin);});
 await t.test('Teacher denied finance and permits own observation only',async()=>{await as(teacher);await assert.rejects(save('financeiro',eventId,{valor:1}),/administrativa/);await assert.rejects(save('alunas',sid,{nome:'No'},4),/Somente/);const r=await save('alunas',sid,{dados_fenix:{obs:'Adaptação'}},4);assert.equal(r.fenix_version,5);const row=(await db.query('select dados_fenix from alunas where id=$1',[sid])).rows[0];assert.equal(row.dados_fenix.mensalidade,335);assert.equal(row.dados_fenix.obs,'Adaptação');});
 await t.test('Attendance saves lesson and justified status atomically',async()=>{const r=await save('aulas',eventId,{turma_id:cid,data:'2026-09-23',dados_fenix:{obs:'Aula'}},0,{presencas:[{aluna_id:sid,status:'ausente',dados_fenix:{status:'Falta justificada'}}]});assert.equal(r.fenix_version,1);const row=(await db.query('select * from presencas')).rows[0];assert.equal(row.dados_fenix.status,'Falta justificada');await assert.rejects(save('aulas',eventId,{turma_id:cid,data:'2026-09-24'},1,{presencas:[{aluna_id:admin,status:'presente',dados_fenix:{status:'Presente'}}]}),/matriculada/);assert.equal((await db.query('select data::text from aulas')).rows[0].data,'2026-09-23');});
 await t.test('Existing RLS denial is not bypassed by RPC',async()=>{await db.exec('reset role; alter table eventos enable row level security;');await as(admin);await assert.rejects(save('eventos','00000000-0000-4000-8000-000000000010',{nome:'Blocked'}),/row.level security/i);});
 await db.close();
});
